const fs = require("node:fs");
const path = require("node:path");

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    if (!fs.existsSync(temporary)) throw error;
    fs.copyFileSync(temporary, file);
    fs.unlinkSync(temporary);
  }
}

class ProactiveBlueService {
  constructor(context, options = {}) {
    this.context = context;
    this.stateFile = path.resolve(options.stateFile || path.join(context.stateRoot, "suggestions.json"));
    this.cooldownMs = Math.max(1000, Number(options.cooldownMs) || 5 * 60 * 1000);
  }

  document() { return readJson(this.stateFile, { version: 1, suggestions: [], lastSeen: {} }); }
  suggestions(limit = 20) { return this.document().suggestions.filter(item => item.status === "active").slice(0, Math.max(1, Math.min(50, Number(limit) || 20))); }

  dismiss(id) {
    const document = this.document(); const item = document.suggestions.find(entry => entry.id === id);
    if (!item) return false; item.status = "dismissed"; item.dismissedAt = new Date().toISOString(); writeJson(this.stateFile, document); return true;
  }

  rule(type, payload, snapshot) {
    const latestTest = payload?.run || (Array.isArray(snapshot.tests) ? snapshot.tests[0] : null);
    const resultFailures = latestTest?.results?.filter?.(item => item.status === "failed" || item.state === "failed").length || 0;
    const failureCount = resultFailures || (latestTest?.state === "failed" ? 1 : 0);
    const diagnosticFiles = snapshot.language?.diagnosticFiles || 0;
    const rules = {
      "project.opened": { priority: "normal", title: "Project context is ready", message: snapshot.git?.clean === false ? `You have ${snapshot.git.files?.length || 0} Git change(s). I can summarize them before we continue.` : "The workbench is ready. I can continue the previous conversation or inspect the project.", actions: ["summarize-workbench", "open-git"] },
      "git.pulled": { priority: "normal", title: "Update received", message: "Git pull completed. I can summarize changed files and check tests before you continue.", actions: ["summarize-git", "run-tests"] },
      "task.failed": { priority: "high", title: "Task needs attention", message: "A task failed. I can inspect its output, locate the likely source, and prepare a safe fix proposal.", actions: ["open-output", "explain-failure"] },
      "tests.completed": failureCount ? { priority: "high", title: "Tests failed", message: `${failureCount} test failure(s) need attention. I can explain them and prepare a reviewed fix.`, actions: ["show-test-failures", "prepare-fix"] } : null,
      "diagnostics.changed": diagnosticFiles ? { priority: "normal", title: "Diagnostics changed", message: `${diagnosticFiles} file(s) report diagnostics. I can open the Problems panel and inspect them.`, actions: ["open-problems", "explain-diagnostics"] } : null,
      "workbench.idle": snapshot.git?.clean === false ? { priority: "low", title: "Unfinished work is available", message: `There are ${snapshot.git.files?.length || 0} uncommitted file change(s). I can summarize or test them.`, actions: ["summarize-git", "run-tests"] } : null,
      "streaming.preflight": snapshot.streaming?.connected === false ? { priority: "normal", title: "Streaming connection is not ready", message: "OBS or the selected platform is disconnected. I can run the streaming preflight without going live.", actions: ["stream-preflight"] } : null
    };
    return rules[type] || null;
  }

  async observe(type, payload = {}, uiContext = null) {
    const event = this.context.record(type, payload, { source: payload.source || "workbench" });
    const snapshot = await this.context.snapshot(uiContext);
    const candidate = this.rule(type, payload, snapshot);
    if (!candidate) return { event, suggestion: null, snapshot };
    const document = this.document(); const key = `${type}:${candidate.title}`; const now = Date.now();
    if (now - Number(document.lastSeen[key] || 0) < this.cooldownMs) return { event, suggestion: null, snapshot, deduplicated: true };
    const suggestion = { id: `suggestion-${now}-${Math.random().toString(16).slice(2, 8)}`, createdAt: new Date(now).toISOString(), status: "active", eventType: type, requiresApproval: false, ...candidate };
    document.lastSeen[key] = now;
    document.suggestions = [suggestion, ...document.suggestions.filter(item => item.status === "active")].slice(0, 50);
    writeJson(this.stateFile, document);
    return { event, suggestion, snapshot };
  }
}

module.exports = { ProactiveBlueService };
