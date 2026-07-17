"use strict";

const path = require("node:path");

function bounded(value, limit = 1000) { return String(value ?? "").slice(0, limit); }
function safeRelative(value, workspaceRoot) {
  const source = bounded(value, 500).replaceAll("\\", "/");
  if (!workspaceRoot || !source || path.isAbsolute(source) || source.split("/").includes("..")) return "";
  const root = path.resolve(workspaceRoot); const absolute = path.resolve(root, source);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return "";
  return path.relative(root, absolute).replaceAll("\\", "/");
}
function evidenceItem(item, workspaceRoot) {
  const source = bounded(item?.source || item?.path || "analysis", 500);
  const relative = safeRelative(source, workspaceRoot);
  return { source: relative || "analysis", detail: bounded(item?.detail || item?.reason || "", 1000) };
}

function explainAction(action = {}, options = {}) {
  const confidence = Math.max(0, Math.min(1, Number(action.confidence ?? 0.5)));
  return {
    version: 1,
    action: bounded(action.action || action.title || "analysis"),
    why: bounded(action.why || "No rationale supplied."),
    evidence: (action.evidence || []).slice(0, 50).map(item => evidenceItem(item, options.workspaceRoot)),
    files: [...new Set((action.files || []).map(item => safeRelative(item, options.workspaceRoot)).filter(Boolean))].slice(0, 100),
    risk: ["low", "medium", "high", "critical"].includes(action.risk) ? action.risk : "low",
    requiresApproval: Boolean(action.requiresApproval),
    undo: bounded(action.undo || "No changes were made."),
    verification: (action.verification || []).slice(0, 50).map(item => bounded(item, 500)),
    confidence,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { explainAction, safeRelative };
