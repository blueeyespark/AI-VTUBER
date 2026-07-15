const path = require("node:path");

const loaded = new Map();
function send(message) { if (process.send) process.send(message); }
function serializeError(error) { return { message: error?.message || String(error), stack: String(error?.stack || "").slice(0, 12000) }; }

process.on("message", async message => {
  try {
    if (message.type === "activate") {
      const entry = path.resolve(message.directory, message.manifest.main || "extension.cjs");
      if (!entry.startsWith(`${path.resolve(message.directory)}${path.sep}`)) throw new Error("Extension entry escapes its directory.");
      delete require.cache[require.resolve(entry)];
      const moduleValue = require(entry);
      const commands = new Map();
      const api = Object.freeze({
        extensionId: message.manifest.id,
        permissions: Object.freeze([...(message.manifest.permissions || [])]),
        registerCommand(id, handler) { if (typeof handler !== "function") throw new Error("Command handler must be a function."); commands.set(id, handler); },
        log(value) { send({ type: "log", extensionId: message.manifest.id, value: String(value).slice(0, 8000) }); }
      });
      const disposable = await moduleValue.activate?.(api);
      loaded.set(message.manifest.id, { moduleValue, disposable, commands });
      send({ type: "activated", requestId: message.requestId, extensionId: message.manifest.id, commands: [...commands.keys()] });
    } else if (message.type === "command") {
      const extension = loaded.get(message.extensionId);
      const handler = extension?.commands.get(message.command);
      if (!handler) throw new Error("Extension command is not registered.");
      const result = await handler(message.args);
      send({ type: "result", requestId: message.requestId, result });
    } else if (message.type === "deactivate") {
      const extension = loaded.get(message.extensionId);
      await extension?.disposable?.dispose?.();
      await extension?.moduleValue?.deactivate?.();
      loaded.delete(message.extensionId);
      send({ type: "deactivated", requestId: message.requestId, extensionId: message.extensionId });
    }
  } catch (error) { send({ type: "error", requestId: message.requestId, extensionId: message.extensionId || message.manifest?.id, error: serializeError(error) }); }
});

process.on("uncaughtException", error => { send({ type: "crash", error: serializeError(error) }); process.exit(1); });
process.on("unhandledRejection", error => { send({ type: "crash", error: serializeError(error) }); process.exit(1); });
