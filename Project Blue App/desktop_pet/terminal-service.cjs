"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const pty = require("node-pty");

const MAX_TERMINALS = 12;
const MAX_SCROLLBACK = 1024 * 1024;

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function commandExists(command) {
  try {
    execFileSync("where.exe", [command], { windowsHide: true, stdio: "ignore", timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

function normalizeTask(value = {}) {
  const type = ["build", "test", "background", "task"].includes(value.type) ? value.type : "task";
  const command = String(value.command || "").trim().slice(0, 4096);
  if (!command) throw new Error("A task command is required.");
  return {
    id: String(value.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    label: String(value.label || "Task").trim().slice(0, 80),
    type,
    command,
    profile: String(value.profile || "powershell"),
    cwd: String(value.cwd || "."),
    background: type === "background" || value.background === true
  };
}

class BlueTerminalService {
  constructor(workspaceRoot, options = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.tasksPath = options.tasksPath || path.join(this.workspaceRoot, ".blue", "tasks.json");
    this.sessions = new Map();
    this.listeners = new Set();
    this.pty = options.pty || pty;
    this.tasks = this.loadTasks();
  }

  profiles() {
    const gitBash = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe")
    ].find(candidate => candidate && fs.existsSync(candidate));
    return [
      { id: "powershell", label: "PowerShell", executable: commandExists("pwsh.exe") ? "pwsh.exe" : "powershell.exe", args: ["-NoLogo"] },
      { id: "cmd", label: "Command Prompt", executable: "cmd.exe", args: [] },
      { id: "git-bash", label: "Git Bash", executable: gitBash || "bash.exe", args: ["--login", "-i"], available: Boolean(gitBash || commandExists("bash.exe")) },
      { id: "python", label: "Python", executable: commandExists("py.exe") ? "py.exe" : "python.exe", args: ["-i"], available: commandExists("py.exe") || commandExists("python.exe") }
    ].map(profile => ({ ...profile, available: profile.available !== false && (path.isAbsolute(profile.executable) || commandExists(profile.executable)) }));
  }

  resolveCwd(requested = ".") {
    const absolute = path.resolve(this.workspaceRoot, String(requested || "."));
    const relative = path.relative(this.workspaceRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Terminal working directory must stay inside the Project Blue workspace.");
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) throw new Error("Terminal working directory does not exist.");
    return absolute;
  }

  onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event) { for (const listener of this.listeners) listener(JSON.parse(JSON.stringify(event))); }
  describe(session) {
    return { id: session.id, title: session.title, profile: session.profile, cwd: path.relative(this.workspaceRoot, session.cwd) || ".", pid: session.pid, state: session.state, exitCode: session.exitCode, createdAt: session.createdAt, output: session.output };
  }

  create(options = {}) {
    if (this.sessions.size >= MAX_TERMINALS) throw new Error(`Project Blue supports up to ${MAX_TERMINALS} simultaneous terminals.`);
    const profile = this.profiles().find(item => item.id === String(options.profile || "powershell"));
    if (!profile?.available) throw new Error("The selected terminal profile is not installed.");
    const cwd = this.resolveCwd(options.cwd);
    const id = crypto.randomUUID();
    const terminal = this.pty.spawn(profile.executable, profile.args, {
      name: "xterm-256color", cols: Math.max(20, Math.min(400, Number(options.cols) || 100)), rows: Math.max(5, Math.min(200, Number(options.rows) || 30)), cwd,
      env: { ...process.env, TERM: "xterm-256color", PROJECT_BLUE_TERMINAL: "1" }, useConpty: true
    });
    const session = { id, title: String(options.title || profile.label).slice(0, 80), profile: profile.id, cwd, pid: terminal.pid, state: "running", exitCode: null, createdAt: new Date().toISOString(), output: "", terminal };
    this.sessions.set(id, session);
    terminal.onData(data => {
      session.output = `${session.output}${data}`.slice(-MAX_SCROLLBACK);
      this.emit({ type: "data", sessionId: id, data });
    });
    terminal.onExit(({ exitCode, signal }) => {
      session.state = "exited"; session.exitCode = exitCode; session.signal = signal;
      this.emit({ type: "exit", sessionId: id, exitCode, signal });
    });
    this.emit({ type: "created", session: this.describe(session) });
    return this.describe(session);
  }

  list() { return [...this.sessions.values()].map(session => this.describe(session)); }
  write(id, data) {
    const session = this.sessions.get(String(id));
    if (!session || session.state !== "running") throw new Error("Terminal session is not running.");
    session.terminal.write(String(data || "").slice(0, 131072));
    return this.describe(session);
  }
  resize(id, cols, rows) {
    const session = this.sessions.get(String(id));
    if (!session || session.state !== "running") return false;
    session.terminal.resize(Math.max(20, Math.min(400, Number(cols) || 100)), Math.max(5, Math.min(200, Number(rows) || 30)));
    return true;
  }
  close(id) {
    const session = this.sessions.get(String(id));
    if (!session) return false;
    if (session.state === "running") {
      try { session.terminal.kill(); } catch { /* Native PTY may already be closing. */ }
    }
    this.sessions.delete(String(id));
    this.emit({ type: "closed", sessionId: String(id) });
    return true;
  }
  closeAll() { for (const id of [...this.sessions.keys()]) this.close(id); }

  loadTasks() {
    const defaults = [
      { id: "blue-check", label: "Project Blue: Check", type: "build", command: "npm.cmd run check", profile: "powershell", cwd: "Project Blue App/desktop_pet", background: false },
      { id: "blue-tests", label: "Project Blue: Tests", type: "test", command: "npm.cmd test", profile: "powershell", cwd: "Project Blue App/desktop_pet", background: false }
    ];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.tasksPath, "utf8"));
      return Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : defaults;
    } catch { return defaults; }
  }
  listTasks() { return this.tasks.map(task => ({ ...task })); }
  saveTask(value) {
    const task = normalizeTask(value); this.resolveCwd(task.cwd);
    const index = this.tasks.findIndex(item => item.id === task.id);
    if (index >= 0) this.tasks[index] = task; else this.tasks.push(task);
    atomicJson(this.tasksPath, { version: 1, tasks: this.tasks });
    this.emit({ type: "tasks-changed", tasks: this.listTasks() });
    return { ...task };
  }
  deleteTask(id) {
    const previous = this.tasks.length;
    this.tasks = this.tasks.filter(task => task.id !== String(id));
    if (this.tasks.length === previous) return false;
    atomicJson(this.tasksPath, { version: 1, tasks: this.tasks });
    this.emit({ type: "tasks-changed", tasks: this.listTasks() });
    return true;
  }
  runTask(id) {
    const task = this.tasks.find(item => item.id === String(id));
    if (!task) throw new Error("Task definition was not found.");
    const session = this.create({ profile: task.profile, cwd: task.cwd, title: task.label });
    this.write(session.id, `${task.command}${task.profile === "python" ? "\n" : "\r"}`);
    this.emit({ type: "task-started", task: { ...task }, sessionId: session.id });
    return { task: { ...task }, session };
  }
}

module.exports = { BlueTerminalService, normalizeTask };
