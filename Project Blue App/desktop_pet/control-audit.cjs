const fs = require("node:fs");
const path = require("node:path");

function read(baseDirectory, name) {
  return fs.readFileSync(path.join(baseDirectory, name), "utf8");
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function values(source, expression, group = 1) {
  return [...source.matchAll(expression)].map(match => match[group]);
}

function attribute(source, name) {
  return source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || "";
}

function plainText(source) {
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(valuesToCount) {
  const counts = new Map();
  for (const value of valuesToCount) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

const expectedButtonPanels = {
  observationHistory: "ai",
  activityHistory: "ai",
  health: "ai",
  clearObservations: "ai",
  clearActivity: "ai",
  deleteObservation: "ai",
  voiceToggle: "ai",
  voiceSkip: "ai",
  voiceTest: "ai",
  wakeListen: "ai",
  saveVoiceSettings: "ai",
  enrollOwnerPhrase: "ai",
  refreshMicrophones: "ai",
  openMicSettings: "ai",
  providerStatus: "ai",
  connectModel: "ai",
  loadHistory: "ai",
  saveLocalCompute: "ai",
  applyVtuberModel: "ai",
  refreshVtuberModels: "ai",
  showPet: "ai",
  wander: "ai",

  chatRunAudit: "workspace",
  newConversation: "workspace",
  deleteConversation: "workspace",
  chatToolPaste: "workspace",
  chatToolOcr: "workspace",
  chatAttachFiles: "workspace",
  chatAttachImages: "workspace",
  chatAttachFolder: "workspace",
  chatPasteClipboard: "workspace",
  chatScanImage: "workspace",
  chatToolIdea: "workspace",
  chatToolLearn: "workspace",
  chatToolResearch: "workspace",
  chatToolAgent: "workspace",
  listen: "workspace",
  chatVoiceToggle: "workspace",
  chatVoiceSkip: "workspace",
  send: "workspace",

  captureIdea: "workspace",
  capabilities: "workspace",
  researchCatalog: "workspace",
  learningSave: "workspace",
  learningResearch: "workspace",
  learningList: "workspace",
  agentStart: "workspace",
  agentMiniMax: "workspace",
  agentStatus: "workspace",
  expansionSave: "workspace",
  expansionRefresh: "workspace",

  securityScan: "diagnostics",

  devRunAudit: "diagnostics",
  devRunDoctor: "diagnostics",
  devSystemInfo: "diagnostics",
  devOpenProject: "diagnostics",
  devFocusDiagnostics: "diagnostics",
  devSecurityScan: "diagnostics",
  devBlueMeshCheck: "diagnostics",
  saveAutonomy: "diagnostics",
  fullControlGrant: "diagnostics",
  fullControlRevoke: "diagnostics",
  phoneBridgeStarter: "diagnostics",
  phoneApprovalQueueShow: "diagnostics",
  phoneBridgeStart: "diagnostics",
  phoneBridgeStop: "diagnostics",
  doctor: "diagnostics",
  systemInfo: "diagnostics",
  openProject: "diagnostics",
  pendingApprovals: "diagnostics",
  auditEvents: "diagnostics",
  pcActionGuidelines: "diagnostics",
  pcActionRun: "diagnostics",
  artifactRefresh: "diagnostics",
  artifactOpen: "diagnostics",
  artifactReveal: "diagnostics",

  streamingStatusRefresh: "streaming",
  streamingObsSave: "streaming",
  streamingObsCheck: "streaming",
  streamingObsSceneRefresh: "streaming",
  streamingObsCaptureGuide: "streaming",
  streamingObsSceneSwitch: "streaming",
  streamingSavePlatform: "streaming",
  streamingChatReadiness: "streaming",
  streamingRulesCheck: "streaming",
  streamingModerationPlan: "streaming",
  streamingToggleVrm: "streaming",
  streamingToggleLive2d: "streaming",
  streamingToggleWarudo: "streaming",
  streamingVoiceSafety: "streaming",
  streamingVoiceTest: "streaming",
  streamingIndependencePlan: "streaming",
  streamingGoLiveChecklist: "streaming",

  discordSave: "discord",
  discordTest: "discord",
  discordRegister: "discord",
  discordConnect: "discord",
  discordDisconnect: "discord",

  blueMeshCheck: "mesh",
  blueMeshToken: "mesh",
  blueMeshSmoke: "mesh",
  blueMeshOpenDocs: "mesh",
  blueMeshCopyServer: "mesh",
  blueMeshCopyPush: "mesh",

  settingsOpenProject: "settings",
  settingsRunAudit: "settings"
};

function auditControlCenter(baseDirectory = __dirname) {
  const html = read(baseDirectory, "index.html");
  const renderer = read(baseDirectory, "control.js");
  const preload = read(baseDirectory, "preload.cjs");
  const main = read(baseDirectory, "main.cjs");

  const allIds = values(html, /\bid\s*=\s*["']([^"']+)["']/gi);
  const duplicateIds = [...countBy(allIds)]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));

  const tabNames = unique(values(html, /\bdata-tab\s*=\s*["']([^"']+)["']/gi));
  const panelNames = unique(values(html, /\bdata-panel\s*=\s*["']([^"']+)["']/gi));
  const missingPanels = tabNames.filter(tab => !panelNames.includes(tab));
  const orphanPanels = panelNames.filter(panel => !tabNames.includes(panel));

  const selectorIds = new Set([
    ...values(renderer, /querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g),
    ...values(renderer, /getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)
  ]);
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map(match => ({
    id: attribute(match[1], "id"),
    tab: attribute(match[1], "data-tab"),
    action: attribute(match[1], "data-action"),
    route: attribute(match[1], "data-open-tab"),
    ramPreset: attribute(match[1], "data-ram-preset"),
    auditAction: match[1].includes("data-run-control-audit"),
    editorRoute: attribute(match[1], "data-open-editor"),
    bottomTab: attribute(match[1], "data-bottom-tab"),
    label: plainText(match[2])
  }));
  const idButtons = buttons.filter(button => button.id);
  const unreferencedControls = idButtons
    .filter(button => !selectorIds.has(button.id))
    .map(button => ({ id: button.id, label: button.label }));
  const anonymousControls = buttons
    .filter(button => !button.id && !button.tab && !button.action && !button.route && !button.editorRoute && !button.bottomTab && !button.ramPreset && !button.auditAction)
    .map(button => button.label || "unnamed button");

  const duplicateLabels = [...countBy(
    buttons.map(button => button.label.toLowerCase()).filter(Boolean)
  )]
    .filter(([, count]) => count > 1)
    .map(([label, count]) => ({ label, count }));

  const bridgeUsed = unique(values(renderer, /window\.bluePet\.([A-Za-z0-9_]+)/g));
  const bridgeExposed = unique(values(preload, /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm));
  const missingBridgeMethods = bridgeUsed.filter(method => !bridgeExposed.includes(method));

  const invokePairs = [...preload.matchAll(
    /^\s{2}([A-Za-z_$][\w$]*)\s*:[^\n]*?ipcRenderer\.invoke\(\s*["']([^"']+)["']/gm
  )].map(match => ({ method: match[1], channel: match[2] }));
  const sendPairs = [...preload.matchAll(
    /^\s{2}([A-Za-z_$][\w$]*)\s*:[^\n]*?ipcRenderer\.send\(\s*["']([^"']+)["']/gm
  )].map(match => ({ method: match[1], channel: match[2] }));
  const handledChannels = new Set([
    ...values(main, /trustedHandle\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.handle\(\s*["']([^"']+)["']/g)
  ]);
  const listenedChannels = new Set([
    ...values(main, /trustedOn\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.on\(\s*["']([^"']+)["']/g)
  ]);
  const missingInvokeHandlers = invokePairs.filter(item => !handledChannels.has(item.channel));
  const missingSendListeners = sendPairs.filter(item => !listenedChannels.has(item.channel));

  const buttonPanels = new Map();
  const panels = panelNames.map(name => {
    const sectionExpression = new RegExp(
      `<section\\b[^>]*data-panel=["']${name}["'][^>]*>([\\s\\S]*?)<\\/section>`,
      "gi"
    );
    const sections = [...html.matchAll(sectionExpression)];
    const sectionSource = sections.map(match => match[1]).join("\n");
    for (const id of values(sectionSource, /<button\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      buttonPanels.set(id, name);
    }
    return {
      name,
      cards: sections.length,
      controls: [...sectionSource.matchAll(/<button\b/gi)].length,
      headings: values(sectionSource, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi).map(plainText)
    };
  });

  const misplacedControls = Object.entries(expectedButtonPanels)
    .map(([id, expected]) => ({ id, expected, actual: buttonPanels.get(id) || "missing" }))
    .filter(item => item.actual !== item.expected);

  const issues = [
    ...duplicateIds.map(item => `Duplicate element id: ${item.id}`),
    ...missingPanels.map(item => `Navigation has no panel: ${item}`),
    ...orphanPanels.map(item => `Panel has no navigation item: ${item}`),
    ...misplacedControls.map(item => `Control is in the wrong workspace: ${item.id} expected ${item.expected}, found ${item.actual}`),
    ...unreferencedControls.map(item => `Visible button is not referenced by control.js: ${item.id}`),
    ...anonymousControls.map(item => `Button has no route or control identity: ${item}`),
    ...missingBridgeMethods.map(item => `Renderer bridge method is not exposed: ${item}`),
    ...missingInvokeHandlers.map(item => `IPC request has no handler: ${item.channel}`),
    ...missingSendListeners.map(item => `IPC signal has no listener: ${item.channel}`)
  ];

  return {
    checkedAt: new Date().toISOString(),
    ok: issues.length === 0,
    summary: {
      panels: panelNames.length,
      cards: panels.reduce((sum, panel) => sum + panel.cards, 0),
      visibleButtons: buttons.length,
      identifiedButtons: buttons.length - anonymousControls.length,
      rendererBridgeMethodsUsed: bridgeUsed.length,
      rendererBridgeMethodsExposed: bridgeExposed.length,
      ipcRequests: invokePairs.length,
      ipcSignals: sendPairs.length,
      issues: issues.length
    },
    navigation: { tabs: tabNames, panels: panelNames, missingPanels, orphanPanels },
    controls: { unreferencedControls, anonymousControls, duplicateLabels },
    placement: { expectedButtonPanels, misplacedControls },
    bridge: { used: bridgeUsed, exposed: bridgeExposed, missingBridgeMethods },
    ipc: { missingInvokeHandlers, missingSendListeners },
    duplicateIds,
    panels,
    issues
  };
}

module.exports = { auditControlCenter };
