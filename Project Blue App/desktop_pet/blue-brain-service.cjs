"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PRIVATE = /(?:token|secret|password|credential|authorization|cookie|private.?key)/i;
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); }
function clean(value, depth = 0) {
  if (depth > 6) return "[bounded]";
  if (typeof value === "string") return PRIVATE.test(value) ? "[redacted]" : value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, PRIVATE.test(key) ? "[redacted]" : clean(item, depth + 1)]));
  return value;
}

class BlueBrainService {
  constructor(workspaceRoot, options = {}) { this.workspaceRoot = path.resolve(workspaceRoot); this.file = path.resolve(options.file || path.join(this.workspaceRoot, ".blue", "brain", "memory.json")); }
  document() { return read(this.file, { version: 1, records: [], goals: [], relationships: [], habits: [], history: [] }); }
  remember(input = {}, approved = false) {
    const kind = String(input.kind || "project").toLowerCase();
    if (["identity", "constitution", "personality"].includes(kind) && !approved) throw new Error(`${kind} memory requires explicit approval.`);
    if (PRIVATE.test(String(input.key || ""))) throw new Error("Secret-like memory keys are not allowed.");
    const doc = this.document(); const now = new Date().toISOString(); const id = input.id || crypto.randomUUID();
    const record = clean({ id, kind, key: String(input.key || id).slice(0, 200), value: input.value, project: input.project || path.basename(this.workspaceRoot), creatorId: input.creatorId || "local-creator", confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.5))), evidence: input.evidence || [], createdAt: now, updatedAt: now });
    const previous = doc.records.find(item => item.kind === kind && item.key === record.key);
    if (previous) Object.assign(previous, record, { id: previous.id, createdAt: previous.createdAt }); else doc.records.push(record);
    if (kind === "relationship") this.upsertTyped(doc.relationships, record, ["from", "to", "relation"]);
    if (kind === "habit") this.upsertTyped(doc.habits, record, ["name", "frequency", "status"]);
    doc.history.push({ id: crypto.randomUUID(), timestamp: now, operation: previous ? "update" : "create", recordId: previous?.id || record.id, kind, key: record.key });
    doc.history = doc.history.slice(-1000); atomic(this.file, doc); return previous || record;
  }
  recall(query = "", options = {}) { const q = String(query).toLowerCase(); return this.document().records.filter(item => (!options.kind || item.kind === options.kind) && (!q || JSON.stringify(item).toLowerCase().includes(q))).slice(0, Math.min(200, Number(options.limit) || 50)); }
  addGoal(goal = {}, approved = false) { if (!approved) throw new Error("Creating a persistent goal requires explicit approval."); const doc = this.document(); const item = clean({ id: crypto.randomUUID(), title: goal.title || "Untitled goal", status: goal.status || "planned", milestones: goal.milestones || [], risks: goal.risks || [], createdAt: new Date().toISOString() }); doc.goals.push(item); atomic(this.file, doc); return item; }
  upsertTyped(collection, record, fields) {
    const value = record.value && typeof record.value === "object" ? record.value : {};
    const item = clean({ id: record.id, key: record.key, ...Object.fromEntries(fields.map(field => [field, value[field] ?? null])), confidence: record.confidence, evidence: record.evidence, updatedAt: record.updatedAt });
    const existing = collection.find(entry => entry.key === item.key); if (existing) Object.assign(existing, item, { id: existing.id }); else collection.push(item);
    return item;
  }
  relate(relationship = {}, approved = false) {
    if (!approved) throw new Error("Creating a persistent relationship requires explicit approval.");
    return this.remember({ kind: "relationship", key: relationship.key || `${relationship.from || "unknown"}:${relationship.relation || "related"}:${relationship.to || "unknown"}`, value: relationship, confidence: relationship.confidence, evidence: relationship.evidence }, true);
  }
  trackHabit(habit = {}, approved = false) {
    if (!approved) throw new Error("Creating a persistent habit requires explicit approval.");
    return this.remember({ kind: "habit", key: habit.key || habit.name || crypto.randomUUID(), value: habit, confidence: habit.confidence, evidence: habit.evidence }, true);
  }
  decisions(query = "", limit = 50) { return this.recall(query, { kind: "decision", limit }); }
  snapshot() { const doc = this.document(); const byKind = {}; for (const item of doc.records) byKind[item.kind] = (byKind[item.kind] || 0) + 1; return { version: 2, records: doc.records.length, byKind, goals: doc.goals, relationships: doc.relationships, habits: doc.habits, decisions: doc.records.filter(item => item.kind === "decision").slice(-20), recent: doc.records.slice(-20) }; }
}

module.exports = { BlueBrainService, clean };
