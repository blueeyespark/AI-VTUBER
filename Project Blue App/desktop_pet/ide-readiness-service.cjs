"use strict";

const fs = require("node:fs");
const path = require("node:path");

function exists(file) { return fs.existsSync(file); }
function methodCount(instance, names) { return names.filter(name => typeof instance?.[name] === "function").length; }
function capability(area, required, available, notes = []) {
  const total = required.length || 1;
  const ready = required.filter(name => available.includes(name));
  return {
    area,
    state: ready.length === total ? "ready" : ready.length ? "partial" : "missing",
    score: Math.round((ready.length / total) * 100),
    ready,
    missing: required.filter(name => !ready.includes(name)),
    notes
  };
}

class IdeReadinessService {
  constructor(workspaceRoot, services = {}, options = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.desktopRoot = path.resolve(options.desktopRoot || __dirname);
    this.services = services;
  }

  snapshot() {
    const { editor, terminal, git, language, debug, tests, extensions, workspaceAgent, context, health } = this.services;
    const editorMethods = ["open", "update", "save", "undo", "redo", "searchWorkspace", "workspaceRoots", "recentFiles", "diff"];
    const terminalMethods = ["create", "write", "resize", "kill", "list", "listTasks", "runTask"];
    const gitMethods = ["status", "diff", "stage", "unstage", "branches", "switchBranch", "commit", "pull", "push", "history"];
    const languageMethods = ["open", "completion", "hover", "signature", "definition", "references", "rename", "formatting", "codeActions", "semanticTokens", "documentSymbols", "workspaceSymbols", "status"];
    const debugMethods = ["start", "setBreakpoints", "command", "stop", "status", "profiles", "saveProfile"];
    const testMethods = ["discover", "run", "history", "status"];
    const extensionMethods = ["discover", "list", "install", "enable", "disable", "remove", "activate", "status"];
    const agentMethods = ["handleMessage", "execute", "createProposal", "proposalDiff", "applyProposal", "rollback"];

    const areas = [
      capability("Editor", editorMethods, editorMethods.filter(name => typeof editor?.[name] === "function"), [exists(path.join(this.desktopRoot, "node_modules", "monaco-editor")) ? "Monaco is installed." : "Monaco is not installed."]),
      capability("Terminal", terminalMethods, terminalMethods.filter(name => typeof terminal?.[name] === "function"), [health?.snapshot?.().terminal?.state === "ready" ? "Native PTY is ready." : "Native PTY requires Windows verification."]),
      capability("Git", gitMethods, gitMethods.filter(name => typeof git?.[name] === "function")),
      capability("Language intelligence", languageMethods, languageMethods.filter(name => typeof language?.[name] === "function"), (language?.profiles?.() || []).map(item => `${item.label}: ${item.installed ? "installed" : "missing"}`)),
      capability("Debugger", debugMethods, debugMethods.filter(name => typeof debug?.[name] === "function"), (debug?.adapters?.() || []).map(item => `${item.label}: ${item.installed ? "installed" : "missing"}`)),
      capability("Testing", testMethods, testMethods.filter(name => typeof tests?.[name] === "function")),
      capability("Extensions", extensionMethods, extensionMethods.filter(name => typeof extensions?.[name] === "function")),
      capability("Blue workspace agent", agentMethods, agentMethods.filter(name => typeof workspaceAgent?.[name] === "function")),
      capability("Workspace awareness", ["snapshot", "summarize", "record", "activity", "updateUiContext"], ["snapshot", "summarize", "record", "activity", "updateUiContext"].filter(name => typeof context?.[name] === "function"))
    ];

    const score = Math.round(areas.reduce((sum, item) => sum + item.score, 0) / areas.length);
    const blockers = [];
    if (!exists(path.join(this.desktopRoot, "node_modules", "monaco-editor"))) blockers.push("Monaco editor dependency is missing.");
    if (!(language?.profiles?.() || []).some(item => item.installed)) blockers.push("No language server is installed.");
    if (!(debug?.adapters?.() || []).some(item => item.installed)) blockers.push("No debug adapter is installed.");
    const healthSnapshot = health?.snapshot?.();
    if (healthSnapshot?.terminal?.state !== "ready") blockers.push("Native terminal still needs platform verification.");
    if ((healthSnapshot?.ui?.counts?.placeholder || 0) > 0) blockers.push(`${healthSnapshot.ui.counts.placeholder} modular UI files remain placeholders.`);

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      workspaceRoot: this.workspaceRoot,
      score,
      state: blockers.length ? (score >= 70 ? "developing" : "attention") : "ready",
      areas,
      blockers,
      nextMilestones: areas.filter(item => item.score < 100).sort((a, b) => a.score - b.score).slice(0, 5).map(item => ({ area: item.area, missing: item.missing }))
    };
  }

  summary(snapshot = this.snapshot()) {
    return [
      `Independent IDE readiness: ${snapshot.score}% (${snapshot.state})`,
      ...snapshot.areas.map(item => `- ${item.area}: ${item.score}% (${item.state})${item.missing.length ? `; missing ${item.missing.join(", ")}` : ""}`),
      ...(snapshot.blockers.length ? ["Current blockers:", ...snapshot.blockers.map(item => `- ${item}`)] : []),
      ...(snapshot.nextMilestones.length ? ["Recommended next milestones:", ...snapshot.nextMilestones.map(item => `- ${item.area}: ${item.missing.join(", ")}`)] : [])
    ].join("\n");
  }
}

module.exports = { IdeReadinessService, capability, methodCount };
