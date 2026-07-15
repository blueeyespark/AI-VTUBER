const { EventEmitter } = require("node:events");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ID = /^[a-z0-9][a-z0-9.-]{2,79}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const ALLOWED_PERMISSIONS = new Set(["workspace.read", "workspace.write", "network", "process", "settings"]);
const CONTRIBUTION_KEYS = ["commands", "views", "editors", "languages", "settings"];

function json(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(temporary, file); }
function major(version) { return Number(String(version || "0").split(".")[0]) || 0; }
function satisfiesVersion(actual, requested) {
  const range = String(requested || "*").trim();
  if (!range || range === "*") return true;
  if (range.startsWith("^")) return major(actual) === major(range.slice(1));
  if (/^\d+$/.test(range)) return major(actual) === Number(range);
  return String(actual) === range;
}

class BlueExtensionService extends EventEmitter {
  constructor(root, options = {}) {
    super();
    this.root = path.resolve(root);
    this.moduleRoot = path.resolve(options.moduleRoot || __dirname);
    this.blueVersion = options.blueVersion || "2.3.0";
    this.extensionsRoot = path.resolve(options.extensionsRoot || path.join(this.root, ".blue", "extensions"));
    this.registryFile = path.join(this.extensionsRoot, "registry.json");
    this.hostFile = path.join(this.moduleRoot, "extension-host.cjs");
    this.host = null;
    this.pending = new Map();
    this.sequence = 0;
    this.active = new Set();
    this.crashes = [];
  }

  validateManifest(value) {
    if (!value || !ID.test(String(value.id || ""))) throw new Error("Extension manifest requires a safe lowercase id.");
    if (!VERSION.test(String(value.version || ""))) throw new Error("Extension manifest requires a semantic version.");
    const manifest = {
      id: value.id, name: String(value.name || value.id).slice(0, 100), version: value.version,
      engines: { blue: String(value.engines?.blue || "2") }, main: String(value.main || "extension.cjs"),
      activationEvents: Array.isArray(value.activationEvents) ? value.activationEvents.map(String).slice(0, 50) : ["onStartup"],
      permissions: Array.isArray(value.permissions) ? value.permissions.map(String) : [],
      contributes: {}, dependencies: value.dependencies && typeof value.dependencies === "object" ? value.dependencies : {}
    };
    if (manifest.main.includes("..") || path.isAbsolute(manifest.main)) throw new Error("Extension entry must be relative and confined.");
    for (const permission of manifest.permissions) if (!ALLOWED_PERMISSIONS.has(permission)) throw new Error(`Unsupported extension permission: ${permission}`);
    for (const [dependencyId, range] of Object.entries(manifest.dependencies)) {
      if (!ID.test(dependencyId) || typeof range !== "string" || range.length > 40) throw new Error("Extension dependencies must use safe ids and version ranges.");
    }
    for (const key of CONTRIBUTION_KEYS) manifest.contributes[key] = Array.isArray(value.contributes?.[key]) ? value.contributes[key].slice(0, 100) : [];
    const commandIds = new Set();
    for (const command of manifest.contributes.commands) {
      if (!command?.command || commandIds.has(command.command)) throw new Error("Extension command ids must be present and unique.");
      commandIds.add(command.command);
    }
    manifest.compatible = major(manifest.engines.blue.replace(/[^0-9.]/g, "")) === major(this.blueVersion);
    manifest.compatibilityMessage = manifest.compatible ? "Compatible" : `Requires Project Blue ${manifest.engines.blue}; current ${this.blueVersion}`;
    return manifest;
  }

  readInstalled() {
    fs.mkdirSync(this.extensionsRoot, { recursive: true });
    const registry = json(this.registryFile, { version: 1, extensions: {} });
    const result = [];
    for (const entry of fs.readdirSync(this.extensionsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = path.join(this.extensionsRoot, entry.name);
      try {
        const manifest = this.validateManifest(json(path.join(directory, "blue-extension.json"), null));
        result.push({ ...manifest, directory, enabled: registry.extensions?.[manifest.id]?.enabled !== false, active: this.active.has(manifest.id), crashes: this.crashes.filter(item => item.extensionId === manifest.id).length });
      } catch (error) { result.push({ id: entry.name, name: entry.name, directory, enabled: false, active: false, invalid: true, error: error.message }); }
    }
    return result;
  }

  list() { return { blueVersion: this.blueVersion, extensionsRoot: this.extensionsRoot, extensions: this.readInstalled(), contributions: this.contributions(), crashes: this.crashes.slice(-50) }; }
  extension(id) { const item = this.readInstalled().find(extension => extension.id === id); if (!item) throw new Error("Extension is not installed."); return item; }
  contributions() { const output = { commands: [], views: [], editors: [], languages: [], settings: [] }; for (const extension of this.readInstalled().filter(item => item.enabled && item.compatible && !item.invalid)) for (const key of CONTRIBUTION_KEYS) for (const value of extension.contributes[key] || []) output[key].push({ ...value, extensionId: extension.id }); return output; }

  validateDependencies(manifest) {
    const installed = new Map(this.readInstalled().map(extension => [extension.id, extension]));
    const missing = [];
    const incompatible = [];
    for (const [id, range] of Object.entries(manifest.dependencies || {})) {
      const dependency = installed.get(id);
      if (!dependency || dependency.invalid) missing.push(`${id}@${range}`);
      else if (!dependency.enabled || !dependency.compatible || !satisfiesVersion(dependency.version, range)) incompatible.push(`${id}@${range} (installed ${dependency.version || "invalid"})`);
    }
    if (missing.length) throw new Error(`Install required extension dependencies first: ${missing.join(", ")}.`);
    if (incompatible.length) throw new Error(`Extension dependencies are disabled or incompatible: ${incompatible.join(", ")}.`);
    return true;
  }

  install(source, approved = false) {
    if (!approved) throw new Error("Installing or updating an extension requires explicit approval.");
    const sourceDirectory = path.resolve(source);
    const manifest = this.validateManifest(json(path.join(sourceDirectory, "blue-extension.json"), null));
    if (!manifest.compatible) throw new Error(manifest.compatibilityMessage);
    this.validateDependencies(manifest);
    const target = path.join(this.extensionsRoot, manifest.id);
    fs.mkdirSync(this.extensionsRoot, { recursive: true });
    const staging = `${target}.installing-${process.pid}`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(sourceDirectory, staging, { recursive: true, filter: file => !/[\\/](?:node_modules|\.git|\.env)(?:[\\/]|$)/i.test(file) });
    if (fs.existsSync(target)) {
      const backupRoot = path.join(this.extensionsRoot, ".backups");
      fs.mkdirSync(backupRoot, { recursive: true });
      fs.renameSync(target, path.join(backupRoot, `${manifest.id}-${Date.now()}`));
    }
    fs.renameSync(staging, target);
    this.setEnabled(manifest.id, true);
    this.emit("event", { event: "installed", extensionId: manifest.id, version: manifest.version });
    return this.extension(manifest.id);
  }

  update(source, approved = false) {
    const manifest = this.validateManifest(json(path.join(path.resolve(source), "blue-extension.json"), null));
    const current = this.extension(manifest.id);
    if (current.version === manifest.version) throw new Error(`Extension ${manifest.id} is already at ${manifest.version}.`);
    const updated = this.install(source, approved);
    this.emit("event", { event: "updated", extensionId: manifest.id, fromVersion: current.version, version: updated.version });
    return updated;
  }

  uninstall(id, approved = false) {
    if (!approved) throw new Error("Uninstalling an extension requires explicit approval.");
    const extension = this.extension(id);
    if (extension.active) throw new Error("Deactivate the extension before uninstalling it.");
    fs.rmSync(extension.directory, { recursive: true, force: true });
    const registry = json(this.registryFile, { version: 1, extensions: {} }); delete registry.extensions[id]; writeJson(this.registryFile, registry);
    this.emit("event", { event: "uninstalled", extensionId: id });
    return { id, uninstalled: true };
  }

  setEnabled(id, enabled) { const registry = json(this.registryFile, { version: 1, extensions: {} }); registry.extensions ||= {}; registry.extensions[id] = { enabled: Boolean(enabled), updatedAt: new Date().toISOString() }; writeJson(this.registryFile, registry); return this.extension(id); }

  ensureHost() {
    if (this.host && this.host.connected) return;
    this.host = fork(this.hostFile, [], { cwd: this.root, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    this.host.on("message", message => this.onHostMessage(message));
    this.host.on("exit", (code, signal) => { for (const pending of this.pending.values()) pending.reject(new Error("Extension host stopped.")); this.pending.clear(); for (const extensionId of this.active) this.recordCrash(extensionId, `Extension host exited (${code ?? signal}).`); this.active.clear(); this.host = null; this.emit("event", { event: "hostExit", code, signal }); });
  }

  onHostMessage(message) { if (["log", "crash"].includes(message.type)) { if (message.type === "crash") this.recordCrash(message.extensionId || "host", message.error?.message); this.emit("event", message); return; } const pending = this.pending.get(message.requestId); if (!pending) return; this.pending.delete(message.requestId); message.type === "error" ? pending.reject(new Error(message.error?.message || "Extension error")) : pending.resolve(message); }
  request(message, timeout = 15000) { this.ensureHost(); const requestId = `extension-${++this.sequence}`; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("Extension host request timed out.")); }, timeout); this.pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); this.host.send({ ...message, requestId }); }); }
  recordCrash(extensionId, message) { this.crashes.push({ extensionId, message: String(message || "Unknown crash"), timestamp: new Date().toISOString() }); this.crashes = this.crashes.slice(-100); }

  async activate(id, event = "onStartup") { const extension = this.extension(id); if (!extension.enabled) throw new Error("Extension is disabled."); if (!extension.compatible) throw new Error(extension.compatibilityMessage); if (event !== "onManual" && !extension.activationEvents.includes("*") && !extension.activationEvents.includes(event) && !extension.activationEvents.includes(`onCommand:${event}`)) throw new Error(`Extension does not activate for ${event}.`); const result = await this.request({ type: "activate", directory: extension.directory, manifest: extension }); this.active.add(id); this.emit("event", { event: "activated", extensionId: id }); return { ...extension, active: true, registeredCommands: result.commands || [] }; }
  async deactivate(id) { if (!this.active.has(id)) return this.extension(id); await this.request({ type: "deactivate", extensionId: id }); this.active.delete(id); this.emit("event", { event: "deactivated", extensionId: id }); return this.extension(id); }
  async executeCommand(command, args) { const contribution = this.contributions().commands.find(item => item.command === command); if (!contribution) throw new Error("Extension command is not contributed."); if (!this.active.has(contribution.extensionId)) await this.activate(contribution.extensionId, `onCommand:${command}`); return (await this.request({ type: "command", extensionId: contribution.extensionId, command, args })).result; }
  async stop() { if (!this.host) return; for (const id of [...this.active]) { try { await this.deactivate(id); } catch {} } this.host?.kill(); this.host = null; }
}

module.exports = { BlueExtensionService };
