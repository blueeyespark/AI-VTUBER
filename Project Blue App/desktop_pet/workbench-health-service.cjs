"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveProjectRoot, relativeDesktopCwd } = require("./project-paths.cjs");

const PLACEHOLDER_PATTERN = /^\s*\/\/\s*Project Blue UI component placeholder for\s+(.+?)\.\s*$/;

function walkFiles(root, options = {}) {
  const results = [];
  const ignored = new Set(options.ignored || ["node_modules", ".git", ".blue", "vendor"]);
  const visit = current => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else results.push(absolute);
    }
  };
  visit(root);
  return results;
}

function inspectUiModules(desktopRoot) {
  const uiRoot = path.join(desktopRoot, "ui");
  const files = walkFiles(uiRoot).filter(file => file.endsWith(".js"));
  const modules = files.map(file => {
    const content = fs.readFileSync(file, "utf8");
    const firstMeaningful = content.split(/\r?\n/).find(line => line.trim()) || "";
    const placeholder = firstMeaningful.match(PLACEHOLDER_PATTERN);
    return {
      path: path.relative(desktopRoot, file).replaceAll("\\", "/"),
      state: placeholder ? "placeholder" : content.trim() ? "implemented" : "empty",
      component: placeholder?.[1] || "",
      bytes: Buffer.byteLength(content, "utf8")
    };
  });
  const counts = modules.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, { implemented: 0, placeholder: 0, empty: 0 });
  const total = modules.length || 1;
  const coverage = Math.round((counts.implemented / total) * 100);
  const registryPresent = fs.existsSync(path.join(uiRoot, "registry.js"));
  return { root: uiRoot, counts, coverage, registryPresent, modules };
}

function inspectNativeTerminal(desktopRoot) {
  const packagePath = path.join(desktopRoot, "node_modules", "node-pty");
  const installed = fs.existsSync(packagePath);
  if (!installed) {
    return { state: "unavailable", installed: false, message: "node-pty is not installed." };
  }
  try {
    require.resolve("node-pty", { paths: [desktopRoot] });
    // Loading the module catches ABI/native binary problems that resolve() cannot.
    require(require.resolve("node-pty", { paths: [desktopRoot] }));
    return { state: "ready", installed: true, message: "Native terminal module loaded successfully." };
  } catch (error) {
    return {
      state: "attention",
      installed: true,
      message: String(error?.message || error || "node-pty failed to load."),
      recommendation: "Run npm install, then npm rebuild node-pty for the installed Electron version."
    };
  }
}

function inspectSyntax(desktopRoot) {
  const critical = [
    "main.cjs", "preload.cjs", "control.js", "control-audit.cjs", "workspace-agent.cjs",
    "terminal-service.cjs", "git-service.cjs", "editor-service.cjs", "language-service.cjs"
  ];
  const results = critical.map(name => {
    const absolute = path.join(desktopRoot, name);
    if (!fs.existsSync(absolute)) return { path: name, state: "missing", message: "Required file is missing." };
    const run = spawnSync(process.execPath, ["--check", absolute], { cwd: desktopRoot, encoding: "utf8" });
    return {
      path: name,
      state: run.status === 0 ? "ready" : "error",
      message: run.status === 0 ? "Syntax valid." : String(run.stderr || run.stdout || "Syntax check failed.").trim()
    };
  });
  return {
    state: results.every(item => item.state === "ready") ? "ready" : "attention",
    results
  };
}


function inspectProjectRoot(desktopRoot) {
  const projectRoot = resolveProjectRoot(desktopRoot);
  const desktopCwd = relativeDesktopCwd(projectRoot, desktopRoot);
  const parent = path.resolve(projectRoot, "..");
  const markers = {
    pyproject: fs.existsSync(path.join(projectRoot, "pyproject.toml")),
    source: fs.existsSync(path.join(projectRoot, "src", "project_blue")),
    desktop: fs.existsSync(path.join(projectRoot, desktopCwd === "." ? "" : desktopCwd, "package.json"))
  };
  const ready = markers.pyproject && markers.source && markers.desktop;
  return {
    state: ready ? "ready" : "attention",
    projectRoot,
    desktopCwd,
    escapedToParent: projectRoot === parent,
    markers,
    message: ready ? "Project root is confined to the Blue application." : "Project root markers are incomplete; workspace access may be misconfigured."
  };
}

function inspectRequiredFiles(desktopRoot) {
  const required = [
    "main.cjs", "preload.cjs", "index.html", "control.js", "control.css", "control-ide.css",
    "control-audit.cjs", "package.json"
  ];
  const files = required.map(name => ({ path: name, exists: fs.existsSync(path.join(desktopRoot, name)) }));
  return { state: files.every(item => item.exists) ? "ready" : "error", files };
}

class WorkbenchHealthService {
  constructor(desktopRoot = __dirname) {
    this.desktopRoot = path.resolve(desktopRoot);
  }

  snapshot() {
    const ui = inspectUiModules(this.desktopRoot);
    const terminal = inspectNativeTerminal(this.desktopRoot);
    const syntax = inspectSyntax(this.desktopRoot);
    const requiredFiles = inspectRequiredFiles(this.desktopRoot);
    const projectRoot = inspectProjectRoot(this.desktopRoot);
    const issues = [];
    if (requiredFiles.state !== "ready") issues.push({ severity: "error", area: "startup", message: "One or more required startup files are missing." });
    if (syntax.state !== "ready") issues.push({ severity: "error", area: "syntax", message: "One or more critical JavaScript files failed syntax validation." });
    if (terminal.state !== "ready") issues.push({ severity: "warning", area: "terminal", message: terminal.message });
    if (projectRoot.state !== "ready") issues.push({ severity: "error", area: "workspace", message: projectRoot.message });
    if (!ui.registryPresent) issues.push({ severity: "warning", area: "ui", message: "The reusable UI component registry is missing." });
    if (ui.counts.placeholder > 0) issues.push({ severity: "warning", area: "ui", message: `${ui.counts.placeholder} UI modules are placeholders and must not be reported as implemented.` });
    if (ui.coverage < 50) issues.push({ severity: "warning", area: "ui", message: `UI modularization coverage is ${ui.coverage}%; the legacy shell still owns most rendering.` });
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      state: issues.some(item => item.severity === "error") ? "error" : issues.length ? "attention" : "ready",
      requiredFiles,
      syntax,
      terminal,
      projectRoot,
      ui,
      issues
    };
  }

  summary(snapshot = this.snapshot()) {
    const ui = snapshot.ui?.counts || {};
    const lines = [
      `Workbench health: ${snapshot.state}`,
      `- Startup files: ${snapshot.requiredFiles?.state || "unknown"}`,
      `- Critical syntax: ${snapshot.syntax?.state || "unknown"}`,
      `- Native terminal: ${snapshot.terminal?.state || "unknown"}`,
      `- Project root: ${snapshot.projectRoot?.state || "unknown"} (${snapshot.projectRoot?.desktopCwd || "unknown"})`,
      `- UI modules: ${ui.implemented || 0} implemented, ${ui.placeholder || 0} placeholders, ${ui.empty || 0} empty (${ui.coverage || 0}% modularized)`
    ];
    if (snapshot.issues?.length) lines.push("Issues:", ...snapshot.issues.map(item => `- [${item.severity}] ${item.area}: ${item.message}`));
    return lines.join("\n");
  }
}

module.exports = {
  WorkbenchHealthService,
  inspectUiModules,
  inspectNativeTerminal,
  inspectSyntax,
  inspectRequiredFiles,
  inspectProjectRoot
};
