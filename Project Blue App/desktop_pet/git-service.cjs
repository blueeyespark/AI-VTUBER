const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_OUTPUT = 8 * 1024 * 1024;

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { ...options, windowsHide: true, maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = String(stdout || ""); error.stderr = String(stderr || "");
        reject(error); return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function normalizeFile(value) {
  const file = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!file || file.startsWith("-") || path.isAbsolute(file) || /^[A-Za-z]:\//.test(file) || file.startsWith("//") || file.split("/").includes("..") || /[\0\r\n]/.test(file)) throw new Error("Invalid repository-relative path.");
  return file;
}

function normalizeRef(value, label = "Git reference") {
  const ref = String(value || "").trim();
  if (!ref || ref.length > 240 || ref.startsWith("-") || ref.includes("..") || /[\0\r\n ~^:?*\[\\]/.test(ref)) throw new Error(`Invalid ${label.toLowerCase()}.`);
  return ref;
}

function parseStatus(raw) {
  const entries = [];
  for (const record of String(raw || "").split("\0").filter(Boolean)) {
    if (record.startsWith("# ")) continue;
    if (record.startsWith("? ")) { entries.push({ path: record.slice(2), index: "?", worktree: "?", untracked: true }); continue; }
    if (record.startsWith("! ")) continue;
    const kind = record[0];
    if (!["1", "2", "u"].includes(kind)) continue;
    const parts = record.split(" ");
    const xy = parts[1] || "..";
    const filePath = kind === "u" ? parts.slice(10).join(" ") : kind === "2" ? parts.slice(9).join(" ") : parts.slice(8).join(" ");
    entries.push({ path: filePath, index: xy[0], worktree: xy[1], staged: xy[0] !== ".", modified: xy[1] !== ".", conflict: kind === "u" || xy.includes("U"), deleted: xy.includes("D"), renamed: kind === "2" });
  }
  return entries;
}

class BlueGitService {
  constructor(workspaceRoot) { this.workspaceRoot = path.resolve(workspaceRoot); this.repoRoot = null; }

  async discover(start = this.workspaceRoot) {
    const resolved = path.resolve(start);
    if (resolved !== this.workspaceRoot && !resolved.startsWith(`${this.workspaceRoot}${path.sep}`)) throw new Error("Repository discovery is confined to the Project Blue workspace.");
    const { stdout } = await run("git", ["-C", resolved, "rev-parse", "--show-toplevel"]);
    const root = path.resolve(stdout.trim());
    if (root !== this.workspaceRoot && !root.startsWith(`${this.workspaceRoot}${path.sep}`) && !this.workspaceRoot.startsWith(`${root}${path.sep}`)) throw new Error("Git repository is outside the Project Blue workspace.");
    this.repoRoot = root; return root;
  }

  async git(args) { const root = this.repoRoot || await this.discover(); return run("git", ["-C", root, ...args]); }

  async status() {
    const root = this.repoRoot || await this.discover();
    const [{ stdout }, branch, upstream] = await Promise.all([
      this.git(["status", "--porcelain=v2", "--branch", "-z"]),
      this.git(["branch", "--show-current"]).then(x => x.stdout.trim()),
      this.git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).then(x => x.stdout.trim()).catch(() => "")
    ]);
    const files = parseStatus(stdout);
    return { root, branch, upstream, clean: files.length === 0, files, conflicts: files.filter(x => x.conflict), staged: files.filter(x => x.staged), unstaged: files.filter(x => x.modified || x.untracked) };
  }

  async diff(file, staged = false) {
    const safe = normalizeFile(file); const args = ["diff", "--no-ext-diff", "--unified=4"];
    if (staged) args.push("--cached"); args.push("--", safe);
    const { stdout } = await this.git(args); return { path: safe, staged: Boolean(staged), diff: stdout };
  }

  async stage(files) { const safe = (Array.isArray(files) ? files : [files]).map(normalizeFile); await this.git(["add", "--", ...safe]); return this.status(); }
  async unstage(files) { const safe = (Array.isArray(files) ? files : [files]).map(normalizeFile); await this.git(["restore", "--staged", "--", ...safe]); return this.status(); }

  async branches() {
    const { stdout } = await this.git(["for-each-ref", "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)", "refs/heads"]);
    return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => { const [name, head, upstream] = line.split("\t"); return { name, current: head === "*", upstream: upstream || "" }; });
  }

  async switchBranch(name, approved = false) {
    if (!approved) throw new Error("Branch switching requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Branch switching is blocked while working-tree changes exist, so unrelated work stays safe.");
    const branch = String(name || "").trim(); if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.startsWith("-") || branch.includes("..")) throw new Error("Invalid branch name.");
    await this.git(["switch", branch]); return this.status();
  }

  async commit(message, approved = false) {
    if (!approved) throw new Error("Commit requires explicit approval.");
    const text = String(message || "").trim(); if (!text || text.length > 4000) throw new Error("Enter a commit message (maximum 4000 characters).");
    const before = await this.status(); if (!before.staged.length) throw new Error("No selected files are staged.");
    const { stdout } = await this.git(["commit", "-m", text]); return { output: stdout.trim(), status: await this.status() };
  }

  async pull(approved = false) {
    if (!approved) throw new Error("Pull requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Pull is blocked while local changes exist, so unrelated work cannot be overwritten.");
    const { stdout, stderr } = await this.git(["pull", "--ff-only"]); return { output: `${stdout}${stderr}`.trim(), status: await this.status() };
  }

  async push(approved = false) {
    if (!approved) throw new Error("Push requires explicit approval.");
    const state = await this.status(); const args = state.upstream ? ["push"] : ["push", "--set-upstream", "origin", state.branch];
    const { stdout, stderr } = await this.git(args); return { output: `${stdout}${stderr}`.trim(), status: await this.status() };
  }

  async history(limit = 50) {
    const count = Math.max(1, Math.min(200, Number(limit) || 50));
    const { stdout } = await this.git(["log", `-${count}`, "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e"]);
    return stdout.split("\x1e").filter(Boolean).map(row => { const [hash, shortHash, author, email, timestamp, subject] = row.trim().split("\x1f"); return { hash, shortHash, author, email, timestamp, subject }; });
  }

  async attribution(file, limit = 30) {
    const safe = normalizeFile(file); const count = Math.max(1, Math.min(100, Number(limit) || 30));
    const { stdout } = await this.git(["log", `-${count}`, "--follow", "--date=iso-strict", "--pretty=format:%h%x1f%an%x1f%ad%x1f%s%x1e", "--", safe]);
    return { path: safe, changes: stdout.split("\x1e").filter(Boolean).map(row => { const [hash, author, timestamp, subject] = row.trim().split("\x1f"); return { hash, author, timestamp, subject }; }) };
  }

  async stashes() {
    const { stdout } = await this.git(["stash", "list", "--date=iso-strict", "--pretty=format:%gd%x1f%H%x1f%ad%x1f%s%x1e"]);
    return stdout.split("\x1e").filter(Boolean).map(row => { const [ref, hash, timestamp, subject] = row.trim().split("\x1f"); return { ref, hash, timestamp, subject }; });
  }

  async stash(message, approved = false) {
    if (!approved) throw new Error("Stashing changes requires explicit approval.");
    const before = await this.status();
    if (before.clean) throw new Error("There are no working-tree changes to stash.");
    const note = String(message || "Project Blue workbench stash").trim().slice(0, 200);
    const { stdout } = await this.git(["stash", "push", "--include-untracked", "-m", note]);
    return { output: stdout.trim(), stashes: await this.stashes(), status: await this.status() };
  }

  async applyStash(ref, approved = false) {
    if (!approved) throw new Error("Applying a stash requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Stash apply is blocked while working-tree changes exist.");
    const safe = String(ref || "stash@{0}").trim();
    if (!/^stash@\{\d+\}$/.test(safe)) throw new Error("Invalid stash reference.");
    try {
      const { stdout, stderr } = await this.git(["stash", "apply", safe]);
      return { applied: true, conflict: false, output: `${stdout}${stderr}`.trim(), status: await this.status() };
    } catch (error) {
      const status = await this.status();
      if (status.conflicts.length) return { applied: false, conflict: true, output: `${error.stdout || ""}${error.stderr || ""}`.trim(), status };
      throw error;
    }
  }

  async merge(ref, approved = false) {
    if (!approved) throw new Error("Merging requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Merge is blocked while working-tree changes exist.");
    const safe = normalizeRef(ref, "merge reference");
    try {
      const { stdout, stderr } = await this.git(["merge", "--no-edit", safe]);
      return { merged: true, conflict: false, output: `${stdout}${stderr}`.trim(), status: await this.status() };
    } catch (error) {
      const status = await this.status();
      if (status.conflicts.length) return { merged: false, conflict: true, output: `${error.stdout || ""}${error.stderr || ""}`.trim(), status };
      throw error;
    }
  }

  async cherryPick(ref, approved = false) {
    if (!approved) throw new Error("Cherry-pick requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Cherry-pick is blocked while working-tree changes exist.");
    return this.sequenceOperation("cherry-pick", normalizeRef(ref, "commit reference"));
  }

  async revert(ref, approved = false) {
    if (!approved) throw new Error("Revert requires explicit approval.");
    if (!(await this.status()).clean) throw new Error("Revert is blocked while working-tree changes exist.");
    return this.sequenceOperation("revert", normalizeRef(ref, "commit reference"), ["--no-edit"]);
  }

  async sequenceOperation(command, ref, extra = []) {
    try {
      const { stdout, stderr } = await this.git([command, ...extra, ref]);
      return { completed: true, conflict: false, operation: command, output: `${stdout}${stderr}`.trim(), status: await this.status() };
    } catch (error) {
      const status = await this.status();
      if (status.conflicts.length) return { completed: false, conflict: true, operation: command, output: `${error.stdout || ""}${error.stderr || ""}`.trim(), status };
      throw error;
    }
  }

  async blame(file, start = 1, end = 200) {
    const safe = normalizeFile(file);
    const from = Math.max(1, Number(start) || 1); const to = Math.max(from, Math.min(from + 499, Number(end) || from + 199));
    const { stdout } = await this.git(["blame", "--line-porcelain", `-L${from},${to}`, "--", safe]);
    const rows = []; let current = null;
    for (const line of stdout.split(/\r?\n/)) {
      const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
      if (header) { current = { hash: header[1], line: Number(header[2]), author: "", timestamp: "", summary: "", content: "" }; continue; }
      if (!current) continue;
      if (line.startsWith("author ")) current.author = line.slice(7);
      else if (line.startsWith("author-time ")) current.timestamp = new Date(Number(line.slice(12)) * 1000).toISOString();
      else if (line.startsWith("summary ")) current.summary = line.slice(8);
      else if (line.startsWith("\t")) { current.content = line.slice(1); rows.push(current); current = null; }
    }
    return { path: safe, start: from, end: to, lines: rows };
  }
}

module.exports = { BlueGitService, normalizeFile, normalizeRef, parseStatus };
