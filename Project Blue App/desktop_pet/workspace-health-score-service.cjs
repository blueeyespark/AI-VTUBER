"use strict";

class WorkspaceHealthScoreService {
  constructor(services = {}) { this.services = services; }
  snapshot() {
    const workbench = this.services.workbench?.snapshot?.() || {}; const graph = this.services.knowledge?.graph?.() || { nodes: [], edges: [], metadata: {} }; const reports = {};
    for (const id of ["architecture", "documentation", "security", "performance", "testing", "dependency"]) try { reports[id] = this.services.agents.run(id); } catch { reports[id] = { findings: [] }; }
    const score = (base, findings, weight = 4) => Math.max(0, Math.min(100, base - findings.length * weight));
    const measuredCoverage = Number(graph.metadata?.coverage?.lines);
    const debtSignals = graph.metadata?.planning?.technicalDebt || [];
    const categories = {
      architecture: score(100, reports.architecture.findings), documentation: score(100, reports.documentation.findings, 2), security: score(100, reports.security.findings, 10), performance: score(100, reports.performance.findings, 5), testing: score(100, reports.testing.findings, 3), coverage: Number.isFinite(measuredCoverage) ? Math.max(0, Math.min(100, measuredCoverage)) : score(70, reports.testing.findings, 2), dependencies: score(100, reports.dependency.findings, 4), technicalDebt: score(100, [...reports.architecture.findings, ...reports.documentation.findings, ...debtSignals], 2), memory: this.services.brain?.snapshot?.().records ? 90 : 70, workspaceStability: workbench.state === "ready" ? 100 : workbench.state === "attention" ? 75 : 40
    };
    const overall = Math.round(Object.values(categories).reduce((sum, value) => sum + value, 0) / Object.keys(categories).length);
    return { version: 2, generatedAt: new Date().toISOString(), overall, categories, graph: { nodes: graph.nodes.length, edges: graph.edges.length, symbols: graph.nodes.filter(item => ["class", "function", "test", "section"].includes(item.kind || item.type)).length }, coverageSource: graph.metadata?.coverage?.source || null, issues: Object.entries(reports).flatMap(([agent, report]) => report.findings.map(item => ({ agent, ...item }))).slice(0, 200) };
  }
}

module.exports = { WorkspaceHealthScoreService };
