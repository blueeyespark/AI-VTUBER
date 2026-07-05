"use strict";

const fs = require("node:fs");
const path = require("node:path");

const LEVELS = Object.freeze(["off", "quiet", "balanced", "social"]);
const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  proactivity: "balanced",
  visionEnabled: false,
  microphoneEnabled: false,
  captureAllowlist: [],
  observationRetention: "manual-shares-only"
});

const PROACTIVITY = Object.freeze({
  off: Object.freeze({
    runChance: 0,
    arrivalActionChance: 0,
    pauseMinMs: 12000,
    pauseRangeMs: 6000
  }),
  quiet: Object.freeze({
    runChance: 0.1,
    arrivalActionChance: 0.3,
    pauseMinMs: 6000,
    pauseRangeMs: 6000
  }),
  balanced: Object.freeze({
    runChance: 0.3,
    arrivalActionChance: 0.75,
    pauseMinMs: 1800,
    pauseRangeMs: 4200
  }),
  social: Object.freeze({
    runChance: 0.42,
    arrivalActionChance: 1,
    pauseMinMs: 700,
    pauseRangeMs: 1800
  })
});

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const proactivity = LEVELS.includes(source.proactivity)
    ? source.proactivity
    : DEFAULT_SETTINGS.proactivity;
  return {
    ...DEFAULT_SETTINGS,
    proactivity,
    // Vision and microphone activation are deliberately not accepted from disk
    // until real, permission-gated providers are implemented.
    visionEnabled: false,
    microphoneEnabled: false,
    captureAllowlist: Array.isArray(source.captureAllowlist)
      ? source.captureAllowlist.filter(item => typeof item === "string").slice(0, 100)
      : []
  };
}

function loadSettings(filePath) {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return normalizeSettings();
  }
}

function saveSettings(filePath, settings) {
  const normalized = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
  return normalized;
}

function proactivityProfile(level) {
  return PROACTIVITY[LEVELS.includes(level) ? level : DEFAULT_SETTINGS.proactivity];
}

function appendObservation(filePath, observation) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record = {
    id: observation.id,
    timestamp: observation.timestamp || new Date().toISOString(),
    source: "manual-share",
    permission: "user-selected",
    name: String(observation.name || "image"),
    preservedPath: String(observation.preservedPath || ""),
    width: Number.isFinite(observation.width) ? observation.width : null,
    height: Number.isFinite(observation.height) ? observation.height : null,
    sha256: String(observation.sha256 || ""),
    interpretation: String(observation.interpretation || "not-analyzed").slice(0, 80),
    provider: observation.provider ? String(observation.provider).slice(0, 80) : null,
    extractedText: observation.extractedText
      ? String(observation.extractedText).slice(0, 100000)
      : null
  };
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  const records = readJsonLines(filePath);
  if (records.length > 250) {
    writeJsonLines(filePath, records.slice(-250));
  }
  return record;
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line)]; }
      catch { return []; }
    });
}

function writeJsonLines(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const content = records.length
    ? `${records.map(record => JSON.stringify(record)).join("\n")}\n`
    : "";
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, filePath);
}

function readObservations(filePath, limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  return readJsonLines(filePath)
    .slice(-safeLimit)
    .reverse();
}

function deleteObservation(filePath, id) {
  const records = readJsonLines(filePath);
  const retained = records.filter(record => record.id !== id);
  if (retained.length === records.length) return false;
  writeJsonLines(filePath, retained);
  return true;
}

function clearObservations(filePath) {
  if (fs.existsSync(filePath)) writeJsonLines(filePath, []);
}

function appendActivity(filePath, category, summary, details = {}) {
  const allowedCategories = new Set([
    "system", "conversation", "sharing", "movement", "privacy", "settings"
  ]);
  const record = {
    id: cryptoRandomId(),
    timestamp: new Date().toISOString(),
    category: allowedCategories.has(category) ? category : "system",
    summary: String(summary || "Activity").replace(/\s+/g, " ").trim().slice(0, 240),
    details: details && typeof details === "object" ? details : {}
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  const records = readJsonLines(filePath);
  if (records.length > 500) writeJsonLines(filePath, records.slice(-500));
  return record;
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readActivity(filePath, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  return readJsonLines(filePath).slice(-safeLimit).reverse();
}

function clearActivity(filePath) {
  if (fs.existsSync(filePath)) writeJsonLines(filePath, []);
}

module.exports = {
  DEFAULT_SETTINGS,
  LEVELS,
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
};
