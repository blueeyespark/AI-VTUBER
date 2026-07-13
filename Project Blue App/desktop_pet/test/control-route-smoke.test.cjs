const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { auditControlCenter } = require("../control-audit.cjs");

const desktopPetRoot = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(desktopPetRoot, name), "utf8");
}

function values(source, expression, group = 1) {
  return [...source.matchAll(expression)].map(match => match[group]);
}

function unique(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

test("every visible route, button, and backend bridge leads somewhere", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  const preload = read("preload.cjs");
  const main = read("main.cjs");
  const audit = auditControlCenter(desktopPetRoot);

  const panels = unique(values(html, /\bdata-panel\s*=\s*["']([^"']+)["']/gi));
  const tabs = unique(values(html, /\bdata-tab\s*=\s*["']([^"']+)["']/gi));
  const routes = unique(values(html, /\bdata-open-tab\s*=\s*["']([^"']+)["']/gi));
  const ids = new Set(values(html, /\bid\s*=\s*["']([^"']+)["']/gi));
  const buttonIds = unique(values(html, /<button\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const selectorIds = new Set([
    ...values(renderer, /querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g),
    ...values(renderer, /getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)
  ]);
  const bridgeUsed = unique(values(renderer, /window\.bluePet\.([A-Za-z0-9_]+)/g));
  const bridgeExposed = unique(values(preload, /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm));
  const invokeChannels = unique(values(preload, /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g));
  const sendChannels = unique(values(preload, /ipcRenderer\.send\(\s*["']([^"']+)["']/g));
  const handledChannels = new Set([
    ...values(main, /trustedHandle\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.handle\(\s*["']([^"']+)["']/g)
  ]);
  const listenedChannels = new Set([
    ...values(main, /trustedOn\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.on\(\s*["']([^"']+)["']/g)
  ]);

  assert.deepEqual(routes.filter(route => !panels.includes(route)), [], "data-open-tab route without panel");
  assert.deepEqual(tabs.filter(tab => !panels.includes(tab)), [], "data-tab route without panel");
  assert.deepEqual(buttonIds.filter(id => !selectorIds.has(id)), [], "button id not handled by renderer");
  assert.deepEqual([...selectorIds].filter(id => !ids.has(id)), [], "renderer selector points to missing element");
  assert.deepEqual(bridgeUsed.filter(method => !bridgeExposed.includes(method)), [], "renderer uses missing preload bridge method");
  assert.deepEqual(invokeChannels.filter(channel => !handledChannels.has(channel)), [], "preload invoke channel has no main handler");
  assert.deepEqual(sendChannels.filter(channel => !listenedChannels.has(channel)), [], "preload send channel has no main listener");
  assert.deepEqual(audit.placement.misplacedControls, [], "mapped button is in the wrong workspace");
  assert.equal(audit.ok, true, audit.issues.join("\n"));
});

test("control panel avoids dead decorative tabs and duplicate chat shortcuts", () => {
  const html = read("index.html");
  const renderer = read("control.js");

  assert.equal(
    /<button\b[^>]*class=["'][^"']*editor-tab/i.test(html),
    false,
    "decorative editor tabs should not be clickable buttons"
  );
  assert.equal(
    /id=["']chatExplorer(?:Files|Images|Ocr|Idea|Research|Agent)["']/i.test(html),
    false,
    "chat side panel should not duplicate composer buttons"
  );
  assert.equal(
    /chatExplorer(?:Files|Images|Ocr|Idea|Research|Agent)/.test(renderer),
    false,
    "renderer should not keep stale duplicate chat shortcut handlers"
  );
  assert.equal(
    /<div class=["']nav-scroll["'] hidden>/i.test(html),
    false,
    "hamburger side navigation must not be permanently hidden"
  );
});
