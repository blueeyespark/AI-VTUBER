"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { explainAction } = require("./explainability-service.cjs");

class SemanticTimelineService {
  constructor(workspaceRoot, options = {}) { this.workspaceRoot = path.resolve(workspaceRoot); this.file = path.resolve(options.file || path.join(this.workspaceRoot, ".blue", "timeline", "events.jsonl")); }
  record(input = {}, approved = false) { if (!approved) throw new Error("Recording a persistent semantic timeline event requires explicit approval."); const event = { id: input.id || crypto.randomUUID(), timestamp: input.timestamp || new Date().toISOString(), type: String(input.type || "project.event").slice(0, 100), title: String(input.title || "Project event").slice(0, 300), why: String(input.why || "").slice(0, 2000), who: String(input.who || "local-creator").slice(0, 200), files: (input.files || []).slice(0, 100), evidence: (input.evidence || []).slice(0, 100), commit: String(input.commit || "").slice(0, 100), reversible: input.reversible !== false }; fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, "utf8"); return event; }
  events(limit = 100) { let lines = []; try { lines = fs.readFileSync(this.file, "utf8").split(/\r?\n/).filter(Boolean); } catch {} return lines.slice(-Math.max(1, Math.min(1000, Number(limit) || 100))).reverse().map(line => JSON.parse(line)); }
  search(query, limit = 50) { const q = String(query || "").toLowerCase(); return this.events(1000).filter(item => JSON.stringify(item).toLowerCase().includes(q)).slice(0, limit); }
  reconstruct(query) { const matches = this.search(query, 20); return explainAction({ action: `Reconstruct project state: ${query}`, why: `${matches.length} semantic event(s) match this request.`, evidence: matches.map(item => ({ source: item.commit || item.id, detail: `${item.timestamp}: ${item.title} — ${item.why}` })), files: [...new Set(matches.flatMap(item => item.files || []))], risk: "high", requiresApproval: true, undo: "Create a checkpoint before applying any historical reconstruction.", verification: ["Review matching commits and events", "Create a branch or backup", "Run the affected test suites"], confidence: matches.length ? 0.75 : 0.2 }, { workspaceRoot: this.workspaceRoot }); }
}

module.exports = { SemanticTimelineService };
