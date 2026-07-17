"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { explainAction } = require("./explainability-service.cjs");
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); }

class KnowledgeGraphService {
  constructor(workspaceRoot, consciousness, options = {}) { this.workspaceRoot = path.resolve(workspaceRoot); this.consciousness = consciousness; this.file = path.resolve(options.file || path.join(this.workspaceRoot, ".blue", "knowledge", "graph.json")); }
  rebuild(extra = {}) {
    const base = this.consciousness.buildGraph();
    const nodes = base.nodes.map(item => ({ ...item, kind: item.kind || item.type || "file" }));
    const edges = [...base.edges];
    for (const item of (extra.nodes || []).slice(0, 1000)) nodes.push({ id: String(item.id), kind: item.kind || "knowledge", label: item.label || item.id, provenance: item.provenance || "creator" });
    for (const item of (extra.edges || []).slice(0, 2000)) edges.push({ from: String(item.from), to: String(item.to), kind: item.kind || "related" });
    const graph = {
      version: 2,
      generatedAt: new Date().toISOString(),
      nodes,
      edges,
      metadata: {
        ownership: base.ownership || [],
        coverage: base.coverage || {},
        planning: base.planning || { goals: [], milestones: [], risks: [], technicalDebt: [] }
      }
    };
    atomic(this.file, graph); return graph;
  }
  graph() {
    try { const graph = JSON.parse(fs.readFileSync(this.file, "utf8")); return Number(graph.version) >= 2 ? graph : this.rebuild(); }
    catch { return this.rebuild(); }
  }
  impact(id) {
    const graph = this.graph(); const inbound = graph.edges.filter(edge => edge.to === id); const outbound = graph.edges.filter(edge => edge.from === id);
    return explainAction({ action: `Impact analysis for ${id}`, why: inbound.length ? `${inbound.length} component(s) depend on this node.` : "No direct inbound dependency was found.", evidence: [...inbound, ...outbound].map(edge => ({ source: edge.from, detail: `${edge.kind} -> ${edge.to}` })), files: [...new Set([id, ...inbound.map(item => item.from), ...outbound.map(item => item.to)])], risk: inbound.length > 10 ? "high" : inbound.length ? "medium" : "low", requiresApproval: false, undo: "Read-only analysis; nothing changed.", verification: ["Rebuild the graph", "Run affected tests before removal"], confidence: graph.nodes.some(node => node.id === id) ? 0.85 : 0.35 }, { workspaceRoot: this.workspaceRoot });
  }
  critical(limit = 20) { const graph = this.graph(); const inbound = new Map(); for (const edge of graph.edges) inbound.set(edge.to, (inbound.get(edge.to) || 0) + 1); return graph.nodes.map(node => ({ ...node, inbound: inbound.get(node.id) || 0 })).sort((a, b) => b.inbound - a.inbound).slice(0, limit); }
  neighbors(id, depth = 1) {
    const graph = this.graph(); const wanted = new Set([String(id)]); let frontier = new Set(wanted);
    for (let step = 0; step < Math.max(1, Math.min(4, Number(depth) || 1)); step += 1) {
      const next = new Set();
      for (const edge of graph.edges) if (frontier.has(edge.from) || frontier.has(edge.to)) { next.add(edge.from); next.add(edge.to); }
      for (const item of next) wanted.add(item); frontier = next;
    }
    return { nodes: graph.nodes.filter(node => wanted.has(node.id)), edges: graph.edges.filter(edge => wanted.has(edge.from) && wanted.has(edge.to)) };
  }
  search(query, limit = 50) {
    const q = String(query || "").trim().toLowerCase(); if (!q) return [];
    return this.graph().nodes.filter(node => JSON.stringify(node).toLowerCase().includes(q)).slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  }
}

module.exports = { KnowledgeGraphService };
