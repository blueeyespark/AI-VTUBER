"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlueTerminalService, normalizeTask } = require("../terminal-service.cjs");

test("terminal service exposes PowerShell, CMD, Git Bash, and Python profiles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-terminal-"));
  const service = new BlueTerminalService(root);
  assert.deepEqual(service.profiles().map(profile => profile.id), ["powershell", "cmd", "git-bash", "python"]);
  assert.equal(service.profiles().find(profile => profile.id === "cmd").available, true);
});

test("terminal working directories cannot escape the workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-terminal-"));
  const service = new BlueTerminalService(root);
  assert.throws(() => service.resolveCwd(".."), /inside the Project Blue workspace/);
});

test("task definitions persist with build, test, and background types", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-terminal-"));
  fs.mkdirSync(path.join(root, "project"));
  const tasksPath = path.join(root, ".blue", "tasks.json");
  const service = new BlueTerminalService(root, { tasksPath });
  service.saveTask({ id: "watch", label: "Watch", type: "background", command: "npm run watch", cwd: "project" });
  const restored = new BlueTerminalService(root, { tasksPath });
  assert.equal(restored.listTasks().find(task => task.id === "watch").background, true);
  assert.equal(normalizeTask({ command: "npm test", type: "test" }).type, "test");
});

test("persistent PTY session streams output and reports an exit code", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-terminal-"));
  let dataListener;
  let exitListener;
  const terminal = {
    pid: 4242,
    onData(listener) { dataListener = listener; },
    onExit(listener) { exitListener = listener; },
    write(data) {
      dataListener(data);
      if (data.includes("exit")) exitListener({ exitCode: 7, signal: 0 });
    },
    resize() {},
    kill() { exitListener?.({ exitCode: 1, signal: 1 }); }
  };
  const service = new BlueTerminalService(root, { pty: { spawn: () => terminal } });
  const events = [];
  service.onEvent(event => events.push(event));
  const session = service.create({ profile: "cmd", cwd: "." });
  service.write(session.id, "echo BLUE_PHASE4_OK\r\n");
  await waitFor(() => events.some(event => event.type === "data" && event.data.includes("BLUE_PHASE4_OK")), "terminal output");
  service.write(session.id, "exit /b 7\r\n");
  await waitFor(() => events.some(event => event.type === "exit" && event.sessionId === session.id), "terminal exit");
  assert.equal(service.list().find(item => item.id === session.id).exitCode, 7);
  service.closeAll();
});

async function waitFor(predicate, label) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`${label} timeout`);
}
