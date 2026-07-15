const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { BlueGitService, normalizeFile, normalizeRef, parseStatus } = require("../git-service.cjs");

function git(root, ...args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-git-"));
  git(root, "init", "-b", "main"); git(root, "config", "user.name", "Blue Test"); git(root, "config", "user.email", "blue@test.invalid");
  fs.writeFileSync(path.join(root, "tracked.txt"), "first\n"); git(root, "add", "tracked.txt"); git(root, "commit", "-m", "initial"); return root;
}

test("parses staged, unstaged, deleted, untracked, and conflicts", () => {
  const rows = parseStatus("1 M. N... 100644 100644 100644 aaa bbb staged.txt\0? new.txt\0u UU N... 100644 100644 100644 100644 a b c conflict.txt\0");
  assert.equal(rows[0].staged, true); assert.equal(rows[1].untracked, true); assert.equal(rows[2].conflict, true);
});

test("rejects paths that could escape or inject Git arguments", () => {
  for (const value of ["../secret", "C:/secret", "-nasty", "bad\nfile"]) assert.throws(() => normalizeFile(value));
  for (const value of ["-bad", "main..other", "bad ref", "bad\nref"]) assert.throws(() => normalizeRef(value));
});

test("advanced Git supports blame, reviewed stash round trips, and approved merges", async t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const service = new BlueGitService(root);
  const blame = await service.blame("tracked.txt"); assert.equal(blame.lines.length, 1); assert.equal(blame.lines[0].author, "Blue Test");
  fs.appendFileSync(path.join(root, "tracked.txt"), "stashed\n"); fs.writeFileSync(path.join(root, "new.txt"), "new\n");
  await assert.rejects(service.stash("work", false), /approval/);
  const stashed = await service.stash("work", true); assert.equal(stashed.status.clean, true); assert.equal(stashed.stashes.length, 1);
  await assert.rejects(service.applyStash("stash@{0}", false), /approval/);
  const applied = await service.applyStash("stash@{0}", true); assert.equal(applied.applied, true); assert.equal(applied.status.clean, false);
  git(root, "reset", "--hard", "HEAD"); git(root, "clean", "-fd"); git(root, "switch", "-c", "feature");
  fs.writeFileSync(path.join(root, "feature.txt"), "feature\n"); git(root, "add", "feature.txt"); git(root, "commit", "-m", "feature"); git(root, "switch", "main");
  await assert.rejects(service.merge("feature", false), /approval/);
  const merged = await service.merge("feature", true); assert.equal(merged.merged, true); assert.equal(fs.existsSync(path.join(root, "feature.txt")), true);
});

test("discovers repository and reports real status, diff, branches, history, attribution", async t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const service = new BlueGitService(root);
  fs.appendFileSync(path.join(root, "tracked.txt"), "second\n"); fs.writeFileSync(path.join(root, "new.txt"), "new\n");
  let state = await service.status(); assert.equal(state.branch, "main"); assert.equal(state.files.length, 2); assert.equal(state.unstaged.length, 2);
  assert.match((await service.diff("tracked.txt")).diff, /second/); assert.equal((await service.branches())[0].current, true);
  assert.equal((await service.history()).length, 1); assert.equal((await service.attribution("tracked.txt")).changes.length, 1);
  state = await service.stage(["tracked.txt"]); assert.equal(state.staged.length, 1); state = await service.unstage(["tracked.txt"]); assert.equal(state.staged.length, 0);
});

test("mutations require approval and commit only staged selections", async t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const service = new BlueGitService(root);
  fs.appendFileSync(path.join(root, "tracked.txt"), "approved\n"); fs.writeFileSync(path.join(root, "unrelated.txt"), "leave me\n"); await service.stage("tracked.txt");
  await assert.rejects(service.commit("no", false), /approval/); const result = await service.commit("selected change", true); assert.match(result.output, /selected change/);
  const state = await service.status(); assert.equal(state.files.some(file => file.path === "unrelated.txt" && file.untracked), true);
  await assert.rejects(service.switchBranch("main", false), /approval/); await assert.rejects(service.pull(false), /approval/); await assert.rejects(service.push(false), /approval/);
});
