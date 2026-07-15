const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const IGNORE = new Set([".git", ".blue", "node_modules", "vendor", "backups", "dist", "build"]);
const MAX_FILES = 5000;
const MAX_OUTPUT = 250000;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

class BlueTestService extends EventEmitter {
  constructor(root, options = {}) {
    super();
    this.root = path.resolve(root);
    this.python = options.python || "python";
    this.historyFile = path.join(this.root, ".blue", "testing", "history.json");
    this.tests = new Map();
    this.runs = new Map();
    this.sequence = 0;
  }

  safePath(value) {
    const result = path.resolve(this.root, value || ".");
    if (result !== this.root && !result.startsWith(`${this.root}${path.sep}`)) throw new Error("Test path must stay inside the workspace.");
    return result;
  }

  files() {
    const result = [];
    const visit = directory => {
      if (result.length >= MAX_FILES) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (IGNORE.has(entry.name)) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(?:test|spec)\.(?:c?js|mjs|ts)$/i.test(entry.name) || /^test_.*\.py$/i.test(entry.name) || /_test\.py$/i.test(entry.name)) result.push(full);
        if (result.length >= MAX_FILES) return;
      }
    };
    visit(this.root);
    return result;
  }

  discover() {
    const discovered = [];
    for (const file of this.files()) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(this.root, file).replace(/\\/g, "/");
      const runtime = file.endsWith(".py") ? "python" : "node";
      const lines = source.split(/\r?\n/);
      let pythonClass = "";
      lines.forEach((line, index) => {
        if (runtime === "python") {
          const classMatch = line.match(/^class\s+([A-Za-z_]\w*)\s*\([^)]*(?:TestCase)[^)]*\)\s*:/);
          if (classMatch) pythonClass = classMatch[1];
          if (/^\S/.test(line) && !/^class\s/.test(line)) pythonClass = "";
          const match = line.match(/^\s*def\s+(test_[A-Za-z_]\w*)\s*\(/);
          if (match) discovered.push(this.makeTest(runtime, file, relative, match[1], index + 1, pythonClass ? `${pythonClass}.${match[1]}` : match[1]));
        } else {
          const match = line.match(/\b(?:test|it)\s*\(\s*(["'`])(.+?)\1/);
          if (match) discovered.push(this.makeTest(runtime, file, relative, match[2], index + 1, match[2]));
        }
      });
    }
    this.tests = new Map(discovered.map(test => [test.id, test]));
    return this.tree(discovered);
  }

  makeTest(runtime, file, relative, label, line, selector) {
    return { id: `${runtime}:${relative}:${line}`, runtime, file, relative, label, line, selector };
  }

  tree(tests = [...this.tests.values()]) {
    const files = new Map();
    for (const test of tests) {
      if (!files.has(test.relative)) files.set(test.relative, { id: `file:${test.relative}`, type: "file", label: test.relative, file: test.file, runtime: test.runtime, children: [] });
      files.get(test.relative).children.push({ ...test, type: "test" });
    }
    return { root: this.root, count: tests.length, files: [...files.values()] };
  }

  history() { return readJson(this.historyFile, { version: 1, runs: [] }).runs || []; }

  async run(value = {}) {
    if (!this.tests.size) this.discover();
    const mode = value.mode || "all";
    let selected = [...this.tests.values()];
    if (mode === "test") selected = selected.filter(test => test.id === value.testId);
    if (mode === "file") { const file = this.safePath(value.file); selected = selected.filter(test => test.file === file); }
    if (!selected.length) throw new Error("No matching tests were discovered.");
    const groups = new Map();
    for (const test of selected) {
      const key = mode === "test" ? test.id : test.file;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(test);
    }
    const runId = `test-run-${++this.sequence}-${Date.now()}`;
    const run = { id: runId, mode, startedAt: new Date().toISOString(), state: "running", results: [], output: "" };
    this.runs.set(runId, run);
    this.emit("event", { event: "started", run: this.describe(run) });
    for (const tests of groups.values()) {
      const result = await this.runGroup(runId, tests, mode);
      run.results.push(...tests.map(test => ({ testId: test.id, label: test.label, file: test.file, line: test.line, status: result.code === 0 ? "passed" : "failed", durationMs: result.durationMs })));
      run.output = `${run.output}${result.output}`.slice(-MAX_OUTPUT);
    }
    run.state = run.results.every(result => result.status === "passed") ? "passed" : "failed";
    run.finishedAt = new Date().toISOString();
    const document = { version: 1, runs: [this.describe(run), ...this.history()].slice(0, 100) };
    atomicJson(this.historyFile, document);
    this.emit("event", { event: "finished", run: this.describe(run) });
    return this.describe(run);
  }

  runGroup(runId, tests, mode) {
    const runtime = tests[0].runtime;
    const file = tests[0].file;
    const started = Date.now();
    const command = runtime === "python" ? this.python : process.execPath;
    const args = runtime === "python"
      ? ["-m", "unittest", ...(mode === "test" ? [this.pythonSelector(tests[0])] : [file])]
      : ["--test", ...(mode === "test" ? ["--test-name-pattern", tests[0].label] : []), file];
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
      delete env.NODE_TEST_CONTEXT;
      const child = spawn(command, args, { cwd: this.root, windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const append = data => { const text = String(data); output = `${output}${text}`.slice(-MAX_OUTPUT); this.emit("event", { event: "output", runId, output: text }); };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", reject);
      child.on("exit", code => resolve({ code: code ?? 1, output, durationMs: Date.now() - started }));
    });
  }

  pythonSelector(test) {
    const moduleName = test.relative.replace(/\.py$/i, "").replace(/[\\/]/g, ".");
    return `${moduleName}.${test.selector}`;
  }

  debugConfiguration(testId) {
    if (!this.tests.size) this.discover();
    const test = this.tests.get(testId);
    if (!test) throw new Error("Test was not found.");
    return { runtime: test.runtime, request: "launch", program: test.file, cwd: this.root, stopOnEntry: false, breakpoints: { [test.file]: [{ line: test.line }] }, name: `Debug ${test.label}`, test };
  }

  describe(run) { return JSON.parse(JSON.stringify(run)); }
}

module.exports = { BlueTestService };
