const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const test = require("node:test");
const { BlueWorkspaceAgentBridge, formatWorkspaceAgentResult } = require("../workspace-agent.cjs");

const repoRoot = path.resolve(__dirname, "..", "..", "..");

test("workspace agent bridge returns read-only workspace context", () => {
  const bridge = new BlueWorkspaceAgentBridge(repoRoot);
  assert.equal(bridge.isInstalled(), true);
  const result = bridge.runSlash("/workspace");
  assert.equal(result.type, "workspace");
  assert.equal(result.data.project_name, "AI-VTUBER-main");
  assert.match(formatWorkspaceAgentResult(result), /Workspace context/);
});

test("workspace agent bridge routes chat-like search requests", () => {
  const bridge = new BlueWorkspaceAgentBridge(repoRoot);
  const command = bridge.commandFromMessage("Search every file for control-audit.cjs");
  assert.equal(command, "/search control-audit.cjs");
});

test("workspace agent safely proposes, approves, diffs, and rolls back multi-file work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-agent-"));
  fs.writeFileSync(path.join(root, "one.txt"), "before one", "utf8");
  fs.writeFileSync(path.join(root, "two.txt"), "before two", "utf8");
  const bridge = new BlueWorkspaceAgentBridge(root);
  const proposal = await bridge.execute({ type: "propose", title: "two files", changes: [{ path: "one.txt", content: "after one" }, { path: "two.txt", content: "after two" }] });
  assert.equal(proposal.data.changes.length, 2);
  assert.throws(() => bridge.applyProposal(proposal.data.id), /explicit approval/);
  assert.equal(bridge.proposalDiff(proposal.data.id).files[0].before, "before one");
  const applied = bridge.applyProposal(proposal.data.id, true);
  assert.equal(fs.readFileSync(path.join(root, "one.txt"), "utf8"), "after one");
  assert.throws(() => bridge.rollback(applied.data.changeId), /explicit approval/);
  bridge.rollback(applied.data.changeId, true);
  assert.equal(fs.readFileSync(path.join(root, "one.txt"), "utf8"), "before one");
  assert.equal(fs.readFileSync(path.join(root, "two.txt"), "utf8"), "before two");
});

test("workspace agent refuses rollback over newer creator edits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-agent-conflict-"));
  fs.writeFileSync(path.join(root, "file.txt"), "before", "utf8");
  const bridge = new BlueWorkspaceAgentBridge(root);
  const proposal = bridge.createProposal({ changes: [{ path: "file.txt", content: "blue edit" }] });
  const applied = bridge.applyProposal(proposal.id, true);
  fs.writeFileSync(path.join(root, "file.txt"), "creator edit", "utf8");
  assert.throws(() => bridge.rollback(applied.data.changeId, true), /newer edits/);
  assert.equal(fs.readFileSync(path.join(root, "file.txt"), "utf8"), "creator edit");
});

test("workspace agent connects tests, failure inspection, editor, and Git diff", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-agent-services-"));
  fs.writeFileSync(path.join(root, "file.js"), "const value = 1;", "utf8");
  const bridge = new BlueWorkspaceAgentBridge(root).attachServices({
    editor: { open: file => ({ path: file, content: "const value = 1;" }) },
    tests: { run: async () => ({ id: "run-1", state: "failed" }), history: () => [{ id: "run-1", results: [{ status: "failed", file: "file.js", line: 1 }], output: "failure" }] },
    git: { diff: async file => ({ file, patch: "-old\n+new" }) },
    terminal: { listTasks: () => [{ id: "test" }], runTask: id => ({ task: { id }, session: { id: "session" } }) }
  });
  assert.equal((await bridge.execute({ type: "open", path: "file.js" })).data.path, "file.js");
  assert.equal((await bridge.execute({ type: "tests" })).data.state, "failed");
  assert.equal((await bridge.execute({ type: "failures" })).data.failures.length, 1);
  assert.match((await bridge.execute({ type: "gitDiff", path: "file.js" })).data.patch, /new/);
  assert.equal((await bridge.execute({ type: "tasks" })).data[0].id, "test");
  await assert.rejects(() => bridge.execute({ type: "runTask", id: "test" }), /explicit approval/);
  assert.equal((await bridge.execute({ type: "runTask", id: "test", approved: true })).data.session.id, "session");
});

test("workspace agent exposes live workbench context and proactive suggestions to Blue Chat", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-agent-context-"));
  const bridge = new BlueWorkspaceAgentBridge(root).attachServices({
    context: {
      snapshot: async () => ({ workspace: { name: "Blue" }, ui: { activeActivity: "workspace", activeEditor: "Blue Chat", conversation: "V6" }, git: { branch: "main", clean: true }, language: { diagnosticFiles: 0 }, tests: [], tasks: [], terminals: [] }),
      summarize: () => "Workbench: Blue\nFocus: workspace / Blue Chat",
      activity: () => [{ type: "project.opened", timestamp: "2026-07-15T00:00:00.000Z" }]
    },
    proactive: { suggestions: () => [{ priority: "normal", title: "Continue V6", message: "The project is ready." }] }
  });
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("summarize my workbench")), /Focus: workspace/);
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("what should I do next?")), /Continue V6/);
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("/agent activity")), /project.opened/);
});
