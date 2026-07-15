const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BlueEditorService } = require("../editor-service.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-editor-"));
  fs.writeFileSync(path.join(root, "sample.js"), "const blue = 1;\n", "utf8");
  return { root, service: new BlueEditorService(root, { recoveryRoot: path.join(root, ".recovery") }) };
}

test("opens, edits, tracks dirty state, undoes, redoes, and saves", () => {
  const { root, service } = fixture();
  const opened = service.open("sample.js");
  assert.equal(opened.language, "javascript");
  assert.equal(service.update(opened.id, "const blue = 2;\n").dirty, true);
  assert.equal(service.undo(opened.id).content, "const blue = 1;\n");
  assert.equal(service.redo(opened.id).content, "const blue = 2;\n");
  assert.equal(service.save(opened.id).ok, true);
  assert.equal(fs.readFileSync(path.join(root, "sample.js"), "utf8"), "const blue = 2;\n");
});

test("finds and replaces text with line and column locations", () => {
  const { service } = fixture();
  const opened = service.open("sample.js");
  const found = service.find(opened.id, "blue");
  assert.deepEqual(found.map(item => [item.line, item.column]), [[1, 7]]);
  const replaced = service.replace(opened.id, "blue", "qwen");
  assert.equal(replaced.replacements, 1);
  assert.match(replaced.session.content, /qwen/);
});

test("blocks workspace escapes and detects external save conflicts", () => {
  const { root, service } = fixture();
  assert.throws(() => service.open("../outside.txt"), /outside the active workspace/);
  const opened = service.open("sample.js");
  service.update(opened.id, "const blue = 2;\n");
  fs.writeFileSync(path.join(root, "sample.js"), "const external = true;\n", "utf8");
  const result = service.save(opened.id);
  assert.equal(result.conflict, true);
  assert.ok(result.diff.changes.some(change => change.kind === "remove"));
  assert.ok(result.diff.changes.some(change => change.kind === "add"));
});

test("writes crash recovery data for dirty sessions and removes it after save", () => {
  const { service } = fixture();
  const opened = service.open("sample.js");
  service.update(opened.id, "unsaved\n");
  assert.equal(service.recoverable().length, 1);
  service.save(opened.id);
  assert.equal(service.recoverable().length, 0);
});

test("lists workspace files while ignoring private runtime and dependency folders", () => {
  const { root, service } = fixture();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "blue.py"), "print('blue')\n", "utf8");
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "node_modules", "ignored.js"), "ignored", "utf8");
  const result = service.listWorkspaceFiles();
  assert.ok(result.entries.some(item => item.path === "src/blue.py" && item.language === "python"));
  assert.ok(!result.entries.some(item => item.path.includes("node_modules")));
});

test("restores an unsaved recovery snapshot into a guarded editor session", () => {
  const { service } = fixture();
  const opened = service.open("sample.js");
  service.update(opened.id, "const recovered = true;\n");
  service.sessions.clear();
  const restored = service.restoreRecovery("sample.js");
  assert.equal(restored.dirty, true);
  assert.match(restored.content, /recovered/);
});

test("reloads a clean session after an external edit", () => {
  const { root, service } = fixture();
  const opened = service.open("sample.js");
  fs.writeFileSync(path.join(root, "sample.js"), "const external = true;\n", "utf8");
  const status = service.checkExternal(opened.id);
  assert.equal(status.reloaded, true);
  assert.equal(status.session.dirty, false);
  assert.match(status.session.content, /external/);
});

test("reports a conflict instead of overwriting a dirty session after an external edit", () => {
  const { root, service } = fixture();
  const opened = service.open("sample.js");
  service.update(opened.id, "const local = true;\n");
  fs.writeFileSync(path.join(root, "sample.js"), "const external = true;\n", "utf8");
  const status = service.checkExternal(opened.id);
  assert.equal(status.conflict, true);
  assert.equal(status.reloaded, false);
  assert.match(status.session.content, /local/);
});

test("persists bounded recent files and workspace-specific ignored paths", () => {
  const { root, service } = fixture();
  fs.mkdirSync(path.join(root, "generated"));
  fs.writeFileSync(path.join(root, "generated", "skip.js"), "const skip = true;\n", "utf8");
  service.updateWorkspaceSettings({ ignoredPaths: ["generated"], maxRecentFiles: 5 });
  service.open("sample.js");
  assert.equal(service.recentFiles()[0].path, "sample.js");
  assert.ok(!service.listWorkspaceFiles().entries.some(item => item.path.startsWith("generated/")));
  const restored = new BlueEditorService(root, { recoveryRoot: path.join(root, ".recovery") });
  assert.deepEqual(restored.workspaceSettings().ignoredPaths, ["generated"]);
});

test("finds real textual references with file, line, and column locations", () => {
  const { root, service } = fixture();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "use.js"), "blue();\nconst value = blue;\n", "utf8");
  const results = service.findReferences("blue");
  assert.ok(results.some(item => item.path === "sample.js" && item.line === 1));
  assert.ok(results.some(item => item.path === "src/use.js" && item.line === 2 && item.column === 15));
});

test("searches real workspace files with regex, case, word, and path filters", () => {
  const { root, service } = fixture();
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "src", "blue.js"), "Blue blue blueberry\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "blue.md"), "blue docs\n", "utf8");
  const result = service.searchWorkspace("blue", { matchCase: true, wholeWord: true, include: "src/**", exclude: "**/*.md" });
  assert.equal(result.matches, 1);
  assert.equal(result.files[0].path, "src/blue.js");
  assert.equal(result.files[0].results[0].column, 6);
  assert.throws(() => service.searchWorkspace("[", { regex: true }), /Invalid search expression/);
});

test("previews workspace replacements without modifying files", () => {
  const { root, service } = fixture();
  const preview = service.previewWorkspaceReplace("blue", "qwen", { wholeWord: true });
  assert.equal(preview.matches, 1);
  assert.match(preview.files[0].results[0].after, /qwen/);
  assert.match(fs.readFileSync(path.join(root, "sample.js"), "utf8"), /blue/);
});

test("registers, indexes, opens, and removes a trusted additional workspace root", () => {
  const { service } = fixture();
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), "blue-editor-extra-"));
  fs.writeFileSync(path.join(extra, "roommate.js"), "function sharedBlue() {}\n", "utf8");
  const roots = service.addWorkspaceRoot(extra);
  const added = roots.find(root => !root.primary);
  assert.ok(added);
  const listing = service.listWorkspaceFiles();
  const shared = listing.entries.find(entry => entry.name === "roommate.js");
  assert.match(shared.path, new RegExp(`^@${added.id}/`));
  assert.match(service.open(shared.path).content, /sharedBlue/);
  service.removeWorkspaceRoot(added.id);
  assert.equal(service.workspaceRoots().length, 1);
});

test("indexes JavaScript, TypeScript, and Python symbols with source locations", () => {
  const { root, service } = fixture();
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "symbols.js"), "class BlueNode {}\nfunction syncBlue() {}\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "symbols.py"), "def teach_blue():\n    pass\n", "utf8");
  const index = service.symbolIndex();
  assert.ok(index.symbols.some(symbol => symbol.name === "BlueNode" && symbol.line === 1));
  assert.ok(index.symbols.some(symbol => symbol.name === "syncBlue" && symbol.line === 2));
  assert.ok(index.symbols.some(symbol => symbol.name === "teach_blue" && symbol.language === "python"));
});

test("detects created, changed, and deleted files from bounded workspace snapshots", () => {
  const { root, service } = fixture();
  const initial = service.workspaceSnapshot();
  fs.writeFileSync(path.join(root, "new.js"), "const created = true;\n", "utf8");
  let result = service.workspaceChanges(initial);
  assert.ok(result.changes.some(change => change.type === "created" && change.path === "new.js"));
  const next = result.snapshot;
  fs.writeFileSync(path.join(root, "new.js"), "const changed = true;\n", "utf8");
  result = service.workspaceChanges(next);
  assert.ok(result.changes.some(change => change.type === "changed" && change.path === "new.js"));
  fs.rmSync(path.join(root, "new.js"));
  result = service.workspaceChanges(result.snapshot);
  assert.ok(result.changes.some(change => change.type === "deleted" && change.path === "new.js"));
});
