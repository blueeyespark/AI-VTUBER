"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { WorkbenchHealthService, inspectUiModules, inspectProjectRoot } = require("../workbench-health-service.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-health-"));
  fs.mkdirSync(path.join(root, "ui", "shell"), { recursive: true });
  fs.writeFileSync(path.join(root, "ui", "shell", "one.js"), "// Project Blue UI component placeholder for One.\n", "utf8");
  fs.writeFileSync(path.join(root, "ui", "shell", "two.js"), "module.exports = { ready: true };\n", "utf8");
  for (const name of ["main.cjs", "preload.cjs", "control.js", "control-audit.cjs", "workspace-agent.cjs", "terminal-service.cjs", "git-service.cjs", "editor-service.cjs", "language-service.cjs"]) {
    fs.writeFileSync(path.join(root, name), "module.exports = {};\n", "utf8");
  }
  for (const name of ["index.html", "control.css", "control-ide.css", "package.json"]) {
    fs.writeFileSync(path.join(root, name), name === "package.json" ? "{}\n" : "", "utf8");
  }
  return root;
}

test("UI inventory distinguishes placeholders from implementations", () => {
  const root = fixture();
  const result = inspectUiModules(root);
  assert.equal(result.counts.placeholder, 1);
  assert.equal(result.counts.implemented, 1);
});

test("health snapshot never reports placeholder modules as implemented", () => {
  const root = fixture();
  const service = new WorkbenchHealthService(root);
  const result = service.snapshot();
  assert.equal(result.ui.counts.placeholder, 1);
  assert.match(service.summary(result), /1 placeholders/);
  assert.equal(result.requiredFiles.state, "ready");
});


test("project root inspection keeps exported Blue inside its application folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-health-root-"));
  const desktop = path.join(root, "desktop_pet");
  fs.mkdirSync(path.join(root, "src", "project_blue"), { recursive: true });
  fs.mkdirSync(desktop, { recursive: true });
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='blue'\n", "utf8");
  fs.writeFileSync(path.join(desktop, "package.json"), "{}\n", "utf8");
  const result = inspectProjectRoot(desktop);
  assert.equal(result.state, "ready");
  assert.equal(result.projectRoot, root);
  assert.equal(result.desktopCwd, "desktop_pet");
});
