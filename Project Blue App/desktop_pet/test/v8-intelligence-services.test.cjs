"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { explainAction } = require("../explainability-service.cjs");
const { BlueBrainService } = require("../blue-brain-service.cjs");
const { KnowledgeGraphService } = require("../knowledge-graph-service.cjs");
const { SemanticTimelineService } = require("../semantic-timeline-service.cjs");
const { BackgroundAgentService } = require("../background-agent-service.cjs");
const { BackgroundAgentSchedulerService } = require("../background-agent-scheduler-service.cjs");
const { WorkspaceHealthScoreService } = require("../workspace-health-score-service.cjs");
const { ProjectConsciousnessService, parseSymbols } = require("../project-consciousness-service.cjs");
const { RuntimeProfilerService } = require("../runtime-profiler-service.cjs");
const { BlueWorkspaceAgentBridge, formatWorkspaceAgentResult } = require("../workspace-agent.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-v8-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.js"), "module.exports = require('./b.js');\n");
  fs.writeFileSync(path.join(root, "src", "b.js"), "module.exports = 1;\n");
  const consciousness = { buildGraph: () => ({ nodes: [
    { id: "src/a.js", type: "js", lines: 900, bytes: 900000 },
    { id: "src/b.js", type: "js", lines: 2, bytes: 20 }
  ], edges: [{ from: "src/a.js", to: "src/b.js", kind: "imports" }], ownership: [{ file: "src/a.js", owners: [{ name: "Creator", commits: 2 }] }], coverage: { source: "coverage/coverage-summary.json", lines: 82 }, planning: { goals: [], milestones: [], risks: [], technicalDebt: [{ file: "src/a.js", line: 1, text: "split module" }] } }) };
  return { root, consciousness };
}

test("explainability bounds evidence and rejects paths outside the workspace", () => {
  const { root } = fixture();
  const result = explainAction({ action: "inspect", files: ["src/a.js", "../secret.txt"], evidence: Array.from({ length: 80 }, (_, index) => ({ source: index, detail: "x" })) }, { workspaceRoot: root });
  assert.deepEqual(result.files, ["src/a.js"]);
  assert.equal(result.evidence.length, 50);
  assert.equal(result.requiresApproval, false);
});

test("project consciousness indexes symbols, assets, planning signals, and coverage", () => {
  const { root } = fixture();
  fs.writeFileSync(path.join(root, "src", "symbols.js"), "class BlueEngine {}\nfunction planWork() {}\ntest('works', () => {});\n// TODO: split old adapter\n");
  fs.writeFileSync(path.join(root, "avatar.vrm"), Buffer.from([1, 2, 3]));
  fs.mkdirSync(path.join(root, "coverage"));
  fs.writeFileSync(path.join(root, "coverage", "coverage-summary.json"), JSON.stringify({ total: { lines: { pct: 88 }, functions: { pct: 77 }, branches: { pct: 66 }, statements: { pct: 87 } } }));
  assert.deepEqual(parseSymbols("class Blue {}\nfunction work() {}", ".js").map(item => item.kind), ["class", "function"]);
  const graph = new ProjectConsciousnessService(root).buildGraph();
  assert.ok(graph.nodes.some(item => item.type === "class" && item.name === "BlueEngine"));
  assert.ok(graph.nodes.some(item => item.type === "asset" && item.id === "avatar.vrm"));
  assert.equal(graph.coverage.lines, 88); assert.ok(graph.planning.technicalDebt.length >= 1);
});

test("Blue Brain persists safe memory and gates identity, secrets, and goals", () => {
  const { root } = fixture(); const brain = new BlueBrainService(root);
  assert.throws(() => brain.remember({ kind: "identity", key: "name", value: "Blue" }), /approval/i);
  assert.throws(() => brain.remember({ key: "api_token", value: "nope" }, true), /Secret-like/i);
  brain.remember({ kind: "project", key: "goal", value: "Build V8", confidence: 0.9 });
  assert.equal(brain.recall("V8").length, 1);
  assert.throws(() => brain.addGoal({ title: "Ship" }), /approval/i);
  assert.equal(brain.addGoal({ title: "Ship" }, true).title, "Ship");
  assert.equal(brain.snapshot().records, 1);
});

test("Blue Brain models approved relationships, habits, and decisions", () => {
  const { root } = fixture(); const brain = new BlueBrainService(root);
  assert.throws(() => brain.relate({ from: "Blue", to: "Creator", relation: "assists" }), /approval/i);
  brain.relate({ from: "Blue", to: "Creator", relation: "assists", confidence: 0.9 }, true);
  brain.trackHabit({ name: "daily workspace check", frequency: "daily", status: "active" }, true);
  brain.remember({ kind: "decision", key: "ui-shell", value: { choice: "IDE shell", why: "stable navigation" } });
  const snapshot = brain.snapshot();
  assert.equal(snapshot.relationships.length, 1); assert.equal(snapshot.habits.length, 1); assert.equal(snapshot.decisions.length, 1);
});

test("knowledge graph provides read-only impact analysis", () => {
  const { root, consciousness } = fixture(); const knowledge = new KnowledgeGraphService(root, consciousness);
  const graph = knowledge.rebuild(); assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  const impact = knowledge.impact("src/b.js"); assert.equal(impact.risk, "medium"); assert.equal(impact.requiresApproval, false); assert.match(impact.why, /depend/);
  assert.equal(knowledge.search("a.js").length, 1); assert.equal(knowledge.neighbors("src/b.js").nodes.length, 2); assert.equal(graph.metadata.coverage.lines, 82);
});

test("semantic timeline is approval-gated, searchable, and reconstructs only a plan", () => {
  const { root } = fixture(); const timeline = new SemanticTimelineService(root);
  assert.throws(() => timeline.record({ title: "Unsafe silent write" }), /approval/i);
  timeline.record({ type: "architecture", title: "Split service", why: "Reduce coupling", files: ["src/a.js"] }, true);
  assert.equal(timeline.search("coupling").length, 1);
  const plan = timeline.reconstruct("Split service"); assert.equal(plan.requiresApproval, true); assert.equal(plan.risk, "high"); assert.match(plan.undo, /checkpoint/i);
});

test("background agents are read-only and health score exposes all V8 categories", () => {
  const { root, consciousness } = fixture(); const knowledge = new KnowledgeGraphService(root, consciousness); knowledge.rebuild();
  const agents = new BackgroundAgentService(root, { knowledge });
  assert.equal(agents.catalog().length, 10); assert.ok(agents.catalog().every(item => item.mode === "read-only"));
  const report = agents.run("architecture"); assert.equal(report.readOnly, true); assert.ok(report.findings.length >= 1);
  const brain = new BlueBrainService(root); const health = new WorkspaceHealthScoreService({ workbench: { snapshot: () => ({ state: "ready" }) }, knowledge, agents, brain });
  const snapshot = health.snapshot(); assert.ok(snapshot.overall >= 0 && snapshot.overall <= 100); assert.equal(Object.keys(snapshot.categories).length, 10); assert.equal(snapshot.categories.workspaceStability, 100);
});

test("background agent scheduler persists approved schedules, runs due work, deduplicates findings, and pauses safely", () => {
  const { root, consciousness } = fixture();
  const knowledge = new KnowledgeGraphService(root, consciousness); knowledge.rebuild();
  const agents = new BackgroundAgentService(root, { knowledge });
  let now = Date.parse("2026-07-17T00:00:00.000Z");
  const scheduler = new BackgroundAgentSchedulerService(root, agents, { clock: () => now, minIntervalMs: 100, pollMs: 100, maxHistory: 10 });
  assert.throws(() => scheduler.configure("architecture", { enabled: true, intervalMs: 100 }), /approval/i);
  const schedule = scheduler.configure("architecture", { enabled: true, intervalMs: 100 }, true);
  assert.equal(schedule.enabled, true); assert.equal(scheduler.status().enabledCount, 1);
  now += 100;
  assert.equal(scheduler.runDue(now).length, 1);
  const first = scheduler.history({ id: "architecture" })[0]; assert.equal(first.ok, true); assert.equal(first.trigger, "scheduled"); assert.equal(first.changedSincePrevious, true);
  now += 100;
  scheduler.runDue(now);
  const second = scheduler.history({ id: "architecture" })[0]; assert.equal(second.changedSincePrevious, false);
  assert.equal(scheduler.pause("architecture").enabled, false); assert.equal(scheduler.runDue(now + 1000).length, 0);
  scheduler.start(); assert.equal(scheduler.status().schedulerActive, true); scheduler.stop(); assert.equal(scheduler.status().schedulerActive, false);
});

test("background agent alerts are opt-in, severity-filtered, and deduplicate unchanged reports", () => {
  const { root } = fixture();
  const delivered = [];
  const agents = {
    catalog: () => [{ id: "security", name: "Security", mode: "read-only" }],
    run: () => ({ findings: [{ severity: "high", file: "src/a.js", message: "Review this finding" }], explanation: { why: "test" } })
  };
  const scheduler = new BackgroundAgentSchedulerService(root, agents, { notify: value => { delivered.push(value); return true; } });
  assert.throws(() => scheduler.configureNotifications({ enabled: true, threshold: "high" }), /approval/i);
  assert.equal(scheduler.configureNotifications({ enabled: true, threshold: "high" }, true).enabled, true);
  const first = scheduler.runNow("security");
  assert.equal(delivered.length, 1); assert.equal(first.history.notification.delivered, true);
  scheduler.runNow("security");
  assert.equal(delivered.length, 1, "unchanged reports must not notify twice");
  assert.equal(scheduler.configureNotifications({ enabled: false }).enabled, false);
});

test("runtime profiler records bounded real metrics and explains bottlenecks", () => {
  const { root } = fixture();
  const profiler = new RuntimeProfilerService(root, { knowledge: { graph: () => ({ nodes: [{ id: "src/a.js", bytes: 100 }], edges: [] }) } }, { maxSamples: 10 });
  const sample = profiler.sample({ label: "test sample" });
  assert.equal(sample.label, "test sample"); assert.ok(sample.process.rssMb > 0); assert.ok(sample.system.logicalCpus >= 1); assert.equal(sample.workspace.knowledgeNodes, 1);
  const report = profiler.report({ label: "test report" }); assert.ok(report.findings.length >= 1); assert.equal(report.explanation.requiresApproval, false); assert.ok(report.limitations.length >= 1);
  assert.equal(profiler.history(20).length, 2);
});

test("Electron and preload contain every V8 bridge without exposing implementation objects", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");
  for (const channel of ["blue:v8-brain", "blue:v8-knowledge", "blue:v8-impact", "blue:v8-timeline", "blue:v8-agents", "blue:v8-agent-scheduler", "blue:v8-health", "blue:v8-profile"]) assert.ok(main.includes(channel), channel);
  for (const method of ["v8Brain", "v8Knowledge", "v8Impact", "v8Timeline", "v8Agents", "v8AgentScheduler", "v8Health", "v8Profile"]) assert.ok(preload.includes(method), method);
});

test("Blue Chat routes V8 commands to attached services", async () => {
  const { root, consciousness } = fixture(); const knowledge = new KnowledgeGraphService(root, consciousness); knowledge.rebuild();
  const brain = new BlueBrainService(root); const agents = new BackgroundAgentService(root, { knowledge });
  const timeline = new SemanticTimelineService(root); const health = new WorkspaceHealthScoreService({ workbench: { snapshot: () => ({ state: "ready" }) }, knowledge, agents, brain });
  const profiler = new RuntimeProfilerService(root, { knowledge });
  const scheduler = new BackgroundAgentSchedulerService(root, agents, { minIntervalMs: 100 });
  const bridge = new BlueWorkspaceAgentBridge(root).attachServices({ brain, knowledge, semanticTimeline: timeline, backgroundAgents: agents, backgroundAgentScheduler: scheduler, workspaceHealthScore: health, runtimeProfiler: profiler });
  assert.equal((await bridge.handleMessage("/brain")).type, "blueBrain");
  assert.equal((await bridge.handleMessage("/impact src/b.js")).type, "impactAnalysis");
  assert.equal((await bridge.handleMessage("/agents")).data.length, 10);
  assert.equal((await bridge.handleMessage("/agent-scheduler")).type, "backgroundAgentScheduler");
  await assert.rejects(() => bridge.handleMessage("/agent-schedule architecture 1"), /approval/i);
  assert.equal((await bridge.handleMessage("/agent-schedule architecture 1 APPROVE")).type, "backgroundAgentSchedule");
  assert.equal((await bridge.handleMessage("/agent-pause architecture")).data.enabled, false);
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("/agent-history architecture")), /Background agent history:/);
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("/workspace-health")), /Workspace health:/);
  assert.match(formatWorkspaceAgentResult(await bridge.handleMessage("/profile")), /Runtime performance:/);
});

test("V8 background-agent scheduler has a visible, wired IDE editor", () => {
  const appRoot = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
  const control = fs.readFileSync(path.join(appRoot, "control.js"), "utf8");
  const main = fs.readFileSync(path.join(appRoot, "main.cjs"), "utf8");
  const shell = fs.readFileSync(path.join(appRoot, "ui", "shell", "app-shell.js"), "utf8");
  const css = fs.readFileSync(path.join(appRoot, "control-ide.css"), "utf8");
  assert.match(html, /data-panel="run" data-editor="background-agents"/);
  for (const id of ["agentSchedulerRefresh", "agentSchedulerRunDue", "agentSchedulerEnable", "agentSchedulerPause", "agentSchedulerRun", "agentSchedulerHistory", "agentSchedulerNotificationThreshold", "agentSchedulerNotificationsEnable", "agentSchedulerNotificationsDisable"]) assert.match(html, new RegExp(`id="${id}"`), `${id} is missing`);
  assert.match(shell, /id: "background-agents", title: "Background Agents"/);
  assert.match(control, /"background agents": "background-agents"/);
  assert.match(control, /v8AgentScheduler\(\{ action: "status" \}\)/);
  assert.match(control, /runAgentSchedulerAction\("configure"/);
  assert.match(control, /approved: Boolean\(schedulerElement\("agentSchedulerApproval"\)/);
  assert.match(control, /runAgentSchedulerAction\("notifications"/);
  assert.match(main, /Notification\?*\.isSupported/);
  assert.match(css, /\.agent-scheduler-layout/);
});
