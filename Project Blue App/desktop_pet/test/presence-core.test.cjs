"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  appendActivity,
  appendObservation,
  clearActivity,
  clearObservations,
  deleteObservation,
  loadSettings,
  normalizeSettings,
  proactivityProfile,
  readActivity,
  readObservations,
  saveSettings
} = require("../presence-core.cjs");

test("settings reject hidden vision and microphone activation", () => {
  const settings = normalizeSettings({
    proactivity: "social",
    visionEnabled: true,
    microphoneEnabled: true,
    captureAllowlist: ["game.exe", 42]
  });
  assert.equal(settings.proactivity, "social");
  assert.equal(settings.visionEnabled, false);
  assert.equal(settings.microphoneEnabled, false);
  assert.deepEqual(settings.captureAllowlist, ["game.exe"]);
});

test("unknown proactivity falls back to balanced", () => {
  assert.deepEqual(
    proactivityProfile("unknown"),
    proactivityProfile("balanced")
  );
});

test("settings save atomically and load", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blue-presence-"));
  const filePath = path.join(directory, "presence.json");
  saveSettings(filePath, { proactivity: "quiet" });
  assert.equal(loadSettings(filePath).proactivity, "quiet");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("observation ledger keeps manual-share provenance", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blue-observation-"));
  const filePath = path.join(directory, "observations.jsonl");
  appendObservation(filePath, {
    id: "one",
    timestamp: "2026-07-03T00:00:00.000Z",
    name: "blue.png",
    preservedPath: "inbox/blue.png",
    width: 100,
    height: 200,
    sha256: "abc",
    interpretation: "ocr-complete",
    provider: "Windows.Media.Ocr",
    extractedText: "Blue"
  });
  const records = readObservations(filePath);
  assert.equal(records.length, 1);
  assert.equal(records[0].permission, "user-selected");
  assert.equal(records[0].interpretation, "ocr-complete");
  assert.equal(records[0].provider, "Windows.Media.Ocr");
  assert.equal(records[0].extractedText, "Blue");
  assert.equal(deleteObservation(filePath, "one"), true);
  assert.deepEqual(readObservations(filePath), []);
  assert.equal(deleteObservation(filePath, "missing"), false);
  appendObservation(filePath, {
    id: "two",
    name: "second.png",
    sha256: "def"
  });
  clearObservations(filePath);
  assert.deepEqual(readObservations(filePath), []);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("activity timeline is local, bounded, and clearable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blue-activity-"));
  const filePath = path.join(directory, "activity.jsonl");
  appendActivity(filePath, "movement", "  Blue   waved  ", { action: "wave" });
  const records = readActivity(filePath);
  assert.equal(records.length, 1);
  assert.equal(records[0].category, "movement");
  assert.equal(records[0].summary, "Blue waved");
  assert.equal(records[0].details.action, "wave");
  clearActivity(filePath);
  assert.deepEqual(readActivity(filePath), []);
  fs.rmSync(directory, { recursive: true, force: true });
});
