const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_COMMANDS = new Set(["/workspace", "/files", "/search", "/symbols", "/git", "/diagnostics", "/plan", "/help"]);
const BLOCKED_PATH = /(^|[\\/])(?:\.env(?:\.|$)|\.git|node_modules|\.blue)(?:[\\/]|$)/i;
const hash = value => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const atomicJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(temporary, file); };

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0].trim();
}

class BlueWorkspaceAgentBridge {
  constructor(repoRoot) {
    this.repoRoot = path.resolve(repoRoot);
    this.srcRoot = path.join(this.repoRoot, "src");
    this.stateRoot = path.join(this.repoRoot, ".blue", "workspace-agent");
    this.proposalFile = path.join(this.stateRoot, "proposals.json");
    this.changeFile = path.join(this.stateRoot, "changes.json");
    this.services = {};
  }

  attachServices(services = {}) { this.services = { ...this.services, ...services }; return this; }
  safeFile(requested, allowMissing = false) {
    const relative = String(requested || "").replaceAll("\\", "/").replace(/^\.\//, "");
    if (!relative || path.isAbsolute(relative) || relative.split("/").includes("..") || BLOCKED_PATH.test(relative)) throw new Error("Workspace Agent path is blocked or outside the workspace.");
    const absolute = path.resolve(this.repoRoot, relative);
    if (!absolute.startsWith(`${this.repoRoot}${path.sep}`)) throw new Error("Workspace Agent path escaped the workspace.");
    if (!allowMissing && !fs.existsSync(absolute)) throw new Error(`Workspace file does not exist: ${relative}`);
    return { relative, absolute };
  }
  records(file, key) { return safeJsonParse(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", { version: 1, [key]: [] }); }
  proposals() { return this.records(this.proposalFile, "proposals").proposals; }
  changes() { return this.records(this.changeFile, "changes").changes; }

  createProposal(value = {}) {
    const changes = (Array.isArray(value.changes) ? value.changes : []).map(change => {
      const target = this.safeFile(change.path, true); const exists = fs.existsSync(target.absolute);
      const before = exists ? fs.readFileSync(target.absolute, "utf8") : "";
      if (before.includes("\0")) throw new Error("Binary files cannot be changed by Workspace Agent.");
      return { path: target.relative, beforeHash: hash(before), before, after: String(change.content ?? ""), create: !exists };
    });
    if (!changes.length) throw new Error("A proposal requires at least one file change.");
    const proposal = { id: `proposal-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, title: String(value.title || "Blue workspace change").slice(0, 160), reason: String(value.reason || "").slice(0, 2000), createdAt: new Date().toISOString(), status: "pending", changes };
    const document = this.records(this.proposalFile, "proposals"); document.proposals = [proposal, ...document.proposals].slice(0, 100); atomicJson(this.proposalFile, document);
    return { ...proposal, changes: changes.map(({ before, after, ...item }) => ({ ...item, beforeBytes: before.length, afterBytes: after.length })) };
  }

  proposalDiff(id) { const proposal = this.proposals().find(item => item.id === id); if (!proposal) throw new Error("Workspace Agent proposal was not found."); return { id, title: proposal.title, files: proposal.changes.map(change => ({ path: change.path, before: change.before, after: change.after })) }; }

  applyProposal(id, approved = false) {
    if (!approved) throw new Error("Applying a Workspace Agent proposal requires explicit approval.");
    const document = this.records(this.proposalFile, "proposals"); const proposal = document.proposals.find(item => item.id === id); if (!proposal) throw new Error("Workspace Agent proposal was not found.");
    if (proposal.status !== "pending") throw new Error(`Proposal is already ${proposal.status}.`);
    for (const change of proposal.changes) { const target = this.safeFile(change.path, true); const current = fs.existsSync(target.absolute) ? fs.readFileSync(target.absolute, "utf8") : ""; if (hash(current) !== change.beforeHash) throw new Error(`Approval stopped: ${change.path} changed after proposal creation.`); }
    const changeId = `change-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    for (const change of proposal.changes) { const target = this.safeFile(change.path, true); fs.mkdirSync(path.dirname(target.absolute), { recursive: true }); fs.writeFileSync(target.absolute, change.after, "utf8"); }
    proposal.status = "applied"; proposal.appliedAt = new Date().toISOString(); proposal.changeId = changeId; atomicJson(this.proposalFile, document);
    const changes = this.records(this.changeFile, "changes"); changes.changes = [{ id: changeId, proposalId: id, appliedAt: proposal.appliedAt, status: "applied", files: proposal.changes.map(change => ({ path: change.path, before: change.before, afterHash: hash(change.after), create: change.create })) }, ...changes.changes].slice(0, 100); atomicJson(this.changeFile, changes);
    return { type: "applied", data: { proposalId: id, changeId, files: proposal.changes.map(change => change.path) } };
  }

  rollback(changeId, approved = false) {
    if (!approved) throw new Error("Rolling back Workspace Agent changes requires explicit approval.");
    const document = this.records(this.changeFile, "changes"); const change = document.changes.find(item => item.id === changeId); if (!change) throw new Error("Workspace Agent change was not found.");
    if (change.status !== "applied") throw new Error(`Change is already ${change.status}.`);
    for (const file of change.files) { const target = this.safeFile(file.path, true); const current = fs.existsSync(target.absolute) ? fs.readFileSync(target.absolute, "utf8") : ""; if (hash(current) !== file.afterHash) throw new Error(`Rollback stopped: ${file.path} has newer edits.`); }
    for (const file of change.files) { const target = this.safeFile(file.path, true); if (file.create) fs.rmSync(target.absolute, { force: true }); else fs.writeFileSync(target.absolute, file.before, "utf8"); }
    change.status = "rolled-back"; change.rolledBackAt = new Date().toISOString(); atomicJson(this.changeFile, document);
    return { type: "rolledBack", data: { changeId, files: change.files.map(file => file.path) } };
  }

  async execute(action = {}) {
    switch (action.type) {
      case "open": return { type: "open", data: this.services.editor?.open(action.path) || this.safeFile(action.path) };
      case "explain": { const target = this.safeFile(action.path); const content = fs.readFileSync(target.absolute, "utf8"); return { type: "explain", data: { path: target.relative, language: path.extname(target.relative), lines: content.split(/\r?\n/).length, preview: content.slice(0, 12000) } }; }
      case "propose": return { type: "proposal", data: this.createProposal(action) };
      case "diff": return { type: "diff", data: this.proposalDiff(action.id) };
      case "apply": return this.applyProposal(action.id, action.approved === true);
      case "rollback": return this.rollback(action.id, action.approved === true);
      case "tests": { if (!this.services.tests) throw new Error("Test service is unavailable."); return { type: "tests", data: await this.services.tests.run(action.testId ? { mode: "test", testId: action.testId } : action.file ? { mode: "file", file: action.file } : { mode: "all" }) }; }
      case "failures": { const run = this.services.tests?.history()[0]; return { type: "failures", data: { runId: run?.id || null, failures: (run?.results || []).filter(item => item.status === "failed"), output: run?.output || "" } }; }
      case "gitDiff": return { type: "gitDiff", data: await this.services.git.diff(action.path, action.staged === true) };
      case "gitStashes": return { type: "gitStashes", data: await this.services.git.stashes() };
      case "gitStash": return { type: "gitStash", data: await this.services.git.stash(action.message, action.approved === true) };
      case "gitApplyStash": return { type: "gitApplyStash", data: await this.services.git.applyStash(action.ref, action.approved === true) };
      case "gitMerge": return { type: "gitMerge", data: await this.services.git.merge(action.ref, action.approved === true) };
      case "gitCherryPick": return { type: "gitCherryPick", data: await this.services.git.cherryPick(action.ref, action.approved === true) };
      case "gitRevert": return { type: "gitRevert", data: await this.services.git.revert(action.ref, action.approved === true) };
      case "gitBlame": return { type: "gitBlame", data: await this.services.git.blame(action.path, action.start, action.end) };
      case "search": return this.runSlash(`/search ${String(action.query || "")}`);
      case "symbols": return this.runSlash(`/symbols ${String(action.query || "")}`);
      case "diagnostics": return this.runSlash("/diagnostics");
      case "tasks": return { type: "tasks", data: this.services.terminal?.listTasks() || [] };
      case "runTask": { if (action.approved !== true) throw new Error("Running a Workspace Agent task requires explicit approval."); return { type: "task", data: this.services.terminal.runTask(action.id) }; }
      case "context": { if (!this.services.context) throw new Error("Workbench Context service is unavailable."); const data = await this.services.context.snapshot(action.uiContext); return { type: "workbenchContext", data: { snapshot: data, summary: this.services.context.summarize(data) } }; }
      case "activity": { if (!this.services.context) throw new Error("Workbench Context service is unavailable."); return { type: "workbenchActivity", data: this.services.context.activity(action.limit) }; }
      case "suggestions": { if (!this.services.proactive) throw new Error("Proactive Blue service is unavailable."); return { type: "workbenchSuggestions", data: this.services.proactive.suggestions(action.limit) }; }
      case "observe": { if (!this.services.proactive) throw new Error("Proactive Blue service is unavailable."); return { type: "workbenchObservation", data: await this.services.proactive.observe(action.eventType, action.details, action.uiContext) }; }
      default: throw new Error("Unknown Workspace Agent action.");
    }
  }

  isInstalled() {
    return fs.existsSync(path.join(this.srcRoot, "blue_workspace", "__init__.py"));
  }

  runSlash(command) {
    if (!this.isInstalled()) {
      return { type: "error", data: { message: "BlueWorkspaceAgent is not installed." } };
    }
    const output = execFileSync("python", ["-m", "blue_workspace", this.repoRoot, command], {
      cwd: this.repoRoot,
      env: { ...process.env, PYTHONPATH: this.srcRoot },
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
      timeout: 30000
    });
    return safeJsonParse(output.toString("utf8"), { type: "error", data: { message: "Workspace agent returned invalid JSON." } });
  }

  commandFromMessage(message) {
    const text = String(message || "").trim();
    const slash = firstLine(text).split(/\s+/, 1)[0].toLowerCase();
    if (WORKSPACE_COMMANDS.has(slash)) return text;
    const lowered = text.toLowerCase();
    if (/\b(explain|summarize|map)\b.*\b(project|workspace|repo|repository)\b/.test(lowered)) return "/workspace";
    if (/\bgit\b.*\b(status|state)\b/.test(lowered)) return "/git";
    const searchMatch = text.match(/search (?:every file|all files|the workspace|files)?\s*(?:for)?\s+["“]?([^"”]+)["”]?/i);
    if (searchMatch?.[1]) return `/search ${searchMatch[1].trim()}`;
    const findMatch = text.match(/find (?:where|references? to|all references? to)?\s+["“]?([^"”]+)["”]?/i);
    if (findMatch?.[1]) return `/search ${findMatch[1].trim()}`;
    const symbolMatch = text.match(/(?:symbol|function|class)\s+["“]?([^"”]+)["”]?/i);
    if (symbolMatch?.[1]) return `/symbols ${symbolMatch[1].trim()}`;
    if (/\b(plan|propose)\b/.test(lowered) && /\b(change|fix|implement|build)\b/.test(lowered)) return `/plan ${text}`;
    return "";
  }

  async handleMessage(message) {
    const text = String(message || "").trim();
    const lowered = text.toLowerCase();
    if (/\b(summarize|show|inspect|what(?:'s| is))\b.*\b(workbench|ide context|current work)\b/.test(lowered) || /\bwhat am i working on\b/.test(lowered)) return this.execute({ type: "context" });
    if (/\b(what should i do next|next suggestion|suggestions?)\b/.test(lowered)) return this.execute({ type: "suggestions" });
    const blueResult = await this.services.blue?.handleMessage(text);
    if (blueResult) return blueResult;
    if (text.startsWith("/agent ")) {
      const body = text.slice(7).trim(); const split = body.indexOf(" "); const verb = (split < 0 ? body : body.slice(0, split)).toLowerCase(); const rest = split < 0 ? "" : body.slice(split + 1).trim();
      if (verb === "open" || verb === "explain") return this.execute({ type: verb, path: rest });
      if (verb === "propose") return this.execute({ type: "propose", ...safeJsonParse(rest, {}) });
      if (verb === "diff") return this.execute({ type: "diff", id: rest });
      if (verb === "tests") return this.execute({ type: "tests", file: rest || undefined });
      if (verb === "failures") return this.execute({ type: "failures" });
      if (verb === "search" || verb === "symbols") return this.execute({ type: verb, query: rest });
      if (verb === "diagnostics" || verb === "tasks") return this.execute({ type: verb });
      if (verb === "context" || verb === "activity" || verb === "suggestions") return this.execute({ type: verb });
      if (verb === "stashes") return this.execute({ type: "gitStashes" });
      if (verb === "blame") return this.execute({ type: "gitBlame", path: rest });
      if (["stash", "apply-stash", "merge", "cherry-pick", "revert"].includes(verb)) {
        const parts = rest.split(/\s+/); const approved = parts.at(-1) === "APPROVE"; if (approved) parts.pop();
        const value = parts.join(" ");
        const types = { stash: "gitStash", "apply-stash": "gitApplyStash", merge: "gitMerge", "cherry-pick": "gitCherryPick", revert: "gitRevert" };
        return this.execute({ type: types[verb], message: value, ref: value, approved });
      }
      if (verb === "task") { const [id, approval] = rest.split(/\s+/); return this.execute({ type: "runTask", id, approved: approval === "APPROVE" }); }
      if (verb === "apply" || verb === "rollback") { const [id, approval] = rest.split(/\s+/); return this.execute({ type: verb, id, approved: approval === "APPROVE" }); }
      throw new Error("Workspace Agent command is not recognized.");
    }
    const command = this.commandFromMessage(message);
    if (!command) return null;
    return this.runSlash(command);
  }
}

function formatWorkspaceAgentResult(result) {
  if (!result) return "";
  if (result.type === "error") return `Workspace agent error: ${result.data?.message || "unknown error"}`;
  if (result.type === "workspace") {
    const data = result.data || {};
    const languages = Object.entries(data.detected_languages || {}).slice(0, 6).map(([key, count]) => `${key}:${count}`).join(", ");
    return [
      "Workspace context:",
      `- Workspace: ${data.project_name}`,
      `- Root: ${data.workspace_root}`,
      `- Branch: ${data.current_git_branch || "unknown"}`,
      `- Modified files: ${data.modified_files}`,
      `- Package managers: ${(data.package_managers || []).join(", ") || "none detected"}`,
      `- Top languages/files: ${languages || "none"}`,
      `- Test commands: ${(data.test_commands || []).join(" | ")}`,
      `- Build commands: ${(data.build_commands || []).join(" | ")}`,
      "BlueWorkspaceAgent is currently in read-only Plan Mode."
    ].join("\n");
  }
  if (result.type === "search" || result.type === "symbols") {
    const rows = result.data?.results || [];
    const query = result.data?.query || "";
    const lines = rows.slice(0, 15).map(item => item.symbol
      ? `- ${item.symbol} — ${item.path}:${item.line}`
      : `- ${item.path}:${item.line} — ${item.preview || ""}`);
    return [`${result.type === "symbols" ? "Symbol" : "Code"} search for '${query}':`, ...(lines.length ? lines : ["- No matches found."])].join("\n");
  }
  if (result.type === "tree") {
    const rows = result.data?.entries || [];
    return ["Workspace tree:", ...rows.slice(0, 60).map(item => `${"  ".repeat(item.depth || 0)}- ${item.path}${item.type === "folder" ? "/" : ""}`)].join("\n");
  }
  if (result.type === "git") {
    const data = result.data || {};
    return [
      "Git status:",
      `- Branch: ${data.branch || "unknown"}`,
      `- Modified files: ${data.modified_files ?? 0}`,
      ...((data.files || []).slice(0, 30).map(file => `- ${file}`)),
      data.error ? `- Error: ${data.error}` : ""
    ].filter(Boolean).join("\n");
  }
  if (result.type === "plan") {
    const data = result.data || {};
    return [
      `Plan created: ${data.title}`,
      `Task: ${data.task_id}`,
      ...((data.plan || []).map((step, index) => `${index + 1}. ${step}`)),
      "Mode: Plan only. I will ask before changes."
    ].join("\n");
  }
  if (result.type === "diagnostics") {
    const rows = result.data || [];
    return ["Diagnostics:", ...(rows.length ? rows.map(item => `- ${item.severity} ${item.file}:${item.line}:${item.column} ${item.message}`) : ["- No diagnostics reported by the Phase 1 reader."])].join("\n");
  }
  if (result.type === "blueFeatures" || result.type === "blueFeature") {
    return require("./blue-feature-service.cjs").formatBlueFeatureResult(result);
  }
  if (result.type === "workbenchContext") return result.data?.summary || "Workbench context is unavailable.";
  if (result.type === "workbenchSuggestions") {
    const rows = result.data || [];
    return ["Blue's next suggestions:", ...(rows.length ? rows.map(item => `- [${item.priority}] ${item.title}: ${item.message}`) : ["- No urgent suggestions. The workbench is ready."])].join("\n");
  }
  if (result.type === "workbenchActivity") return ["Recent workbench activity:", ...((result.data || []).map(item => `- ${item.timestamp} ${item.type}`))].join("\n");
  if (["proposal", "applied", "rolledBack", "tests", "failures", "diff", "gitDiff", "gitStashes", "gitStash", "gitApplyStash", "gitMerge", "gitCherryPick", "gitRevert", "gitBlame", "open", "explain", "tasks", "task"].includes(result.type)) return `${result.type}:\n${JSON.stringify(result.data, null, 2)}`;
  return JSON.stringify(result, null, 2);
}

module.exports = { BlueWorkspaceAgentBridge, formatWorkspaceAgentResult };
