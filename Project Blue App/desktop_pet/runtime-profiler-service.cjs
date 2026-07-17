"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { explainAction } = require("./explainability-service.cjs");

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function atomicJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(temporary, file); }
function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function bytes(value) { return Math.max(0, Math.round(finite(value))); }
function megabytes(value) { return Math.round((bytes(value) / 1024 / 1024) * 10) / 10; }

class RuntimeProfilerService {
  constructor(workspaceRoot, services = {}, options = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.services = services;
    this.file = path.resolve(options.file || path.join(this.workspaceRoot, ".blue", "performance", "runtime-history.json"));
    this.maxSamples = Math.max(10, Math.min(500, Number(options.maxSamples) || 120));
    this.previousCpu = process.cpuUsage();
    this.previousWall = performance.now();
    this.previousElu = performance.eventLoopUtilization();
  }

  sample(options = {}) {
    const now = performance.now(); const cpu = process.cpuUsage(this.previousCpu); const wallMicros = Math.max(1, (now - this.previousWall) * 1000);
    const elu = performance.eventLoopUtilization(this.previousElu); const memory = process.memoryUsage(); const systemFree = os.freemem(); const systemTotal = os.totalmem();
    const knowledge = this.services.knowledge?.graph?.() || { nodes: [], edges: [] };
    const snapshot = {
      version: 1,
      timestamp: new Date().toISOString(),
      label: String(options.label || "manual sample").slice(0, 120),
      process: {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        cpuPercentOfOneCore: Math.round((((cpu.user + cpu.system) / wallMicros) * 100) * 10) / 10,
        userCpuMs: Math.round(cpu.user / 100) / 10,
        systemCpuMs: Math.round(cpu.system / 100) / 10,
        rssMb: megabytes(memory.rss),
        heapUsedMb: megabytes(memory.heapUsed),
        heapTotalMb: megabytes(memory.heapTotal),
        externalMb: megabytes(memory.external),
        eventLoopUtilization: Math.round(finite(elu.utilization) * 1000) / 1000
      },
      system: {
        logicalCpus: os.cpus().length,
        loadAverage: os.loadavg().map(value => Math.round(finite(value) * 100) / 100),
        memoryUsedPercent: systemTotal ? Math.round(((systemTotal - systemFree) / systemTotal) * 1000) / 10 : 0,
        freeMemoryMb: megabytes(systemFree),
        totalMemoryMb: megabytes(systemTotal)
      },
      workspace: {
        knowledgeNodes: Array.isArray(knowledge.nodes) ? knowledge.nodes.length : 0,
        knowledgeEdges: Array.isArray(knowledge.edges) ? knowledge.edges.length : 0,
        indexedBytes: (knowledge.nodes || []).reduce((sum, item) => sum + bytes(item.bytes), 0)
      }
    };
    this.previousCpu = process.cpuUsage(); this.previousWall = now; this.previousElu = performance.eventLoopUtilization();
    if (options.persist !== false) this.record(snapshot);
    return snapshot;
  }

  record(snapshot) {
    const document = readJson(this.file, { version: 1, samples: [] });
    document.samples = [...(Array.isArray(document.samples) ? document.samples : []), snapshot].slice(-this.maxSamples);
    document.updatedAt = snapshot.timestamp; atomicJson(this.file, document); return snapshot;
  }

  history(limit = 30) {
    const document = readJson(this.file, { version: 1, samples: [] });
    return (Array.isArray(document.samples) ? document.samples : []).slice(-Math.max(1, Math.min(this.maxSamples, Number(limit) || 30)));
  }

  report(options = {}) {
    const current = this.sample({ label: options.label || "runtime report", persist: options.persist !== false }); const findings = [];
    const add = (severity, area, message, recommendation) => findings.push({ severity, area, message, recommendation });
    if (current.process.eventLoopUtilization > 0.85) add("high", "event-loop", "The Node event loop was heavily utilized during this sample window.", "Profile long synchronous handlers and move bounded analysis off the renderer path.");
    else if (current.process.eventLoopUtilization > 0.6) add("warning", "event-loop", "The Node event loop showed elevated utilization.", "Inspect recent tasks and large synchronous scans.");
    if (current.process.heapTotalMb && current.process.heapUsedMb / current.process.heapTotalMb > 0.85) add("warning", "heap", "JavaScript heap usage is above 85% of the currently allocated heap.", "Inspect retained editor, chat, asset, and graph objects before increasing limits.");
    if (current.process.rssMb > 1500) add("warning", "memory", `Project Blue is using ${current.process.rssMb} MiB RSS.`, "Review avatar assets, editor sessions, language servers, and cached graph size.");
    if (current.system.memoryUsedPercent > 92) add("high", "system-memory", `System memory usage is ${current.system.memoryUsedPercent}%.`, "Pause optional background agents and close unneeded creator tools.");
    else if (current.system.memoryUsedPercent > 85) add("warning", "system-memory", `System memory usage is ${current.system.memoryUsedPercent}%.`, "Avoid starting heavy generation or streaming tasks until memory pressure drops.");
    if (current.workspace.indexedBytes > 250 * 1024 * 1024) add("info", "workspace-index", "The indexed workspace contains more than 250 MiB of referenced files.", "Keep binary assets lazy and exclude generated artifacts from semantic indexing.");
    if (!findings.length) add("healthy", "runtime", "No threshold-based bottleneck was detected in this bounded sample.", "Compare several samples during chat, indexing, streaming, and avatar motion before drawing conclusions.");
    const explanation = explainAction({ action: "Project Blue runtime performance report", why: `Measured process, event-loop, system-memory, and workspace-index signals; produced ${findings.length} finding(s).`, evidence: findings.map(item => ({ source: item.area, detail: item.message })), files: [], risk: findings.some(item => item.severity === "high") ? "high" : findings.some(item => item.severity === "warning") ? "medium" : "low", requiresApproval: false, undo: "Read-only measurements were taken; only bounded profiler history was recorded.", verification: ["Capture samples during idle and active workloads", "Compare changes after one optimization", "Use a dedicated CPU/GPU profiler for native hotspots"], confidence: 0.72 }, { workspaceRoot: this.workspaceRoot });
    return { version: 1, generatedAt: current.timestamp, current, findings, explanation, limitations: ["Node process metrics do not measure GPU frame time.", "A single sample cannot prove causation.", "Native child processes require their own profilers."] };
  }
}

module.exports = { RuntimeProfilerService, megabytes };
