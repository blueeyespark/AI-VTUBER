const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlueDebugService } = require("../debug-service.cjs");

function waitEvent(service, sessionId, name, timeout = 20000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { service.off("event", listener); reject(new Error(`Timed out waiting for ${name}`)); }, timeout); const listener = event => { if (event.sessionId !== sessionId || event.event !== name) return; clearTimeout(timer); service.off("event", listener); resolve(event.body); }; service.on("event", listener); }); }

test("debug profiles stay inside the workspace and preserve launch metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-debug-profile-")); const program = path.join(root, "blue.py"); fs.writeFileSync(program, "print('Blue')\n"); const service = new BlueDebugService(root, { moduleRoot: path.resolve(__dirname, "..") });
  try { const profile = service.saveProfile({ name: "Python Blue", runtime: "python", program, cwd: root, args: ["--safe"] }); assert.equal(profile.runtime, "python"); assert.equal(service.profiles().configurations.length, 1); assert.throws(() => service.saveProfile({ runtime: "node", program: path.resolve(root, "..", "outside.js") }), /inside/); } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const runtime of ["python", "node"]) test(`real ${runtime} DAP session stops, exposes stack and variables, evaluates, and continues`, { timeout: 90000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `blue-debug-${runtime}-`)); const extension = runtime === "python" ? "py" : "js"; const program = path.join(root, `blue.${extension}`); const source = runtime === "python" ? "name = 'Blue'\nmessage = name.upper()\nprint(message)\n" : "const name = 'Blue';\nconst message = name.toUpperCase();\nconsole.log(message);\n"; fs.writeFileSync(program, source, "utf8"); const service = new BlueDebugService(root, { moduleRoot: path.resolve(__dirname, "..") }); t.after(async () => { await service.stopAll(); try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });
  assert.equal(service.adapters().every(adapter => adapter.installed), true);
  let sessionId; const starting = service.start({ runtime, request: "launch", program, cwd: root, stopOnEntry: false, breakpoints: { [program]: [{ line: 2, condition: "name == 'Blue'" }] } });
  while (!sessionId) { sessionId = service.list()[0]?.id; if (!sessionId) await new Promise(resolve => setTimeout(resolve, 20)); }
  const stopped = waitEvent(service, sessionId, "stopped"); const session = await starting; assert.equal(session.id, sessionId); await stopped;
  const stack = await service.command(sessionId, "stackTrace", { startFrame: 0, levels: 20 }); assert.ok(stack.stackFrames?.length, "debugger should return a call stack"); const frameId = stack.stackFrames[0].id;
  const scopes = await service.command(sessionId, "scopes", { frameId }); assert.ok(scopes.scopes?.length, "debugger should return scopes"); const variables = await service.command(sessionId, "variables", { variablesReference: scopes.scopes[0].variablesReference }); assert.ok(Array.isArray(variables.variables));
  const evaluation = await service.command(sessionId, "evaluate", { frameId, expression: "name", context: "watch" }); assert.match(String(evaluation.result), /Blue/);
  await service.command(sessionId, "continue");
});
