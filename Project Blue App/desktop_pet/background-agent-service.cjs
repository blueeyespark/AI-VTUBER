"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { explainAction } = require("./explainability-service.cjs");
const SECRET = /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/ig;
const UNSAFE_PROCESS = /(?:exec|spawn|execFile)(?:Sync)?\s*\([^\n]{0,160}(?:shell\s*:\s*true|cmd(?:\.exe)?\s+\/c|powershell\s+-command)/i;

function dependencyCycles(graph, limit = 30) {
  const adjacency = new Map();
  for (const edge of graph.edges.filter(item => item.kind === "imports")) { if (!adjacency.has(edge.from)) adjacency.set(edge.from, []); adjacency.get(edge.from).push(edge.to); }
  const visiting = new Set(); const visited = new Set(); const cycles = []; const stack = [];
  function visit(node) {
    if (cycles.length >= limit || visited.has(node)) return;
    if (visiting.has(node)) { const start = stack.indexOf(node); cycles.push([...stack.slice(start), node]); return; }
    visiting.add(node); stack.push(node); for (const next of adjacency.get(node) || []) visit(next); stack.pop(); visiting.delete(node); visited.add(node);
  }
  for (const node of adjacency.keys()) visit(node);
  return cycles;
}

class BackgroundAgentService {
  constructor(workspaceRoot, services = {}) { this.workspaceRoot = path.resolve(workspaceRoot); this.services = services; }
  catalog() { const descriptions = { documentation: "Find documentation gaps in large source modules.", security: "Scan source text for credential-like patterns without exposing values.", performance: "Flag unusually large indexed files and assets.", architecture: "Find oversized architecture hotspots.", research: "Prepare bounded research inventory without browsing automatically.", dependency: "Inspect dependency graph quality.", "code-cleanup": "Find refactoring candidates without editing them.", testing: "Find source modules without directly named tests.", "asset-indexer": "Report indexed assets and metadata.", "background-indexer": "Refresh read-only workspace understanding." }; return Object.keys(descriptions).map(id => ({ id, name: id.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" "), description: descriptions[id], mode: "read-only", approvalRequiredForChanges: true })); }
  run(id) {
    if (!this.catalog().some(item => item.id === id)) throw new Error(`Unknown background agent: ${id}`);
    const graph = this.services.knowledge?.graph?.() || { nodes: [], edges: [] }; const findings = [];
    if (id === "architecture" || id === "code-cleanup") for (const node of graph.nodes.filter(item => item.lines > 800).slice(0, 50)) findings.push({ severity: "warning", file: node.id, message: `${node.lines} lines; consider a reviewed module split.` });
    if (id === "dependency" || id === "architecture") {
      const seen = new Set(); for (const edge of graph.edges) { const key = `${edge.from}->${edge.to}:${edge.kind}`; if (seen.has(key)) findings.push({ severity: "info", file: edge.from, message: `Duplicate ${edge.kind} edge to ${edge.to}.` }); seen.add(key); }
      for (const cycle of dependencyCycles(graph)) findings.push({ severity: "warning", file: cycle[0], message: `Circular dependency: ${cycle.join(" -> ")}` });
    }
    if (id === "security") for (const node of graph.nodes.filter(item => !item.file && item.lines).slice(0, 2500)) { const file = path.join(this.workspaceRoot, node.id); try { const text = fs.readFileSync(file, "utf8"); if (SECRET.test(text)) findings.push({ severity: "high", file: node.id, message: "Potential hard-coded credential pattern; review without exposing the value." }); SECRET.lastIndex = 0; if (UNSAFE_PROCESS.test(text)) findings.push({ severity: "warning", file: node.id, message: "Potential shell-command construction requires injection and permission review." }); } catch {} }
    if (id === "documentation") for (const node of graph.nodes.filter(item => /\.(?:js|cjs|mjs|py)$/.test(item.id) && item.lines > 400).slice(0, 50)) findings.push({ severity: "info", file: node.id, message: "Large source file may need architecture documentation." });
    if (id === "performance") {
      for (const node of graph.nodes.filter(item => item.bytes > 500000).slice(0, 50)) findings.push({ severity: "warning", file: node.id, message: `${Math.round(node.bytes / 1024)} KiB file may affect indexing, startup, or bundle performance.` });
      for (const node of graph.nodes.filter(item => item.lines > 1500).slice(0, 50)) findings.push({ severity: "info", file: node.id, message: "Large executable module may increase parse time and memory pressure." });
    }
    if (id === "testing") for (const node of graph.nodes.filter(item => /\.(?:js|cjs|mjs|py)$/.test(item.id) && !/(?:test|spec)/i.test(item.id)).slice(0, 100)) { if (!graph.nodes.some(test => /(?:test|spec)/i.test(test.id) && test.id.includes(path.basename(node.id).split(".")[0]))) findings.push({ severity: "info", file: node.id, message: "No directly named test file was found." }); }
    if (id === "research") {
      const planning = graph.metadata?.planning || {};
      for (const item of [...(planning.goals || []), ...(planning.risks || [])].slice(0, 100)) findings.push({ severity: "info", file: item.file, message: `Research candidate at line ${item.line}: ${item.text}` });
    }
    if (id === "asset-indexer") {
      const assets = graph.nodes.filter(item => item.kind === "asset" || item.type === "asset");
      for (const node of assets.slice(0, 200)) findings.push({ severity: "info", file: node.id, message: `${node.extension || "asset"}, ${node.bytes || 0} bytes.` });
    }
    if (id === "background-indexer") findings.push({ severity: "info", file: ".", message: `Indexed ${graph.nodes.length} nodes and ${graph.edges.length} relationships.` });
    const agent = this.catalog().find(item => item.id === id); const report = { version: 1, agent, mode: "read-only", readOnly: true, generatedAt: new Date().toISOString(), findings: findings.slice(0, 200) };
    report.explanation = explainAction({ action: `${id} agent analysis`, why: `Prepared ${report.findings.length} finding(s) without modifying files.`, evidence: report.findings.map(item => ({ source: item.file || id, detail: item.message })), files: report.findings.map(item => item.file).filter(Boolean), risk: "low", requiresApproval: false, undo: "No changes were made.", verification: ["Review every finding", "Approve a separate change proposal before editing"], confidence: 0.65 }, { workspaceRoot: this.workspaceRoot }); return report;
  }
}

module.exports = { BackgroundAgentService };
