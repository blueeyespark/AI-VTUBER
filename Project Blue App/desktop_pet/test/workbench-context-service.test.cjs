const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BlueWorkbenchContextService, sanitize } = require("../workbench-context-service.cjs");
const { ProactiveBlueService } = require("../proactive-blue-service.cjs");

test("workbench context aggregates IDE services and persists bounded, redacted activity", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-workbench-context-"));
  const context = new BlueWorkbenchContextService(root, { stateRoot: path.join(root, "state") }).attachServices({
    editor: { recentFiles: () => [{ path: "src/app.js" }], workspaceRoots: () => [{ name: "Blue", primary: true, path: root }] },
    terminal: { listTasks: () => [{ id: "test" }], list: () => [{ id: "terminal-1", state: "running" }] },
    git: { status: async () => ({ branch: "main", clean: false, files: [{ path: "src/app.js" }] }) },
    language: { status: async () => ({ diagnosticFiles: 2 }) },
    tests: { history: () => [{ id: "run-1", state: "failed", results: [{ status: "failed" }] }] }
  });
  context.record("test.event", { token: "never-store-this", path: ".env", message: "safe" });
  const snapshot = await context.snapshot({ activeActivity: "workspace", activeEditor: "Blue Chat", conversation: "Build V6" });
  assert.equal(snapshot.git.branch, "main");
  assert.equal(snapshot.tasks[0].id, "test");
  assert.equal(snapshot.ui.activeEditor, "Blue Chat");
  assert.equal(snapshot.recentActivity[0].details.token, "[redacted]");
  assert.equal(snapshot.recentActivity[0].details.path, "[private path]");
  assert.match(context.summarize(snapshot), /1 changed file/);
});

test("workbench context sanitizer bounds data and removes credential-like values", () => {
  const clean = sanitize({ password: "bad", nested: { authorization: "Bearer bad", content: "ok" }, list: Array.from({ length: 120 }, (_, index) => index) });
  assert.equal(clean.password, "[redacted]");
  assert.equal(clean.nested.authorization, "[redacted]");
  assert.equal(clean.nested.content, "ok");
  assert.equal(clean.list.length, 100);
});

test("proactive Blue creates useful, deduplicated suggestions without taking actions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-proactive-"));
  const context = new BlueWorkbenchContextService(root, { stateRoot: path.join(root, "state") }).attachServices({
    git: { status: async () => ({ branch: "main", clean: false, files: [{ path: "one.js" }, { path: "two.js" }] }) },
    language: { status: async () => ({ diagnosticFiles: 0 }) },
    tests: { history: () => [] }
  });
  const proactive = new ProactiveBlueService(context, { cooldownMs: 60000 });
  const first = await proactive.observe("project.opened", { token: "private" });
  const second = await proactive.observe("project.opened", {});
  assert.equal(first.suggestion.title, "Project context is ready");
  assert.equal(first.suggestion.requiresApproval, false);
  assert.equal(second.deduplicated, true);
  assert.equal(proactive.suggestions().length, 1);
  assert.equal(proactive.dismiss(first.suggestion.id), true);
  assert.equal(proactive.suggestions().length, 0);
});

test("proactive Blue recognizes a just-finished failing test run payload", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-proactive-test-run-"));
  const context = new BlueWorkbenchContextService(root, { stateRoot: path.join(root, "state") }).attachServices({
    git: { status: async () => ({ branch: "main", clean: true, files: [] }) },
    language: { status: async () => ({ diagnosticFiles: 0 }) },
    tests: { history: () => [] }
  });
  const proactive = new ProactiveBlueService(context, { cooldownMs: 1000 });
  const result = await proactive.observe("tests.completed", {
    event: "finished",
    run: { id: "run-failed", state: "failed", results: [{ status: "failed" }, { status: "passed" }] }
  });
  assert.equal(result.suggestion.title, "Tests failed");
  assert.match(result.suggestion.message, /1 test failure/);
  assert.equal(result.suggestion.requiresApproval, false);
});
