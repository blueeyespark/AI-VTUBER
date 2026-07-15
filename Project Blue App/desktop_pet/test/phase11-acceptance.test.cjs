const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Phase 11 Blue capabilities share one workbench service", () => {
  const service = read("blue-feature-service.cjs");
  const main = read("main.cjs");
  const preload = read("preload.cjs");
  const agent = read("workspace-agent.cjs");
  for (const feature of ["memory", "bluemesh", "discord", "streaming", "voice", "vision", "companion", "research", "ideas", "generated", "workflows"]) {
    assert.match(service, new RegExp(`\\b${feature}:`));
  }
  assert.match(main, /blue:feature-catalog/);
  assert.match(main, /blue:feature-action/);
  assert.match(preload, /featureCatalog/);
  assert.match(preload, /featureAction/);
  assert.match(agent, /services\.blue\?\.handleMessage/);
});

test("Phase 11 capability editors remain in the common IDE shell", () => {
  const required = [
    "workspace/chat-editor.js", "workspace/research-editor.js", "workspace/idea-editor.js",
    "workspace/generated-result-editor.js", "presence/voice-editor.js", "presence/vision-editor.js",
    "presence/avatar-editor.js", "streaming/obs-editor.js", "streaming/platform-editor.js",
    "discord/discord-connection-editor.js", "bluemesh/sync-editor.js", "bluemesh/conflict-editor.js",
    "shell/app-shell.js", "shell/editor-area.js", "shell/editor-tabs.js"
  ];
  for (const relative of required) assert.equal(fs.existsSync(path.join(root, "ui", relative)), true, relative);
});

test("Phase 11 keeps sensitive actions approval-gated and secrets out of the catalog", () => {
  const service = read("blue-feature-service.cjs");
  assert.match(service, /requires explicit approval/);
  assert.doesNotMatch(service, /process\.env/);
  assert.doesNotMatch(service, /\.env/);
  assert.doesNotMatch(service, /token\s*:/i);
});
