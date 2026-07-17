"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function findingFingerprint(findings = []) {
  const normalized = findings.slice(0, 200).map(item => ({
    severity: String(item?.severity || "info"),
    file: String(item?.file || ""),
    message: String(item?.message || "").slice(0, 500)
  }));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

const SEVERITY_RANK = Object.freeze({ info: 0, low: 0, warning: 1, medium: 1, high: 2, critical: 3 });

function notificationThreshold(value) {
  const normalized = String(value || "high").trim().toLowerCase();
  return Object.hasOwn(SEVERITY_RANK, normalized) ? normalized : "high";
}

class BackgroundAgentSchedulerService {
  constructor(workspaceRoot, agentService, options = {}) {
    if (!agentService || typeof agentService.run !== "function" || typeof agentService.catalog !== "function") throw new Error("Background Agent Scheduler requires a read-only agent service.");
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.agentService = agentService;
    this.file = path.resolve(options.file || path.join(this.workspaceRoot, ".blue", "v8", "background-agent-scheduler.json"));
    this.maxHistory = boundedNumber(options.maxHistory, 250, 10, 2000);
    this.minIntervalMs = boundedNumber(options.minIntervalMs, 5 * 60 * 1000, 100, 24 * 60 * 60 * 1000);
    this.maxIntervalMs = boundedNumber(options.maxIntervalMs, 30 * 24 * 60 * 60 * 1000, this.minIntervalMs, 365 * 24 * 60 * 60 * 1000);
    this.pollMs = boundedNumber(options.pollMs, 60 * 1000, 100, 60 * 60 * 1000);
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    this.notify = typeof options.notify === "function" ? options.notify : null;
    this.timer = null;
    this.running = new Set();
  }

  emptyDocument() { return { version: 2, schedules: {}, history: [], notifications: { enabled: false, threshold: "high" }, updatedAt: null }; }

  document() {
    const value = readJson(this.file, this.emptyDocument());
    return {
      version: 2,
      schedules: value?.schedules && typeof value.schedules === "object" ? value.schedules : {},
      history: Array.isArray(value?.history) ? value.history.slice(-this.maxHistory) : [],
      notifications: {
        enabled: value?.notifications?.enabled === true,
        threshold: notificationThreshold(value?.notifications?.threshold)
      },
      updatedAt: value?.updatedAt || null
    };
  }

  save(document) {
    document.version = 2;
    document.history = document.history.slice(-this.maxHistory);
    document.updatedAt = new Date(this.clock()).toISOString();
    writeJsonAtomic(this.file, document);
    return document;
  }

  knownAgent(id) {
    const agent = this.agentService.catalog().find(item => item.id === id);
    if (!agent) throw new Error(`Unknown background agent: ${id}`);
    return agent;
  }

  schedule(id) {
    this.knownAgent(id);
    return this.document().schedules[id] || { id, enabled: false, intervalMs: null, lastRunAt: null, nextRunAt: null, lastResult: null };
  }

  catalog() {
    const document = this.document();
    return this.agentService.catalog().map(agent => ({
      ...agent,
      schedule: document.schedules[agent.id] || { id: agent.id, enabled: false, intervalMs: null, lastRunAt: null, nextRunAt: null, lastResult: null }
    }));
  }

  configure(id, input = {}, approved = false) {
    this.knownAgent(id);
    const document = this.document();
    const previous = document.schedules[id] || { id, enabled: false, intervalMs: null, lastRunAt: null, nextRunAt: null, lastResult: null };
    const enabled = input.enabled === undefined ? previous.enabled : input.enabled === true;
    const requested = input.intervalMs ?? (input.intervalMinutes === undefined ? previous.intervalMs : Number(input.intervalMinutes) * 60 * 1000);
    const intervalMs = boundedNumber(requested, previous.intervalMs || 60 * 60 * 1000, this.minIntervalMs, this.maxIntervalMs);
    const changesExecution = enabled && (!previous.enabled || previous.intervalMs !== intervalMs);
    if (changesExecution && !approved) throw new Error("Enabling or changing a persistent background-agent schedule requires explicit approval.");
    const now = this.clock();
    const schedule = {
      ...previous,
      id,
      enabled,
      intervalMs,
      updatedAt: new Date(now).toISOString(),
      nextRunAt: enabled ? new Date(now + intervalMs).toISOString() : null
    };
    document.schedules[id] = schedule;
    this.save(document);
    return schedule;
  }

  pause(id) { return this.configure(id, { enabled: false }, true); }
  resume(id, approved = false) { const current = this.schedule(id); return this.configure(id, { enabled: true, intervalMs: current.intervalMs || 60 * 60 * 1000 }, approved); }

  configureNotifications(input = {}, approved = false) {
    const document = this.document();
    const previous = document.notifications;
    const next = {
      enabled: input.enabled === undefined ? previous.enabled : input.enabled === true,
      threshold: notificationThreshold(input.threshold ?? previous.threshold)
    };
    const increasesActivity = next.enabled && (!previous.enabled || next.threshold !== previous.threshold);
    if (increasesActivity && !approved) throw new Error("Enabling or changing background-agent notifications requires explicit approval.");
    document.notifications = next;
    this.save(document);
    return next;
  }

  notificationSummary(entry, settings) {
    if (!settings?.enabled || !entry?.ok || !entry.changedSincePrevious) return null;
    const threshold = notificationThreshold(settings.threshold);
    const minimum = SEVERITY_RANK[threshold];
    const matching = Object.entries(entry.severity || {}).reduce((total, [severity, count]) => (
      total + ((SEVERITY_RANK[String(severity).toLowerCase()] ?? 0) >= minimum ? Number(count) || 0 : 0)
    ), 0);
    if (!matching) return null;
    return {
      agentId: entry.agentId,
      threshold,
      findingCount: matching,
      title: `Project Blue: ${entry.agentId} findings changed`,
      body: `${matching} ${threshold}-or-higher finding${matching === 1 ? "" : "s"} need review. No files were changed.`
    };
  }

  history(options = {}) {
    const id = String(options.id || "").trim();
    const limit = boundedNumber(options.limit, 50, 1, this.maxHistory);
    return this.document().history.filter(item => !id || item.agentId === id).slice(-limit).reverse();
  }

  record(id, report, details = {}) {
    const document = this.document();
    const findings = Array.isArray(report?.findings) ? report.findings.slice(0, 100) : [];
    const fingerprint = findingFingerprint(findings);
    const previous = [...document.history].reverse().find(item => item.agentId === id && item.ok);
    const severity = findings.reduce((counts, item) => { const key = String(item?.severity || "info"); counts[key] = (counts[key] || 0) + 1; return counts; }, {});
    const entry = {
      runId: crypto.randomUUID(),
      agentId: id,
      trigger: details.trigger || "manual",
      startedAt: details.startedAt || new Date(this.clock()).toISOString(),
      completedAt: new Date(this.clock()).toISOString(),
      ok: true,
      findingCount: findings.length,
      severity,
      fingerprint,
      changedSincePrevious: !previous || previous.fingerprint !== fingerprint,
      findings,
      explanation: report?.explanation || null
    };
    const notification = this.notificationSummary(entry, document.notifications);
    if (notification) {
      try { entry.notification = { ...notification, delivered: this.notify ? this.notify(notification) !== false : false }; }
      catch (error) { entry.notification = { ...notification, delivered: false, error: String(error?.message || error).slice(0, 500) }; }
    }
    document.history.push(entry);
    this.save(document);
    return entry;
  }

  recordFailure(id, error, details = {}) {
    const document = this.document();
    const entry = {
      runId: crypto.randomUUID(), agentId: id, trigger: details.trigger || "scheduled",
      startedAt: details.startedAt || new Date(this.clock()).toISOString(), completedAt: new Date(this.clock()).toISOString(),
      ok: false, error: String(error?.message || error || "Unknown agent failure").slice(0, 1000)
    };
    document.history.push(entry);
    this.save(document);
    return entry;
  }

  runNow(id, trigger = "manual") {
    this.knownAgent(id);
    if (this.running.has(id)) return { skipped: true, reason: "already-running", agentId: id };
    this.running.add(id);
    const startedAt = new Date(this.clock()).toISOString();
    try {
      const report = this.agentService.run(id);
      const history = this.record(id, report, { trigger, startedAt });
      return { skipped: false, report, history };
    } catch (error) {
      this.recordFailure(id, error, { trigger, startedAt });
      throw error;
    } finally { this.running.delete(id); }
  }

  runDue(now = this.clock()) {
    const initial = this.document();
    const due = Object.values(initial.schedules).filter(item => item?.enabled && item.nextRunAt && Date.parse(item.nextRunAt) <= now);
    const results = [];
    for (const item of due) {
      try { results.push({ agentId: item.id, ok: true, result: this.runNow(item.id, "scheduled") }); }
      catch (error) { results.push({ agentId: item.id, ok: false, error: String(error?.message || error) }); }
      const document = this.document();
      const current = document.schedules[item.id];
      if (current?.enabled) {
        current.lastRunAt = new Date(now).toISOString();
        current.nextRunAt = new Date(now + current.intervalMs).toISOString();
        current.lastResult = results.at(-1).ok ? "completed" : "failed";
        this.save(document);
      }
    }
    return results;
  }

  status() {
    const catalog = this.catalog();
    const enabled = catalog.filter(item => item.schedule.enabled);
    return {
      version: 2,
      running: [...this.running],
      schedulerActive: Boolean(this.timer),
      pollMs: this.pollMs,
      enabledCount: enabled.length,
      schedules: catalog.map(item => ({ agentId: item.id, name: item.name, ...item.schedule })),
      nextRunAt: enabled.map(item => item.schedule.nextRunAt).filter(Boolean).sort()[0] || null,
      recent: this.history({ limit: 20 }),
      notifications: this.document().notifications,
      safety: { readOnlyAgents: true, automaticCodeChanges: false, approvalRequiredToEnable: true }
    };
  }

  start() {
    if (this.timer) return this.status();
    this.timer = setInterval(() => { try { this.runDue(); } catch {} }, this.pollMs);
    this.timer.unref?.();
    return this.status();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; return this.status(); }
}

module.exports = { BackgroundAgentSchedulerService, findingFingerprint, notificationThreshold };
