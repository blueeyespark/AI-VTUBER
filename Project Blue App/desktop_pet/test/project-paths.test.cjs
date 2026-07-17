"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { resolveProjectRoot, relativeDesktopCwd } = require("../project-paths.cjs");

test("exported app resolves its own root instead of the parent download folder", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "blue-paths-"));
  const root = path.join(parent, "Blue_Agent_App");
  const desktop = path.join(root, "desktop_pet");
  fs.mkdirSync(path.join(root, "src", "project_blue"), { recursive: true });
  fs.mkdirSync(desktop, { recursive: true });
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='blue'\n", "utf8");
  assert.equal(resolveProjectRoot(desktop), root);
  assert.equal(relativeDesktopCwd(root, desktop), "desktop_pet");
});

test("legacy nested layout still resolves the repository root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-paths-legacy-"));
  const desktop = path.join(root, "Project Blue App", "desktop_pet");
  fs.mkdirSync(path.join(root, "src", "project_blue"), { recursive: true });
  fs.mkdirSync(desktop, { recursive: true });
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='blue'\n", "utf8");
  assert.equal(resolveProjectRoot(desktop), root);
  assert.equal(relativeDesktopCwd(root, desktop), "Project Blue App/desktop_pet");
});

test("explicit trusted workspace root wins when it is a valid Blue project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-paths-explicit-"));
  fs.mkdirSync(path.join(root, "src", "project_blue"), { recursive: true });
  fs.mkdirSync(path.join(root, "desktop_pet"), { recursive: true });
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='blue'\n", "utf8");
  assert.equal(resolveProjectRoot(path.join(root, "desktop_pet"), root), root);
});
