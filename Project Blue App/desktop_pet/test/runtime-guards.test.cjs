"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  normalizeSharedPaths,
  parseOcrPayload,
  parseSecuritySnapshot,
  parseHttpUrl,
  validateChatMessage,
  validateVoiceTranscript
} = require("../runtime-guards.cjs");

test("HTTP links reject credentials and non-web protocols", () => {
  assert.equal(parseHttpUrl("https://example.com/a").hostname, "example.com");
  assert.throws(() => parseHttpUrl("file:///secret"), /Only http and https/);
  assert.throws(
    () => parseHttpUrl("https://user:secret@example.com"),
    /usernames or passwords/
  );
});

test("chat messages are present and bounded", () => {
  assert.equal(validateChatMessage(" hello "), "hello");
  assert.throws(() => validateChatMessage("   "), /Type a message/);
  assert.throws(() => validateChatMessage("a".repeat(50001)), /50,000/);
});

test("voice transcripts remove controls and remain editable text", () => {
  assert.equal(validateVoiceTranscript("  hello\u0000 Blue  "), "hello Blue");
  assert.throws(() => validateVoiceTranscript("\u0000  "), /No speech/);
  assert.throws(() => validateVoiceTranscript("a".repeat(10001)), /10,000/);
});

test("OCR payloads are parsed and bounded", () => {
  const parsed = parseOcrPayload(JSON.stringify({
    language: "en-US",
    text: "  Blue text  ",
    lines: 2,
    width: 640,
    height: 480,
    provider: "untrusted-value"
  }));
  assert.equal(parsed.text, "Blue text");
  assert.equal(parsed.provider, "Windows.Media.Ocr");
  assert.equal(parsed.lines, 2);
  assert.throws(() => parseOcrPayload("not-json"), /invalid data/);
  assert.throws(
    () => parseOcrPayload(JSON.stringify({ text: "x".repeat(100001) })),
    /100,000/
  );
});

test("security snapshots require the read-only schema and bound arrays", () => {
  const parsed = parseSecuritySnapshot(JSON.stringify({
    schema: "project-blue-windows-security-snapshot-v1",
    scannedAt: "2026-07-04T00:00:00Z",
    readOnly: true,
    state: "healthy",
    defender: {
      antivirusEnabled: true,
      realTimeProtectionEnabled: true,
      runningMode: "Normal",
      antivirusSignatureAgeDays: 1
    },
    firewallProfiles: [{ Name: "Private", Enabled: true }],
    threatDetections: [],
    antivirusProducts: [{ displayName: "Microsoft Defender" }],
    startupCommands: Array.from({ length: 100 }, (_, index) => ({
      Name: `Item ${index}`,
      Location: "Startup",
      User: "local"
    })),
    limitations: ["Read only"]
  }));
  assert.equal(parsed.state, "healthy");
  assert.equal(parsed.readOnly, true);
  assert.equal(parsed.defender.realTimeProtectionEnabled, true);
  assert.equal(parsed.startupCommands.length, 80);
  assert.throws(
    () => parseSecuritySnapshot(JSON.stringify({
      schema: "wrong",
      readOnly: true
    })),
    /invalid data/
  );
  assert.throws(
    () => parseSecuritySnapshot(JSON.stringify({
      schema: "project-blue-windows-security-snapshot-v1",
      readOnly: false
    })),
    /invalid data/
  );
});

test("shared paths are real, absolute, unique, and existing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blue-share-"));
  const filePath = path.join(directory, "note.txt");
  fs.writeFileSync(filePath, "Blue", "utf8");
  const result = normalizeSharedPaths([filePath, filePath]);
  assert.equal(result.length, 1);
  assert.equal(result[0], fs.realpathSync(filePath));
  assert.throws(() => normalizeSharedPaths(["relative.txt"]), /absolute/);
  assert.throws(
    () => normalizeSharedPaths([path.join(directory, "missing.txt")]),
    /not found/
  );
  fs.rmSync(directory, { recursive: true, force: true });
});
