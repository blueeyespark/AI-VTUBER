"use strict";

const fs = require("node:fs");
const path = require("node:path");

function isProjectRoot(candidate) {
  if (!candidate) return false;
  const absolute = path.resolve(candidate);
  const strongMarkers = [
    path.join(absolute, "pyproject.toml"),
    path.join(absolute, "src", "project_blue"),
    path.join(absolute, "desktop_pet")
  ];
  return strongMarkers.filter(fs.existsSync).length >= 2;
}

function resolveProjectRoot(desktopRoot = __dirname, explicitRoot = process.env.BLUE_WORKSPACE_ROOT) {
  const candidates = [
    explicitRoot,
    path.resolve(desktopRoot, ".."),
    path.resolve(desktopRoot, "..", ".."),
    process.cwd()
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isProjectRoot(candidate)) return path.resolve(candidate);
  }

  // Safe fallback: keep Blue inside the exported application folder instead of
  // accidentally granting workspace access to the parent Downloads directory.
  return path.resolve(desktopRoot, "..");
}

function relativeDesktopCwd(projectRoot, desktopRoot = __dirname) {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(desktopRoot));
  if (!relative || relative === ".") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return ".";
  return relative.replaceAll("\\", "/");
}

module.exports = { isProjectRoot, resolveProjectRoot, relativeDesktopCwd };
