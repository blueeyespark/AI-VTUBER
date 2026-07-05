"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseHttpUrl(value) {
  const input = String(value || "").trim();
  if (!input || input.length > 4096) {
    throw new Error("Enter a complete link no longer than 4,096 characters.");
  }
  let parsed;
  try { parsed = new URL(input); }
  catch { throw new Error("Enter a complete http:// or https:// link."); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https links are accepted.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Links containing embedded usernames or passwords are not accepted.");
  }
  return parsed;
}

function validateChatMessage(value) {
  const message = String(value || "").trim();
  if (!message) throw new Error("Type a message for Blue first.");
  if (message.length > 50000) {
    throw new Error("Messages are limited to 50,000 characters.");
  }
  return message;
}

function validateVoiceTranscript(value) {
  const transcript = String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (!transcript) throw new Error("No speech was recognized.");
  if (transcript.length > 10000) {
    throw new Error("The voice transcript exceeded 10,000 characters.");
  }
  return transcript;
}

function parseOcrPayload(value) {
  let payload;
  try { payload = JSON.parse(String(value || "")); }
  catch { throw new Error("The local OCR helper returned invalid data."); }
  if (!payload || typeof payload !== "object") {
    throw new Error("The local OCR helper returned invalid data.");
  }
  const text = String(payload.text || "")
    .replace(/\u0000/g, "")
    .trim();
  if (text.length > 100000) {
    throw new Error("OCR text is limited to 100,000 characters.");
  }
  return {
    language: String(payload.language || "unknown").slice(0, 40),
    text,
    lines: Math.max(0, Number(payload.lines) || 0),
    width: Math.max(0, Number(payload.width) || 0),
    height: Math.max(0, Number(payload.height) || 0),
    provider: "Windows.Media.Ocr"
  };
}

function parseSecuritySnapshot(value) {
  let payload;
  try { payload = JSON.parse(String(value || "")); }
  catch { throw new Error("The Windows security helper returned invalid data."); }
  if (
    !payload || typeof payload !== "object"
    || payload.schema !== "project-blue-windows-security-snapshot-v1"
    || payload.readOnly !== true
  ) {
    throw new Error("The Windows security helper returned invalid data.");
  }
  const states = new Set(["healthy", "attention", "unavailable"]);
  const cleanText = (input, limit = 200) =>
    String(input ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
  const cleanAge = input => {
    if (input === null || input === undefined || !Number.isFinite(Number(input))) {
      return null;
    }
    return Math.max(0, Number(input));
  };
  const cleanRows = (rows, keys, limit) =>
    (Array.isArray(rows) ? rows : []).slice(0, limit).map(row =>
      Object.fromEntries(keys.map(key => [key, cleanText(row?.[key])]))
    );
  const defender = payload.defender && typeof payload.defender === "object"
    ? {
        antivirusEnabled: Boolean(payload.defender.antivirusEnabled),
        antispywareEnabled: Boolean(payload.defender.antispywareEnabled),
        realTimeProtectionEnabled: Boolean(payload.defender.realTimeProtectionEnabled),
        behaviorMonitorEnabled: Boolean(payload.defender.behaviorMonitorEnabled),
        ioavProtectionEnabled: Boolean(payload.defender.ioavProtectionEnabled),
        networkInspectionEnabled: Boolean(payload.defender.networkInspectionEnabled),
        onAccessProtectionEnabled: Boolean(payload.defender.onAccessProtectionEnabled),
        runningMode: cleanText(payload.defender.runningMode, 80),
        antivirusSignatureAgeDays: cleanAge(payload.defender.antivirusSignatureAgeDays),
        antivirusSignatureLastUpdated:
          cleanText(payload.defender.antivirusSignatureLastUpdated, 80),
        quickScanAgeDays: cleanAge(payload.defender.quickScanAgeDays),
        fullScanAgeDays: cleanAge(payload.defender.fullScanAgeDays),
        rebootRequired: Boolean(payload.defender.rebootRequired)
      }
    : null;
  return {
    schema: payload.schema,
    scannedAt: cleanText(payload.scannedAt, 80),
    readOnly: true,
    state: states.has(payload.state) ? payload.state : "unavailable",
    defender,
    firewallProfiles: cleanRows(
      payload.firewallProfiles,
      ["Name", "Enabled", "DefaultInboundAction", "DefaultOutboundAction"],
      10
    ),
    threatDetections: cleanRows(
      payload.threatDetections,
      ["ThreatID", "InitialDetectionTime", "ActionSuccess", "CurrentThreatExecutionStatusID"],
      20
    ),
    antivirusProducts: cleanRows(
      payload.antivirusProducts,
      ["displayName", "productState", "timestamp"],
      10
    ),
    startupCommands: cleanRows(
      payload.startupCommands,
      ["Name", "Location", "User"],
      80
    ),
    providerErrors: (Array.isArray(payload.providerErrors) ? payload.providerErrors : [])
      .slice(0, 10).map(item => cleanText(item, 300)),
    limitations: (Array.isArray(payload.limitations) ? payload.limitations : [])
      .slice(0, 10).map(item => cleanText(item, 300))
  };
}

function normalizeSharedPaths(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
    throw new Error("Share between 1 and 100 dropped items.");
  }
  const unique = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value || value.includes("\0")) {
      throw new Error("A shared path is invalid.");
    }
    if (!path.isAbsolute(value)) {
      throw new Error("Shared paths must be absolute.");
    }
    let realPath;
    try { realPath = fs.realpathSync(value); }
    catch { throw new Error(`Shared item was not found: ${path.basename(value)}`); }
    const stat = fs.statSync(realPath);
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(`Unsupported shared item: ${path.basename(realPath)}`);
    }
    if (stat.isFile() && stat.size > 1073741824) {
      throw new Error(`Shared files are limited to 1 GB: ${path.basename(realPath)}`);
    }
    unique.add(realPath);
  }
  return [...unique];
}

module.exports = {
  normalizeSharedPaths,
  parseOcrPayload,
  parseSecuritySnapshot,
  parseHttpUrl,
  validateChatMessage,
  validateVoiceTranscript
};
