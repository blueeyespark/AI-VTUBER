"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const modules = [
  "ui/registry.js", "ui/shared/button.js", "ui/shared/icon-button.js", "ui/shared/empty-state.js",
  "ui/shared/status-item.js", "ui/shared/text-field.js", "ui/shared/select.js", "ui/shared/checkbox.js",
  "ui/shared/tabs.js", "ui/shared/tree-view.js", "ui/shared/modal.js", "ui/shared/data-table.js",
  "ui/shared/context-menu.js", "ui/shell/resize-handle.js", "ui/shell/activity-bar.js",
  "ui/shell/editor-tabs.js", "ui/shell/bottom-panel.js", "ui/shell/status-bar.js",
  "ui/shell/command-center.js", "ui/shell/context-sidebar.js", "ui/shell/editor-area.js", "ui/shell/title-bar.js"
];

test("reusable UI modules are implemented and loaded before the app shell", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const shellIndex = html.indexOf('ui/shell/app-shell.js');
  assert.ok(shellIndex > 0);
  for (const relative of modules) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.ok(source.trim().length > 80, `${relative} should be implemented`);
    assert.doesNotMatch(source, /Project Blue UI component placeholder/);
    new vm.Script(source, { filename: relative });
    assert.ok(html.indexOf(relative) >= 0, `${relative} should be loaded by index.html`);
    assert.ok(html.indexOf(relative) < shellIndex, `${relative} should load before app-shell.js`);
  }
});

test("health service reports modularization coverage and registry presence", () => {
  const { WorkbenchHealthService } = require("../workbench-health-service.cjs");
  const snapshot = new WorkbenchHealthService(root).snapshot();
  assert.equal(snapshot.ui.registryPresent, true);
  assert.ok(snapshot.ui.coverage > 0);
  assert.ok(snapshot.ui.counts.implemented >= modules.length);
});
