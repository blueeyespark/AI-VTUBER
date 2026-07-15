const fs = require("node:fs");
const path = require("node:path");

const SECRET_KEY = /(?:token|secret|password|credential|private.?key|authorization|cookie)/i;
const SECRET_PATH = /(^|[\\/])(?:\.env(?:\.|$)|\.git|node_modules)(?:[\\/]|$)/i;
const MAX_ACTIVITY = 300;
const MAX_TEXT = 4000;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  try { fs.renameSync(temporary, file); }
  catch { fs.copyFileSync(temporary, file); fs.rmSync(temporary, { force: true }); }
}

function sanitize(value, key = "", depth = 0) {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (depth > 6) return "[bounded]";
  if (typeof value === "string") {
    if (SECRET_PATH.test(value)) return "[private path]";
    return value.slice(0, MAX_TEXT);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([name, item]) => [name, sanitize(item, name, depth + 1)]));
  }
  return value;
}

async function safely(run, fallback) {
  try { return sanitize(await run()); } catch (error) { return { unavailable: true, reason: String(error?.message || error).slice(0, 240), fallback }; }
}

class BlueWorkbenchContextService {
  constructor(workspaceRoot, options = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.stateRoot = path.resolve(options.stateRoot || path.join(this.workspaceRoot, ".blue", "workbench-context"));
    this.activityFile = path.join(this.stateRoot, "activity.json");
    this.uiFile = path.join(this.stateRoot, "ui-context.json");
    this.services = {};
  }

  attachServices(services = {}) { this.services = { ...this.services, ...services }; return this; }

  updateUiContext(value = {}) {
    const context = sanitize({
      activeActivity: value.activeActivity || "workspace",
      activeEditor: value.activeEditor || value.editor || "workspace-home",
      openEditors: Array.isArray(value.openEditors) ? value.openEditors : [],
      conversation: value.conversation || "Blue Desktop Pet",
      currentFile: value.currentFile || "",
      updatedAt: new Date().toISOString()
    });
    atomicJson(this.uiFile, context);
    return context;
  }

  uiContext() {
    return readJson(this.uiFile, { activeActivity: "workspace", activeEditor: "workspace-home", openEditors: [], conversation: "Blue Desktop Pet", currentFile: "" });
  }

  record(type, details = {}, options = {}) {
    const document = readJson(this.activityFile, { version: 1, events: [] });
    const event = sanitize({
      id: options.id || `workbench-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: String(type || "workbench.event").slice(0, 100),
      timestamp: options.timestamp || new Date().toISOString(),
      source: String(options.source || "project-blue").slice(0, 100),
      details
    });
    document.events = [event, ...(document.events || [])].slice(0, MAX_ACTIVITY);
    atomicJson(this.activityFile, document);
    return event;
  }

  activity(limit = 50) {
    const count = Math.max(1, Math.min(MAX_ACTIVITY, Number(limit) || 50));
    return readJson(this.activityFile, { version: 1, events: [] }).events.slice(0, count);
  }

  async snapshot(uiContext = null) {
    const ui = uiContext ? this.updateUiContext(uiContext) : this.uiContext();
    const { editor, terminal, git, language, tests, debug, extensions, streaming, discord, blueMesh, presence } = this.services;
    const [gitState, languageState, testHistory, debugState, extensionState, streamingState, discordState, meshState, presenceState] = await Promise.all([
      safely(() => git?.status ? git.status() : ({ unavailable: true }), null),
      safely(() => language?.status ? language.status() : ({ unavailable: true }), null),
      safely(() => tests?.history ? tests.history().slice(0, 5) : [], []),
      safely(() => debug?.status ? debug.status() : ({ unavailable: true }), null),
      safely(() => extensions?.list ? extensions.list() : [], []),
      safely(() => streaming?.status ? streaming.status() : (streaming || { unavailable: true }), null),
      safely(() => discord?.status ? discord.status() : (discord || { unavailable: true }), null),
      safely(() => blueMesh?.status ? blueMesh.status() : (blueMesh || { unavailable: true }), null),
      safely(() => presence?.status ? presence.status() : (presence || { unavailable: true }), null)
    ]);
    return sanitize({
      version: 1,
      capturedAt: new Date().toISOString(),
      workspace: { root: this.workspaceRoot, name: path.basename(this.workspaceRoot) },
      ui,
      editors: {
        recent: editor?.recentFiles ? editor.recentFiles().slice(0, 20) : [],
        roots: editor?.workspaceRoots ? editor.workspaceRoots().map(root => ({ name: root.name, primary: root.primary })) : []
      },
      tasks: terminal?.listTasks ? terminal.listTasks() : [],
      terminals: terminal?.list ? terminal.list() : [],
      git: gitState,
      language: languageState,
      tests: testHistory,
      debug: debugState,
      extensions: extensionState,
      streaming: streamingState,
      discord: discordState,
      blueMesh: meshState,
      presence: presenceState,
      recentActivity: this.activity(20)
    });
  }

  summarize(snapshot) {
    const state = snapshot || {};
    const git = state.git || {};
    const latestTest = Array.isArray(state.tests) ? state.tests[0] : null;
    const diagnosticFiles = state.language?.diagnosticFiles ?? 0;
    const taskCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
    const terminalCount = Array.isArray(state.terminals) ? state.terminals.length : 0;
    return [
      `Workbench: ${state.workspace?.name || path.basename(this.workspaceRoot)}`,
      `Focus: ${state.ui?.activeActivity || "workspace"} / ${state.ui?.activeEditor || "workspace-home"}`,
      `Conversation: ${state.ui?.conversation || "Blue Desktop Pet"}`,
      `Git: ${git.branch || "unknown branch"}; ${git.clean === true ? "clean" : `${git.files?.length || 0} changed file(s)`}`,
      `Diagnostics: ${diagnosticFiles} file(s)`,
      `Tests: ${latestTest ? (latestTest.state || latestTest.status || "recorded") : "not run yet"}`,
      `Tasks: ${taskCount} configured; ${terminalCount} terminal session(s)`
    ].join("\n");
  }
}

module.exports = { BlueWorkbenchContextService, sanitize };
