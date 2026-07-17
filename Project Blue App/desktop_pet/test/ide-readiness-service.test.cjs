"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { IdeReadinessService, capability } = require("../ide-readiness-service.cjs");

test("capability reports missing methods honestly", () => {
  const result = capability("Editor", ["open", "save"], ["open"]);
  assert.equal(result.score, 50);
  assert.deepEqual(result.missing, ["save"]);
});

test("IDE readiness snapshot scores real service interfaces without inventing readiness", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-ide-ready-"));
  const service = new IdeReadinessService(root, {
    editor: { open() {}, update() {}, save() {}, undo() {}, redo() {}, searchWorkspace() {}, workspaceRoots() {}, recentFiles() {}, diff() {} },
    terminal: {}, git: {}, language: { profiles: () => [] }, debug: { adapters: () => [] }, tests: {}, extensions: {}, workspaceAgent: {}, context: {},
    health: { snapshot: () => ({ terminal: { state: "attention" }, ui: { counts: { placeholder: 4 } } }) }
  }, { desktopRoot: root });
  const result = service.snapshot();
  assert.equal(result.areas.find(item => item.area === "Editor").score, 100);
  assert.ok(result.blockers.some(item => item.includes("language server")));
  assert.ok(result.blockers.some(item => item.includes("4 modular UI")));
  assert.match(service.summary(result), /Independent IDE readiness/);
});
