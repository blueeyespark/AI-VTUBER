const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "companion", "STREAMER_CAPABILITY_MANIFEST.json"), "utf8"));
const html = fs.readFileSync(path.join(desktopRoot, "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(desktopRoot, "control.js"), "utf8");
const shell = fs.readFileSync(path.join(desktopRoot, "ui", "shell", "app-shell.js"), "utf8");
const core = require(path.join(desktopRoot, "streaming-core.cjs"));

test("streamer manifest preserves every required platform and show format", () => {
  const platforms = new Set(core.streamingPlatformCatalog().map(item => item.id));
  const shows = new Set(core.streamShowCatalog().map(item => item.id));
  for (const id of manifest.requiredPlatforms) assert.ok(platforms.has(id), `missing streaming platform: ${id}`);
  for (const id of manifest.requiredShowFormats) assert.ok(shows.has(id), `missing streaming show format: ${id}`);
});

test("every preserved streamer idea has a real editor route and panel", () => {
  for (const editor of manifest.requiredEditors) {
    assert.match(shell, new RegExp(`id:\\s*["']${editor}["']`), `missing shell editor: ${editor}`);
    assert.match(html, new RegExp(`data-panel=["']streaming["'][^>]*data-editor=["']${editor}["']`), `missing streaming panel: ${editor}`);
  }
  for (const capability of manifest.capabilities) assert.ok(manifest.requiredEditors.includes(capability.editor), `capability ${capability.id} has an untracked editor`);
});

test("critical streamer controls remain visible and wired", () => {
  const controls = [
    "streamingShowRunner", "streamingFullPreflight", "streamingObsCheck", "streamingObsSceneRefresh",
    "streamingObsSceneSwitch", "streamingSavePlatform", "streamingAdultReadiness", "streamingChatReadiness",
    "streamingModerationPlan", "streamingMetadataPreview", "streamingAvatarSave", "streamingVoiceSafety"
  ];
  for (const id of controls) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing control: ${id}`);
    assert.match(renderer, new RegExp(`wire\\(["']${id}["']`), `unwired control: ${id}`);
  }
});

test("streaming UI keeps approval and secret boundaries visible", () => {
  assert.match(html, /session-only password/i);
  assert.match(html, /I approve switching to the selected scene/i);
  assert.match(html, /verified consenting adults/i);
  assert.match(renderer, /approved:\s*Boolean\(streamingElement\("streamingSceneApprove"\)/);
  assert.equal(core.sanitizeStreamingConfig({ token: "secret", streamKey: "secret", password: "secret" }).token, undefined);
});
