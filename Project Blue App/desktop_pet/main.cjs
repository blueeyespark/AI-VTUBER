const {
  app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell,
  Tray, Menu, nativeImage
} = require("electron");
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const {
  appendActivity,
  appendObservation,
  clearActivity,
  clearObservations,
  deleteObservation,
  loadSettings,
  proactivityProfile,
  readActivity,
  readObservations,
  saveSettings
} = require("./presence-core.cjs");
const {
  normalizeSharedPaths,
  parseOcrPayload,
  parseSecuritySnapshot,
  parseHttpUrl,
  validateChatMessage,
  validateVoiceTranscript
} = require("./runtime-guards.cjs");
const { runBoundedProcess } = require("./process-runner.cjs");
const { BlueTerminalService } = require("./terminal-service.cjs");
const { BlueGitService } = require("./git-service.cjs");
const { BlueLanguageService } = require("./language-service.cjs");
const { BlueDebugService } = require("./debug-service.cjs");
const { BlueTestService } = require("./test-service.cjs");
const { BlueExtensionService } = require("./extension-service.cjs");
const { DiscordAddon, normalizeDiscordConfig } = require("./discord-addon.cjs");
const { advanceLocomotion } = require("./locomotion-core.cjs");
const { auditControlCenter } = require("./control-audit.cjs");
const { BlueWorkspaceAgentBridge, formatWorkspaceAgentResult } = require("./workspace-agent.cjs");
const { BlueFeatureService } = require("./blue-feature-service.cjs");
const { BlueEditorService } = require("./editor-service.cjs");
const { BlueWorkbenchContextService } = require("./workbench-context-service.cjs");
const { ProactiveBlueService } = require("./proactive-blue-service.cjs");
const {
  DEFAULT_STREAMING_CONFIG,
  normalizeStreamingConfig,
  sanitizeStreamingConfig,
  streamingPlatformCatalog,
  streamShowCatalog,
  streamingAutonomyCatalog,
  streamingPolicySummary,
  buildStreamingPlan,
  buildStreamerShowPlan,
  buildStreamerRunOfShow,
  buildStreamingPreflight,
  streamingChatGuide,
  moderateChatMessage,
  adultPlatformReadiness,
  obsRequest
} = require("./streaming-core.cjs");
const desktopVersion = require("./package.json").version;

let petWindow;
let controlWindow;
let tray;
let quitting = false;
let wandering = false;
let wanderTimer;
let roamPosition = null;
let roamVelocity = { x: 0, y: 0 };
let roamTarget = null;
let locomotion = "idle";
let phaseUntil = Date.now() + 1800;
let lastWanderTick = Date.now();
let requestedLocomotion = null;
let lastWalkingSignal = false;
let petRecoveryTimer = null;
let petRecoveryAttempts = [];
let controlRecoveryTimer = null;
let controlRecoveryAttempts = [];
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const workspaceAgent = new BlueWorkspaceAgentBridge(repoRoot);
const blueFeatureService = new BlueFeatureService();
const editorService = new BlueEditorService(repoRoot, {
  recoveryRoot: path.join(appRoot, ".blue", "editor-recovery")
});
const terminalService = new BlueTerminalService(repoRoot, {
  tasksPath: path.join(appRoot, ".blue", "tasks.json")
});
const gitService = new BlueGitService(repoRoot);
const languageService = new BlueLanguageService(repoRoot, { moduleRoot: __dirname });
const debugService = new BlueDebugService(repoRoot, { moduleRoot: __dirname });
const testService = new BlueTestService(repoRoot);
const extensionService = new BlueExtensionService(repoRoot, { moduleRoot: __dirname, blueVersion: desktopVersion });
const workbenchContextService = new BlueWorkbenchContextService(repoRoot, {
  stateRoot: path.join(appRoot, ".blue", "workbench-context")
});
const proactiveBlueService = new ProactiveBlueService(workbenchContextService);
workbenchContextService.attachServices({ editor: editorService, terminal: terminalService, git: gitService, language: languageService, debug: debugService, tests: testService, extensions: extensionService });
workspaceAgent.attachServices({ editor: editorService, terminal: terminalService, git: gitService, language: languageService, debug: debugService, tests: testService, context: workbenchContextService, proactive: proactiveBlueService });
const observeWorkbench = (type, details = {}, uiContext = null) => proactiveBlueService.observe(type, details, uiContext).catch(() => null);
languageService.on("event", event => {
  if (controlWindow && !controlWindow.isDestroyed() && !controlWindow.webContents.isDestroyed()) controlWindow.webContents.send("blue:lsp-event", event);
  observeWorkbench(event?.type === "diagnostics" ? "diagnostics.changed" : "language.event", event);
});
debugService.on("event", event => {
  if (controlWindow && !controlWindow.isDestroyed() && !controlWindow.webContents.isDestroyed()) controlWindow.webContents.send("blue:debug-event", event);
});
testService.on("event", event => {
  if (controlWindow && !controlWindow.isDestroyed() && !controlWindow.webContents.isDestroyed()) controlWindow.webContents.send("blue:test-event", event);
  observeWorkbench(event?.event === "finished" ? "tests.completed" : "tests.event", event);
});
extensionService.on("event", event => {
  if (controlWindow && !controlWindow.isDestroyed() && !controlWindow.webContents.isDestroyed()) controlWindow.webContents.send("blue:extension-event", event);
});
terminalService.onEvent(event => {
  if (controlWindow && !controlWindow.isDestroyed() && !controlWindow.webContents.isDestroyed()) {
    controlWindow.webContents.send("blue:terminal-event", event);
  }
  observeWorkbench(event?.type === "exit" && Number(event?.exitCode) !== 0 ? "task.failed" : "terminal.event", event);
});
const blueDataDirectory = path.join(appRoot, ".blue");
const presenceSettingsPath = path.join(blueDataDirectory, "presence.json");
const observationLedgerPath = path.join(blueDataDirectory, "observations.jsonl");
const activityLedgerPath = path.join(blueDataDirectory, "presence-activity.jsonl");
const discordConfigPath = path.join(blueDataDirectory, "discord-config.json");
const streamingConfigPath = path.join(blueDataDirectory, "streaming-config.json");
const vtuberModelConfigPath = path.join(blueDataDirectory, "vtuber-model.json");
const voiceSettingsPath = path.join(blueDataDirectory, "voice-settings.json");
const setupStatePath = path.join(blueDataDirectory, "setup-state.json");
const learningRecordsPath = path.join(blueDataDirectory, "learning-records.jsonl");
const autonomySettingsPath = path.join(blueDataDirectory, "autonomy-settings.json");
const phoneApprovalQueuePath = path.join(blueDataDirectory, "phone-approval-queue.jsonl");
const agentStatePath = path.join(blueDataDirectory, "agent-state.json");
const selfImprovementStatePath = path.join(blueDataDirectory, "self-improvement-state.json");
const matureOutfitSettingsPath = path.join(blueDataDirectory, "mature-outfit-settings.json");
const artifactStatePath = path.join(blueDataDirectory, "latest-artifact.json");
const artifactDirectory = path.join(blueDataDirectory, "artifacts");
const outfitReferencePath = path.join(blueDataDirectory, "outfit-reference.json");
const outfitStyleReferencePath = path.join(blueDataDirectory, "outfit-style-reference.json");
const conversationReferenceDirectory = path.join(blueDataDirectory, "conversation-references");
const expansionDatabasePath = path.join(blueDataDirectory, "expansion.db");
const blueMeshDatabasePath = path.join(blueDataDirectory, "bluemesh.db");
const desktopStateDirectory = path.join(blueDataDirectory, "desktop_state");
const sessionDataDirectory = path.join(desktopStateDirectory, "session");
fs.mkdirSync(sessionDataDirectory, { recursive: true });
fs.mkdirSync(artifactDirectory, { recursive: true });
fs.mkdirSync(conversationReferenceDirectory, { recursive: true });
// Screenshot smoke runs use an isolated Electron profile so they can verify a
// candidate UI without taking over or closing the creator's running Blue.
const electronProfileDirectory = process.env.BLUE_CAPTURE_DIR
  ? path.resolve(process.env.BLUE_CAPTURE_DIR, "electron-profile")
  : desktopStateDirectory;
const electronSessionDirectory = process.env.BLUE_CAPTURE_DIR
  ? path.join(electronProfileDirectory, "session")
  : sessionDataDirectory;
fs.mkdirSync(electronSessionDirectory, { recursive: true });
app.setPath("userData", electronProfileDirectory);
app.setPath("sessionData", electronSessionDirectory);
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  quitting = true;
  app.quit();
}
let presenceSettings = loadSettings(presenceSettingsPath);
let vtuberModelConfig = normalizeVtuberModelConfig(
  loadJson(vtuberModelConfigPath, {})
);
let voiceSettings = normalizeVoiceSettings(loadJson(voiceSettingsPath, {}));
let setupState = normalizeSetupState(loadJson(setupStatePath, {}));
let autonomySettings = normalizeAutonomySettings(loadJson(autonomySettingsPath, {}));
let matureOutfitSettings = normalizeMatureOutfitSettings(loadJson(matureOutfitSettingsPath, {}));
let latestArtifact = normalizeArtifactDescriptor(loadJson(artifactStatePath, null));
let agentState = normalizeAgentState(loadJson(agentStatePath, null));
const conversationReferences = new Map();
const recentSharedItemsByConversation = new Map();
let currentConversation = "Blue Desktop Pet";
const recentChatTurnsByConversation = new Map();
let discordConfig = loadJson(discordConfigPath, normalizeDiscordConfig());
let streamingConfig = normalizeStreamingConfig(loadJson(streamingConfigPath, DEFAULT_STREAMING_CONFIG));
let phoneBridgeServer = null;
let phoneBridgeToken = "";
let phoneBridgeUrl = "";
let presenceBaseState = "idle";
let presenceOverride = null;
let presenceOverrideUntil = 0;
let speakingActive = false;
let microphoneListening = false;
let voiceAbortController = null;
let imageScanning = false;
let securityScanning = false;
wandering = false;

function presenceSnapshot() {
  const state = microphoneListening
    ? "listening"
    : (imageScanning
      ? "scanning image"
      : (speakingActive
        ? "speaking"
        : (presenceOverride && Date.now() < presenceOverrideUntil
          ? presenceOverride
          : presenceBaseState)));
  return {
    state,
    proactivity: presenceSettings.proactivity,
    wandering,
    privacy: {
      vision: "off",
      microphone: microphoneListening ? "listening" : "off",
      automaticCapture: false,
      manualSharesOnly: true,
      localOcr: imageScanning ? "scanning" : "ready"
    }
  };
}

function broadcastPresence() {
  const snapshot = presenceSnapshot();
  for (const window of [petWindow, controlWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("blue:presence", snapshot);
    }
  }
}

function broadcastWanderState() {
  for (const window of [petWindow, controlWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("pet:wander-state", wandering);
    }
  }
}

function setPresenceBase(state) {
  const changed = presenceBaseState !== state;
  presenceBaseState = state;
  const overrideExpired = presenceOverride && Date.now() >= presenceOverrideUntil;
  if (overrideExpired) presenceOverride = null;
  if (changed || overrideExpired) broadcastPresence();
}

function setPresenceOverride(state, durationMs = 2600) {
  presenceOverride = state;
  presenceOverrideUntil = Date.now() + durationMs;
  broadcastPresence();
}

function blue(args, timeoutMs = 45000) {
  return runBoundedProcess(
    "python",
    ["-m", "project_blue", ...args],
    {
      cwd: appRoot,
      windowsHide: true,
      shell: false,
      env: blueProcessEnvironment()
    },
    { timeoutMs, maxOutputBytes: 2097152 }
  );
}

function blueMeshEnvironment() {
  return {
    ...process.env,
    PYTHONPATH: path.join(repoRoot, "src"),
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1"
  };
}

function blueMesh(args, timeoutMs = 45000) {
  return runBoundedProcess(
    "python",
    ["-m", "blue_mesh.lan", ...args],
    {
      cwd: repoRoot,
      windowsHide: true,
      shell: false,
      env: blueMeshEnvironment()
    },
    { timeoutMs, maxOutputBytes: 2097152 }
  );
}

function blueMeshStatusSummary() {
  const lanModule = path.join(repoRoot, "src", "blue_mesh", "lan.py");
  const transportModule = path.join(repoRoot, "src", "blue_mesh", "relay", "transport.py");
  const docsPath = path.join(repoRoot, "docs", "BlueMeshLAN.md");
  const toolsPath = path.join(repoRoot, "tools", "bluemesh");
  const serverTool = path.join(toolsPath, "START_BLUEMESH_LAN_SERVER.ps1");
  const pushTool = path.join(toolsPath, "PUSH_BLUEMESH_TO_PEER.ps1");
  const installed = fs.existsSync(lanModule) && fs.existsSync(transportModule);
  return {
    installed,
    rootModule: fs.existsSync(path.join(repoRoot, "src", "blue_mesh")),
    appModule: fs.existsSync(path.join(appRoot, "src", "blue_mesh")),
    lanModule,
    transportModule,
    docsPath,
    docsReady: fs.existsSync(docsPath),
    toolsPath,
    toolsReady: fs.existsSync(toolsPath),
    serverToolReady: fs.existsSync(serverTool),
    pushToolReady: fs.existsSync(pushTool),
    database: blueMeshDatabasePath,
    databaseExists: fs.existsSync(blueMeshDatabasePath),
    mode: "LAN/Wi-Fi sync with optional offline bundle import/export",
    workflow: [
      "Generate one session-only pairing token.",
      "Run receiver server on one trusted PC.",
      "Push a signed bundle from the other trusted PC.",
      "Reverse direction when both PCs changed Blue.",
      "Resolve conflicts manually instead of blind overwrite."
    ],
    security: {
      tokensStored: false,
      envFilesSynced: false,
      importsRequireApproval: true,
      privateNetworkOnly: true,
      sharedIdentityRequired: true,
      conflictReportsInsteadOfOverwrites: true
    },
    readiness: installed && fs.existsSync(docsPath) && fs.existsSync(serverTool) && fs.existsSync(pushTool)
      ? "ready"
      : "needs_setup"
  };
}

async function expansion(args, input = undefined) {
  const output = await runBoundedProcess(
    "python",
    [
      path.join(appRoot, "expansion", "blue_expansion.py"),
      "--db", expansionDatabasePath,
      ...args
    ],
    {
      cwd: appRoot,
      windowsHide: true,
      shell: false,
      input,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    },
    { timeoutMs: 30000, maxOutputBytes: 2097152 }
  );
  try { return JSON.parse(output); }
  catch { throw new Error("Blue's expansion service returned invalid data."); }
}

function loadJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function saveJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function readWindowsEnvironmentVariable(name) {
  if (process.platform !== "win32" || !/^[A-Z0-9_]+$/i.test(name)) return "";
  for (const root of ["HKCU\\Environment", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"]) {
    try {
      const output = execFileSync("reg.exe", ["query", root, "/v", name], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      });
      const line = output.split(/\r?\n/).find(value => value.trim().startsWith(name));
      const match = line && line.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.+)$`, "i"));
      if (match?.[1]) return match[1].trim();
    } catch {}
  }
  return "";
}

function blueProcessEnvironment() {
  const openAiKey = process.env.OPENAI_API_KEY || readWindowsEnvironmentVariable("OPENAI_API_KEY");
  return {
    ...process.env,
    ...(openAiKey ? { OPENAI_API_KEY: openAiKey } : {}),
    PYTHONPATH: path.join(appRoot, "src"),
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1"
  };
}


function isMissingGitLfsPointer(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024) return false;
    const marker = fs.readFileSync(filePath, "utf8");
    return marker.startsWith("version https://git-lfs.github.com/spec");
  } catch {
    return true;
  }
}

function isUsableVtuberModelAsset(model) {
  if (String(model?.format || "").toLowerCase() !== "vrm") return true;
  return !isMissingGitLfsPointer(path.resolve(__dirname, model.path || ""));
}
function vtuberModelRegistry() {
  const builtIn = [
    {
      id: "blue-3d",
      name: "Blue 3D VRM",
      type: "3d",
      format: "vrm",
      path: "../assets/blue_identity.vrm",
      description: "Default full-body VRM with walking, gestures, blinking, and speech movement."
    },
    {
      id: "blue-2d",
      name: "Blue 2D Portrait",
      type: "2d",
      format: "image",
      path: "../src/project_blue/data/blue_avatar.png",
      description: "Flat 2D mode with desktop movement, bobbing, tilt, idle, speaking, and gestures."
    }
  ];
  const customDirectory = path.join(appRoot, "assets", "vtuber_models");
  const custom = [];
  try {
    for (const entry of fs.readdirSync(customDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(customDirectory, entry.name);
      const manifestPath = path.join(directory, "model.json");
      const manifest = loadJson(manifestPath, null);
      if (!manifest || typeof manifest !== "object") continue;
      const relativeAsset = String(manifest.path || "").replace(/\\/g, "/").trim();
      if (!relativeAsset || relativeAsset.includes("..")) continue;
      const absoluteAsset = path.join(directory, relativeAsset);
      if (!fs.existsSync(absoluteAsset)) continue;
      const type = String(manifest.type || "").toLowerCase() === "2d" ? "2d" : "3d";
      const format = String(manifest.format || (type === "2d" ? "image" : "vrm")).slice(0, 20);
      const animations = {};
      if (format === "live2d") {
        const model3 = loadJson(absoluteAsset, {});
        const references = model3?.FileReferences || {};
        const expressions = Array.isArray(references.Expressions)
          ? references.Expressions
            .map(expression => String(expression?.Name || "").trim())
            .filter(Boolean)
          : [];
        const motions = references.Motions && typeof references.Motions === "object"
          ? Object.keys(references.Motions).filter(Boolean)
          : [];
        animations.expressions = expressions;
        animations.motions = motions;
      }
      custom.push({
        id: `custom-${entry.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        name: String(manifest.name || entry.name).slice(0, 80),
        type,
        format,
        path: path.relative(__dirname, absoluteAsset).replace(/\\/g, "/"),
        description: String(manifest.description || "Custom VTuber model").slice(0, 240),
        animations
      });
    }
  } catch {}
  return [...builtIn, ...custom].filter(isUsableVtuberModelAsset);
}

function normalizeVtuberModelConfig(value) {
  const selectedModelId = String(value?.selectedModelId || "blue-3d").trim();
  return { selectedModelId: selectedModelId || "blue-3d" };
}

function currentVtuberModel() {
  const models = vtuberModelRegistry();
  return models.find(model => model.id === vtuberModelConfig.selectedModelId)
    || models[0];
}

function broadcastVtuberModel() {
  const model = currentVtuberModel();
  for (const window of [petWindow, controlWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("blue:model-changed", model);
    }
  }
}

function normalizeVoiceSettings(value) {
  const wakeWords = Array.isArray(value?.wakeWords)
    ? value.wakeWords
    : ["hey blue", "hay blue", "blue"];
  const cleanedWakeWords = wakeWords
    .map(item => String(item || "").toLowerCase().replace(/\s+/g, " ").trim())
    .filter(item => item.length >= 2 && item.length <= 40)
    .slice(0, 12);
  return {
    wakeWords: cleanedWakeWords.length ? cleanedWakeWords : ["hey blue"],
    ownerPhraseLock: Boolean(value?.ownerPhraseLock),
    ownerPhrase: String(value?.ownerPhrase || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120),
    listenSeconds: Math.max(3, Math.min(Number(value?.listenSeconds || 10), 15)),
    microphoneName: String(value?.microphoneName || "").slice(0, 160),
    outputVoiceName: String(value?.outputVoiceName || "").slice(0, 120),
    voiceProfileMode: String(value?.voiceProfileMode || "phrase-lock").slice(0, 40),
    customVoiceNote: String(value?.customVoiceNote || "").slice(0, 500)
  };
}

function normalizeSetupState(value) {
  return {
    ollamaPrompt: ["accepted", "installed", "skipped", "later"].includes(value?.ollamaPrompt)
      ? value.ollamaPrompt
      : "pending",
    ollamaPromptedAt: String(value?.ollamaPromptedAt || "").slice(0, 80)
  };
}

function normalizeMatureOutfitSettings(value) {
  return {
    enabled: Boolean(value?.enabled),
    label: "mature_stream_safe",
    rules: [
      "Adult-coded fashion is allowed only when covered and non-explicit.",
      "No nudity, exposed genitals, explicit sex acts, or minor-coded characters.",
      "Use opaque or strategically covered clothing for sheer-looking materials.",
      "Keep generated outfit layers suitable for Live2D/VRoid rigging and streaming."
    ]
  };
}

function saveMatureOutfitSettings(value) {
  matureOutfitSettings = normalizeMatureOutfitSettings(value);
  saveJsonAtomic(matureOutfitSettingsPath, matureOutfitSettings);
  appendActivity(activityLedgerPath, "settings", "Mature stream-safe outfit mode changed", {
    enabled: matureOutfitSettings.enabled
  });
  return matureOutfitSettings;
}

function detectMatureOutfitModeRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!/\b(18\+|adult|mature|pin[-\s]?up|lingerie|bikini|swimsuit|nightclub|beachwear|car[-\s]?wash)\b/.test(text)) return "";
  if (/\b(turn|set|enable|add|make|use)\b.*\b(mode|tag|label|system|warning)\b/.test(text)
    || /\b18\+\s+style\s+mode\b/.test(text)
    || /\bmature\s+stream[-\s]?safe\b/.test(text)) return "enable";
  if (/\b(turn|set|disable|remove)\b.*\b(off|normal|mode|tag|label)\b/.test(text)) return "disable";
  if (/\b(status|is.*on|current)\b/.test(text)) return "status";
  return "";
}

function matureOutfitTagForMessage(message) {
  const text = String(message || "").toLowerCase();
  const matureKeywords = /\b(18\+|adult|mature|swimsuit|swimsute|swimsuite|bikini|lingerie|pin[-\s]?up|beachwear|nightclub|clubwear|bodysuit|sheer|towel|robe|car[-\s]?wash)\b/.test(text);
  return matureOutfitSettings.enabled || matureKeywords
    ? {
      label: "mature_stream_safe",
      warning: "Adult-coded, non-explicit, covered outfit concept. No nudity or explicit sex.",
      mature: true
    }
    : {
      label: "normal",
      warning: "Normal stream-safe outfit concept.",
      mature: false
    };
}

function formatMatureOutfitSettings() {
  return [
    matureOutfitSettings.enabled
      ? "Mature stream-safe outfit mode is on."
      : "Mature stream-safe outfit mode is off.",
    "When on, Blue may design adult-coded but covered outfits: swimsuit, bikini, lingerie-inspired stagewear, pin-up covered looks, nightclub outfits, fantasy armor, towels/robes, and car-wash themed outfits.",
    "The rule stays: no nudity, exposed genitals, explicit sex, or minor-coded characters.",
    "Generated outfit artifacts will be tagged as mature_stream_safe or normal."
  ].join(" ");
}

function stripWakeWords(text, wakeWords) {
  let result = String(text || "").trim();
  const normalized = result.toLowerCase();
  const matched = wakeWords.find(word => normalized.includes(word));
  if (!matched) return { matched: "", command: result };
  const index = normalized.indexOf(matched);
  result = result.slice(index + matched.length).replace(/^[,.:;\-\s]+/, "").trim();
  return { matched, command: result };
}

function assistantNameForModel(model = currentVtuberModel()) {
  const name = String(model?.name || "").toLowerCase();
  if (name.includes("qwen")) return "qwen";
  return "blue";
}

function displayAssistantName(value) {
  const name = String(value || "blue").trim();
  return name ? name[0].toUpperCase() + name.slice(1) : "Blue";
}

function activeWakeWords() {
  const assistantName = assistantNameForModel();
  const aliases = assistantName === "qwen"
    ? ["qwen", "quen", "quinn", "queen", "kwen", "when", "gwen", "bor", "bore", "boar", "born"]
    : ["blue", "blu"];
  const activeDefaults = aliases.flatMap(alias => [
    `hey ${alias}`,
    `hay ${alias}`,
    `hi ${alias}`,
    `okay ${alias}`,
    alias
  ]);
  const inactiveDefaults = /^(?:(?:hey|hay)\s+)?(?:blue|qwen)$/i;
  const custom = voiceSettings.wakeWords.filter(word => !inactiveDefaults.test(word));
  return [...new Set([...activeDefaults, ...custom])]
    .map(word => word.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function sendPetBubble(message, durationMs = 5200) {
  if (petWindow && !petWindow.isDestroyed() && !petWindow.webContents.isDestroyed()) {
    petWindow.webContents.send("pet:bubble", { message, durationMs });
  }
}

function readLearningRecords(limit = 30) {
  try {
    return fs.readFileSync(learningRecordsPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .slice(-Math.max(1, Math.min(Number(limit) || 30, 100)))
      .reverse();
  } catch {
    return [];
  }
}

function appendLearningRecord(topic, source, notes = "", extra = {}) {
  const cleanTopic = normalizeLearningSearchTopic(topic).slice(0, 240);
  if (!cleanTopic) throw new Error("Tell Blue what to learn first.");
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    assistantName: assistantNameForModel(),
    topic: cleanTopic,
    source: String(source || "chat").slice(0, 80),
    status: String(extra.status || "learning_requested").slice(0, 80),
    notes: String(notes || "").trim().slice(0, 4000),
    sources: Array.isArray(extra.sources) ? extra.sources.slice(0, 24) : [],
    pagesRead: Math.max(0, Math.min(Number(extra.pagesRead || 0), 100)),
    guidelines: [
      "Learning creates local notes and plans first.",
      "Claims need sources or tests before becoming findings.",
      "Building code from learning requires normal project edits, checks, and approval gates.",
      "Security-sensitive topics such as firewalls must stay auditable and reversible."
    ]
  };
  fs.mkdirSync(path.dirname(learningRecordsPath), { recursive: true });
  fs.appendFileSync(learningRecordsPath, `${JSON.stringify(record)}\n`, "utf8");
  appendActivity(activityLedgerPath, "learning", "Learning request captured", {
    topic: record.topic,
    assistantName: record.assistantName
  });
  return record;
}

function detectLearningRequest(message) {
  const text = String(message || "").trim();
  const match = text.match(/\b(?:can you\s+)?learn(?:\s+how)?(?:\s+to)?\s+(.+)/i);
  if (!match) return "";
  return normalizeLearningSearchTopic(match[1]
    .replace(/^(about|everything about|eveything about|everything it can about|eveything it can about|all about)\s+/i, "")
    .replace(/\b(download|install|get)\s+(whatever|what ever|anything|everything)\s+(you\s+)?need.*$/i, "")
    .replace(/[?.!]+$/g, "")
    .trim());
}

function conversationMemoryKey(conversationId = currentConversation) {
  return String(conversationId || "Blue Desktop Pet").trim() || "Blue Desktop Pet";
}

function recentChatTurnsFor(conversationId = currentConversation) {
  const key = conversationMemoryKey(conversationId);
  const turns = recentChatTurnsByConversation.get(key);
  return Array.isArray(turns) ? turns : [];
}

function clearRecentChatTurns(conversationId = currentConversation) {
  recentChatTurnsByConversation.delete(conversationMemoryKey(conversationId));
}

function rememberChatTurn(role, content, conversationId = currentConversation) {
  const clean = String(content || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const key = conversationMemoryKey(conversationId);
  const turns = recentChatTurnsFor(key);
  turns.push({
    role,
    content: clean.slice(0, 900),
    timestamp: new Date().toISOString()
  });
  recentChatTurnsByConversation.set(key, turns.slice(-20));
}

function vagueLearningTopic(topic) {
  const text = String(topic || "").toLowerCase().replace(/[?.!]/g, "").trim();
  return !text
    || /^(this|that|it|what we are talking about|what we're talking about|what we talked about|the thing|that thing|this topic|that topic|all this|everything here|the chat|our chat|what i said|what you said)$/.test(text);
}

function resolveLearningTopicFromChat(fallback = "") {
  const recentChatTurns = recentChatTurnsFor();
  const candidates = recentChatTurns
    .filter(turn => turn.role === "user")
    .map(turn => turn.content)
    .filter(text =>
      text.length >= 8
      && !/\blearn\b/i.test(text)
      && !/^(yes|ok|okay|sure|no|thanks|thank you)\b/i.test(text)
    );
  const best = candidates.at(-1)
    || recentChatTurns.filter(turn => turn.role === "assistant").map(turn => turn.content).at(-1)
    || fallback;
  return normalizeLearningSearchTopic(best)
    .replace(/^(so|ok|okay|also|and)\s+/i, "")
    .slice(0, 240)
    .trim();
}

function resolveLearningRequestTopic(message) {
  const topic = detectLearningRequest(message);
  if (!topic) return "";
  if (vagueLearningTopic(topic)) return resolveLearningTopicFromChat(topic);
  return topic;
}

function detectLearnAndImplementRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\blearn\b/.test(text)
    && /\b(implement|build into|add into|put into|make it part of|into (?:your|its|the) (?:os|system|code|brain|project blue))\b/.test(text);
}

function detectLearningToolDownloadRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\blearn\b/.test(text)
    && /\b(download|install|get)\b.*\b(whatever|what ever|anything|everything|tools?|apps?|software|need)\b/.test(text);
}

function implementationPlanForTopic(topic) {
  const lower = String(topic || "").toLowerCase();
  const steps = [
    "1. Learn: collect trusted sources, examples, and constraints.",
    "2. Design: write a small module plan with inputs, outputs, permissions, UI, storage, and rollback.",
    "3. Build: make scoped Project Blue code changes instead of silent system changes.",
    "4. Verify: run checks/tests and create a visible artifact or UI path when possible.",
    "5. Gate: require approval for risky actions such as security settings, file writes outside approved roots, startup tasks, or model edits."
  ];
  if (/\b(2d|live2d|rig|rigging|model)\b/.test(lower)) {
    steps.push(
      "2D rigging needs: layered PSD or separated PNG parts, Live2D Cubism Editor, ArtMeshes, warp/rotation deformers, standard parameters, keyforms, expressions, physics, and export testing in VTube Studio/Project Blue."
    );
  }
  return steps.join("\n");
}

async function handleLearnAndImplementRequest(message) {
  const topic = resolveLearningRequestTopic(message)
    || normalizeLearningSearchTopic(message).slice(0, 240)
    || "current Project Blue capability";
  const research = await researchLearningTopic(topic);
  const notes = [
    "Creator asked Blue to learn and implement this into Project Blue.",
    "",
    "Implementation plan:",
    implementationPlanForTopic(topic),
    "",
    `Research sources collected: ${research.sources.length}`
  ].join("\n");
  const record = appendLearningRecord(topic, "chat_implement_request", notes, {
    status: "implementation_plan_requested",
    sources: research.sources
  });
  appendActivity(activityLedgerPath, "learning", "Learn-and-implement request captured", {
    topic: record.topic,
    sourceCount: research.sources.length
  });
  return [
    `I saved this as a learn-and-implement request: ${record.topic}.`,
    `I collected ${research.sources.length} source(s) and made an implementation plan.`,
    "I will not pretend it is built into my system until Project Blue code is actually changed and checks pass.",
    "",
    implementationPlanForTopic(record.topic)
  ].join("\n");
}

function detectFirewallBuildRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  if (!/\bfirewall\b/.test(text)) return false;
  return /\b(make|build|create|setup|set up|configure|add|install|code|program)\b/.test(text);
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `ProjectBlue/${desktopVersion}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `ProjectBlue/${desktopVersion}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }
    const text = await response.text();
    return text.slice(0, 600000);
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => {
      const number = Number(code);
      return Number.isFinite(number) ? String.fromCharCode(number) : " ";
    });
}

function readableWebPageSummary(html) {
  const raw = String(html || "");
  const title = decodeHtmlEntities(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = decodeHtmlEntities(
    raw.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
    || ""
  );
  const body = decodeHtmlEntities(raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:nav|footer|header|aside)[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  );
  return compactResearchText([title, description, body].filter(Boolean).join(". "), 1100);
}

function safeReadableWebUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (/youtube\.com|youtu\.be|duckduckgo\.com\/y\.js/i.test(parsed.hostname + parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function enrichSourcesWithReadablePages(sources, notes, limit = 6) {
  let readCount = 0;
  for (const source of sources) {
    if (readCount >= limit) break;
    if (source.type === "video" || !safeReadableWebUrl(source.url)) continue;
    try {
      const html = await fetchText(source.url, 12000);
      const summary = readableWebPageSummary(html);
      if (summary && summary.length >= 80) {
        source.summary = compactResearchText(summary, 700);
        source.readStatus = "read";
        notes.push(`Read webpage ${source.title}: ${compactResearchText(summary, 900)}`);
        readCount += 1;
      }
    } catch (error) {
      source.readStatus = "unreadable";
      source.readError = String(error.message || "read failed").slice(0, 160);
      notes.push(`Could not read webpage ${source.title}: ${source.readError}`);
    }
  }
  return readCount;
}

function compactResearchText(value, limit = 900) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeLearningSearchTopic(topic) {
  return String(topic || "")
    .replace(/\bimploment\b/gi, "implement")
    .replace(/\bimplemnt\b/gi, "implement")
    .replace(/\bimpement\b/gi, "implement")
    .replace(/\bfirwall\b/gi, "firewall")
    .replace(/\bfirewal\b/gi, "firewall")
    .replace(/\bfire wall\b/gi, "firewall")
    .replace(/\bornge\b/gi, "orange")
    .replace(/\borng\b/gi, "orange")
    .replace(/\bcrsh\b/gi, "crush")
    .replace(/\bcrushh\b/gi, "crush")
    .replace(/\bsuda\b/gi, "soda")
    .replace(/\bsodaa\b/gi, "soda")
    .replace(/\b2ed\b/gi, "2D")
    .replace(/\btwo d\b/gi, "2D")
    .replace(/\b2 d\b/gi, "2D")
    .replace(/\b3ed\b/gi, "3D")
    .replace(/\bthree d\b/gi, "3D")
    .replace(/\b3 d\b/gi, "3D")
    .replace(/\baviter\b/gi, "avatar")
    .replace(/\bavitar\b/gi, "avatar")
    .replace(/\bmodal\b/gi, "model")
    .replace(/\bmodals\b/gi, "models")
    .replace(/\brig\b/gi, "rig")
    .replace(/\brigging\b/gi, "rigging")
    .replace(/\s+/g, " ")
    .trim();
}

async function researchLearningTopic(topic) {
  const cleanTopic = normalizeLearningSearchTopic(topic).slice(0, 240);
  if (!cleanTopic) throw new Error("Choose a learning topic first.");
  const sources = [];
  const notes = [];
  const addSource = (title, url, summary) => {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl || sources.some(source => source.url === cleanUrl)) return;
    sources.push({
      type: "document",
      title: compactResearchText(title, 160),
      url: cleanUrl.slice(0, 1000),
      summary: compactResearchText(summary, 700)
    });
  };
  const addVideoSource = (title, url, summary) => {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl || sources.some(source => source.url === cleanUrl)) return;
    sources.push({
      type: "video",
      title: compactResearchText(title, 160),
      url: cleanUrl.slice(0, 1000),
      summary: compactResearchText(summary, 700)
    });
  };

  if (/\bfire\s*wall|firewall|firwall|firewal|windows defender firewall|network firewall\b/i.test(cleanTopic)) {
    [
      {
        title: "Microsoft Learn: Windows Firewall overview",
        url: "https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/",
        summary: "Windows Firewall controls allowed and blocked network traffic through profiles, rules, and policy settings."
      },
      {
        title: "Microsoft Learn: Windows Firewall rules",
        url: "https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules",
        summary: "Microsoft recommendations for creating and managing firewall rules, including ports, programs, protocols, and profiles."
      },
      {
        title: "Microsoft Learn: Configure firewall rules with Group Policy",
        url: "https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/configure",
        summary: "Examples for configuring Windows Firewall rules with Windows Firewall with Advanced Security and Group Policy."
      },
      {
        title: "NIST SP 800-41 Rev. 1: Guidelines on Firewalls and Firewall Policy",
        url: "https://csrc.nist.gov/pubs/sp/800/41/r1/final",
        summary: "NIST guidance on firewall technologies, firewall policy, rule design, deployment, testing, and management."
      },
      {
        title: "CISA: Understanding Firewalls for Home and Small Office Use",
        url: "https://www.cisa.gov/news-events/news/understanding-firewalls-home-and-small-office-use",
        summary: "CISA guidance explaining what firewalls do and how home and small office users can use them."
      },
      {
        title: "CISA: Enhanced visibility and hardening guidance",
        url: "https://www.cisa.gov/resources-tools/resources/enhanced-visibility-and-hardening-guidance-communications-infrastructure",
        summary: "CISA hardening guidance including strict default-deny ACL strategy and logging denied traffic."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted firewall research seed: Microsoft Windows Firewall docs, NIST firewall policy guidance, and CISA hardening guidance were added."
    );
  }

  if (/\b(2d|live2d|vtuber|vts|v?tube studio|avatar model|cubism)\b/i.test(cleanTopic)) {
    [
      {
        title: "Live2D Cubism Manual",
        url: "https://docs.live2d.com/en/cubism-editor-manual/top/",
        summary: "Official Live2D Cubism manual covering editor workflows for creating and preparing Live2D models."
      },
      {
        title: "Live2D Cubism SDK for Web Manual",
        url: "https://docs.live2d.com/en/cubism-sdk-manual/top/",
        summary: "Official Live2D SDK manual for loading and displaying Cubism models in web/Electron-style runtimes."
      },
      {
        title: "Live2D Cubism SDK for Web GitHub",
        url: "https://github.com/Live2D/CubismWebSamples",
        summary: "Official Live2D Cubism Web samples for rendering model3.json, moc3, textures, motions, expressions, and physics."
      },
      {
        title: "VTube Studio Documentation",
        url: "https://github.com/DenchiSoft/VTubeStudio",
        summary: "Official VTube Studio documentation and API notes for Live2D VTuber workflows."
      },
      {
        title: "VTube Studio Plugin API",
        url: "https://github.com/DenchiSoft/VTubeStudio/tree/master/Files",
        summary: "Official VTube Studio files covering API and model-related integration references."
      },
      {
        title: "pixi-live2d-display Documentation",
        url: "https://guansss.github.io/pixi-live2d-display/",
        summary: "Documentation for the PixiJS Live2D renderer used by Project Blue to display 2D Live2D models."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted 2D VTuber research seed: Live2D Cubism docs, VTube Studio docs, and the current Pixi Live2D renderer docs were added."
    );
    [
      {
        title: "Live2D Cubism official video tutorials",
        url: "https://www.youtube.com/@Live2D/search?query=basic%20tutorial%20rigging",
        summary: "Video watch queue for official Live2D Cubism beginner, setup, and rigging tutorials."
      },
      {
        title: "Live2D Cubism official tutorials search",
        url: "https://www.youtube.com/results?search_query=Live2D+Cubism+official+tutorial+rigging+ArtMesh+deformer+parameters",
        summary: "Video search for Live2D Cubism ArtMesh, deformer, parameter, and rigging workflows."
      },
      {
        title: "VTube Studio video setup tutorials",
        url: "https://www.youtube.com/results?search_query=VTube+Studio+Live2D+model+setup+tracking+expression+tutorial",
        summary: "Video watch queue for setting up finished Live2D models in VTube Studio."
      }
    ].forEach(source => addVideoSource(source.title, source.url, source.summary));
  }

  if (/\b(2d.*rig|rig.*2d|live2d.*rig|rig.*live2d|artmesh|deformer|parameter|skinning|glue|mesh edit|mouth form|eye blink|physics|psd.*layer)\b/i.test(cleanTopic)) {
    [
      {
        title: "Live2D Cubism: About ArtMeshes",
        url: "https://docs.live2d.com/en/cubism-editor-manual/concept-of-artmesh/",
        summary: "Official Live2D documentation explaining ArtMeshes, the mesh assigned to each PSD layer and deformed to create motion."
      },
      {
        title: "Live2D Cubism: Automatic Mesh generator",
        url: "https://docs.live2d.com/en/cubism-editor-manual/mesh-edit/",
        summary: "Official Live2D documentation for generating ArtMeshes automatically from illustration layers."
      },
      {
        title: "Live2D Cubism: Edit Mesh manually",
        url: "https://docs.live2d.com/en/cubism-editor-manual/mesh-edit-manual/",
        summary: "Official Live2D documentation for manually editing ArtMesh vertices, especially for detailed face and mouth deformation."
      },
      {
        title: "Live2D Cubism: About Deformers",
        url: "https://docs.live2d.com/en/cubism-editor-manual/deformer/",
        summary: "Official Live2D documentation for warp and rotation deformers, used to move groups of mesh vertices efficiently."
      },
      {
        title: "Live2D Cubism: About Parameters",
        url: "https://docs.live2d.com/en/cubism-editor-manual/parameter/",
        summary: "Official Live2D documentation for parameters such as Angle X and Mouth Open/Close that drive keyform interpolation."
      },
      {
        title: "Live2D Cubism: Add/Delete Keys to/from parameters",
        url: "https://docs.live2d.com/en/cubism-editor-manual/edit-parameters/",
        summary: "Official Live2D documentation for adding, deleting, and editing keyforms on parameters."
      },
      {
        title: "Live2D Cubism: Standard Parameter List",
        url: "https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/",
        summary: "Official Live2D documentation for common parameter naming and ranges for reusable Live2D models."
      },
      {
        title: "Live2D Cubism: Skinning",
        url: "https://docs.live2d.com/en/cubism-editor-manual/skinning/",
        summary: "Official Live2D documentation for using rotation deformers to create smooth motion in long thin parts such as hair and strings."
      },
      {
        title: "Live2D Cubism: Glue",
        url: "https://docs.live2d.com/en/cubism-editor-manual/glue/",
        summary: "Official Live2D documentation for binding vertices of two ArtMeshes so adjacent parts move together."
      },
      {
        title: "Live2D Cubism: Auto generation of facial motion",
        url: "https://docs.live2d.com/en/cubism-editor-manual/face-auto-edit/",
        summary: "Official Live2D documentation for semi-automatic face deformer and facial motion generation."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted Live2D rigging research seed: ArtMeshes, mesh editing, deformers, parameters, keyforms, standard parameters, skinning, glue, and face auto-edit docs were added."
    );
    [
      {
        title: "Live2D rigging full workflow video search",
        url: "https://www.youtube.com/results?search_query=Live2D+Cubism+full+rigging+workflow+PSD+ArtMesh+deformer+parameters",
        summary: "Video watch queue for end-to-end Live2D rigging workflows from layered PSD to exported model."
      },
      {
        title: "Live2D face rigging video search",
        url: "https://www.youtube.com/results?search_query=Live2D+Cubism+face+rigging+eyes+mouth+brows+parameters+tutorial",
        summary: "Video watch queue focused on face rigging, eye blink, mouth forms, and brow parameters."
      },
      {
        title: "Live2D physics and hair rigging video search",
        url: "https://www.youtube.com/results?search_query=Live2D+Cubism+physics+hair+skinning+glue+tutorial",
        summary: "Video watch queue focused on physics, hair, skinning, glue, and moving accessories."
      }
    ].forEach(source => addVideoSource(source.title, source.url, source.summary));
  }

  if (/\b(3d|vrm|vroid|blender|three-vrm|3d model|avatar edit|edit.*model|model edit|rigging|armature)\b/i.test(cleanTopic)) {
    [
      {
        title: "VRM.dev: 3D humanoid avatar file format",
        url: "https://vrm.dev/en/",
        summary: "Official VRM documentation site for the 3D humanoid avatar format used by VRM VTuber models."
      },
      {
        title: "VRM Consortium",
        url: "https://vrm-consortium.org/en/",
        summary: "Official VRM Consortium site describing VRM as a glTF2-based format for human-like 3D avatar data."
      },
      {
        title: "VRM specification repository",
        url: "https://github.com/vrm-c/vrm-specification",
        summary: "Official VRM specification repository defining VRM model structure and metadata."
      },
      {
        title: "VRoid Studio: VRM export feature",
        url: "https://vroid.pixiv.help/hc/en-us/articles/15760756822297-I-want-to-learn-more-about-the-VRM-export-feature",
        summary: "Official VRoid Studio help for exporting characters as VRM files."
      },
      {
        title: "pixiv three-vrm",
        url: "https://github.com/pixiv/three-vrm",
        summary: "Official three-vrm library used to load and operate VRM avatars in Three.js."
      },
      {
        title: "VRM features",
        url: "https://vrm.dev/en/vrm/vrm_features/",
        summary: "Official VRM documentation covering avatar features such as expressions, lip sync, blinking, and blend shapes."
      },
      {
        title: "Blender Manual: Armatures",
        url: "https://docs.blender.org/manual/en/latest/animation/armatures/index.html",
        summary: "Official Blender documentation for armatures, bones, and rigging workflows."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted 3D VTuber research seed: VRM specification/docs, VRoid export help, three-vrm docs, and Blender armature docs were added."
    );
  }

  if (/\b(pc|windows|computer|fix|repair|troubleshoot|troubleshooting|driver|crash|slow|network|wifi|audio|microphone|app won'?t open|error)\b/i.test(cleanTopic)) {
    [
      {
        title: "Microsoft Support: Windows help and learning",
        url: "https://support.microsoft.com/windows",
        summary: "Microsoft's Windows support hub for troubleshooting updates, devices, drivers, networking, accounts, apps, recovery, and common PC issues."
      },
      {
        title: "Microsoft Learn: Windows troubleshooting documentation",
        url: "https://learn.microsoft.com/troubleshoot/windows-client/",
        summary: "Microsoft troubleshooting documentation for Windows client issues, including system, networking, performance, update, and application problems."
      },
      {
        title: "Microsoft Support: Recovery options in Windows",
        url: "https://support.microsoft.com/windows/recovery-options-in-windows-31ce2444-7de3-818c-d626-e3b5a3024da5",
        summary: "Microsoft guidance for Windows recovery options such as startup repair, restore points, reset, and advanced startup."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted Windows troubleshooting seed: Microsoft Windows support and troubleshooting docs were added. Blue should prefer read-only diagnosis first, explain risk, and use approval before changing settings or files."
    );
  }

  if (/\b(discord|server mod|moderation|bot command|guild|channel|role|twitch|stream|chat mod|streaming|obs)\b/i.test(cleanTopic)) {
    [
      {
        title: "Discord Developer Documentation",
        url: "https://discord.com/developers/docs/intro",
        summary: "Official Discord developer documentation for bots, applications, gateway events, slash commands, permissions, channels, and interactions."
      },
      {
        title: "Discord: Moderation and Safety",
        url: "https://discord.com/safety",
        summary: "Discord safety resources covering moderation, community safety, account security, and platform policies."
      },
      {
        title: "Twitch Developers Documentation",
        url: "https://dev.twitch.tv/docs/",
        summary: "Official Twitch developer documentation for chat, EventSub, Helix APIs, authentication, moderation, and stream integrations."
      },
      {
        title: "Twitch Safety Center",
        url: "https://safety.twitch.tv/",
        summary: "Twitch safety resources for moderation, community guidelines, AutoMod, reporting, and channel safety."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted community automation seed: Discord and Twitch official docs were added. Blue should separate helpful moderation from risky actions such as banning, role changes, token handling, or account access."
    );
  }

  if (/\b(openai|api|ai app|chatbot|assistant|voice|tts|speech|image generation|image edit|function calling|tools)\b/i.test(cleanTopic)) {
    [
      {
        title: "OpenAI API Documentation",
        url: "https://platform.openai.com/docs",
        summary: "Official OpenAI documentation for building AI apps with models, tools, text, images, audio, safety, and API patterns."
      },
      {
        title: "OpenAI API Reference",
        url: "https://platform.openai.com/docs/api-reference",
        summary: "OpenAI API reference for endpoints, request bodies, responses, files, images, audio, and model parameters."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted OpenAI builder seed: official OpenAI docs were added for AI app, image, audio, and tool workflows."
    );
  }

  if (/\b(general-purpose|desktop assistant|task planning|memory|assistant|agent|workflow|web research|source reading|summaries|summarize|research workflow)\b/i.test(cleanTopic)) {
    [
      {
        title: "OpenAI Prompt Engineering Guide",
        url: "https://platform.openai.com/docs/guides/prompt-engineering",
        summary: "OpenAI guidance for giving models clear goals, context, constraints, and examples so assistant behavior is more reliable."
      },
      {
        title: "Microsoft Learn: Accessibility and usability for Windows apps",
        url: "https://learn.microsoft.com/windows/apps/design/accessibility/accessibility",
        summary: "Microsoft guidance for building Windows app experiences that are usable, understandable, and accessible."
      },
      {
        title: "NIST AI Risk Management Framework",
        url: "https://www.nist.gov/itl/ai-risk-management-framework",
        summary: "NIST AI Risk Management Framework resources for trustworthy AI, risk management, measurement, governance, and documentation."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted general assistant seed: OpenAI prompting, Windows app usability, and NIST AI risk-management resources were added. Blue should learn reusable task planning, source-backed summaries, memory boundaries, and approval-aware behavior."
    );
  }

  if (/\b(blender|3d art|render|texture|material|animation|mesh|modeling|sculpt|uv|rig)\b/i.test(cleanTopic)) {
    [
      {
        title: "Blender Manual",
        url: "https://docs.blender.org/manual/en/latest/",
        summary: "Official Blender manual for modeling, sculpting, materials, rendering, animation, scripting, rigging, and asset workflows."
      },
      {
        title: "Blender Python API",
        url: "https://docs.blender.org/api/current/",
        summary: "Official Blender Python API documentation for automating Blender scenes, meshes, materials, rendering, and tools."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Trusted Blender seed: official Blender manual and Python API docs were added. Blue should plan scene edits and save visible outputs before claiming a model or render is done."
    );
  }

  if (/\borange crush\b/i.test(cleanTopic)) {
    [
      {
        title: "Orange Crush cocktail",
        url: "https://en.wikipedia.org/wiki/Orange_Crush_(cocktail)",
        summary: "Orange Crush can refer to a cocktail made with vodka, triple sec, orange juice, and lemon-lime soda."
      },
      {
        title: "Crush soft drink",
        url: "https://en.wikipedia.org/wiki/Crush_(soft_drink)",
        summary: "Crush is a brand of carbonated soft drinks, including orange soda, owned and marketed internationally by Keurig Dr Pepper."
      }
    ].forEach(source => addSource(source.title, source.url, source.summary));
    notes.push(
      "Orange Crush finding: the phrase can mean different things. For a drink recipe, Orange Crush commonly refers to a cocktail made with vodka, triple sec, orange juice, and lemon-lime soda. It can also mean the Crush orange soda brand, the R.E.M. song, or other unrelated uses."
    );
  }

  const queries = [
    cleanTopic,
    `${cleanTopic} documentation`,
    `${cleanTopic} best practices`,
    `${cleanTopic} security guidelines`,
    `${cleanTopic} implementation steps`,
    `${cleanTopic} testing and validation`
  ];

  [
    `${cleanTopic} tutorial`,
    `${cleanTopic} walkthrough`,
    `${cleanTopic} full course`
  ].forEach(query => addVideoSource(
    `Video search: ${query}`,
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    "Video watch queue entry. Blue should use videos for visual workflows, then save notes and verify against official docs where possible."
  ));

  for (const query of queries) try {
    const ddg = await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    if (ddg.AbstractText) {
      addSource(ddg.Heading || cleanTopic, ddg.AbstractURL, ddg.AbstractText);
      notes.push(`DuckDuckGo ${query}: ${compactResearchText(ddg.AbstractText)}`);
    }
    const related = Array.isArray(ddg.RelatedTopics) ? ddg.RelatedTopics : [];
    for (const item of related.flatMap(entry => Array.isArray(entry.Topics) ? entry.Topics : [entry]).slice(0, 6)) {
      if (item?.FirstURL && item?.Text) addSource(item.Text.split(" - ")[0], item.FirstURL, item.Text);
    }
  } catch (error) {
    notes.push(`DuckDuckGo research failed for ${query}: ${error.message}`);
  }

  try {
    const search = await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanTopic)}&limit=3&namespace=0&format=json`
    );
    const titles = Array.isArray(search?.[1]) ? search[1] : [];
    const urls = Array.isArray(search?.[3]) ? search[3] : [];
    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index];
      let summary = "";
      try {
        const page = await fetchJson(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        );
        summary = page.extract || "";
      } catch {}
      addSource(title, urls[index], summary);
      if (summary) notes.push(`Wikipedia ${title}: ${compactResearchText(summary)}`);
    }
  } catch (error) {
    notes.push(`Wikipedia research failed: ${error.message}`);
  }

  const pagesRead = await enrichSourcesWithReadablePages(sources, notes, 6);
  if (pagesRead) {
    notes.push(`Readable webpage pass: opened and summarized ${pagesRead} webpage(s).`);
  } else {
    notes.push("Readable webpage pass: no readable webpages could be summarized this time.");
    maybeCreateSelfImprovementProposal(`Deep research for "${cleanTopic}" saved sources but read 0 webpages.`);
  }

  const record = appendLearningRecord(
    cleanTopic,
    "web_research",
    [
      notes.join("\n"),
      "",
      `Readable webpages summarized: ${pagesRead}.`,
      "Video research pass: saved video/tutorial search links as watch queue items. Blue can use these for visual workflows, but should not claim exact video details unless a transcript, title, description, or user-provided notes are available."
    ].join("\n").slice(0, 4000) || "No public starter sources were found in this pass.",
    { status: "research_collected", sources, pagesRead }
  );
  appendActivity(activityLedgerPath, "learning", "Web research collected", {
    topic: cleanTopic,
    sourceCount: sources.length
  });
  return record;
}

function learningSummaryLines(record) {
  const lines = [];
  const notes = compactResearchText(record.notes || "", 1400);
  if (notes) {
    for (const line of notes.split(/(?<=\.)\s+|\n+/)) {
      const clean = compactResearchText(line, 220);
      if (
        clean
        && !/^sources?:/i.test(clean)
        && !/^https?:\/\//i.test(clean)
        && !/\bfailed\b/i.test(clean)
        && !lines.includes(clean)
      ) {
        lines.push(clean);
      }
      if (lines.length >= 4) break;
    }
  }
  const sourceSummaries = Array.isArray(record.sources)
    ? record.sources
      .map(source => compactResearchText(source.summary || "", 220))
      .filter(Boolean)
    : [];
  for (const summary of sourceSummaries) {
    if (!lines.some(line => line.toLowerCase() === summary.toLowerCase())) lines.push(summary);
    if (lines.length >= 6) break;
  }
  if (!lines.length) {
    lines.push("Blue saved the topic, but it does not have enough notes yet to summarize what was learned.");
  }
  return lines.slice(0, 6);
}

function learningNextSteps(record) {
  const topic = String(record.topic || "").toLowerCase();
  if (/\b(2d|live2d|vtuber|rig|rigging|cubism|model)\b/.test(topic)) {
    return [
      "Collect or create a layered PSD or separated transparent PNG parts on one canvas.",
      "Map parts to Live2D parameters, ArtMeshes, deformers, expressions, physics, and VTube Studio export checks.",
      "Do not call a flat PNG rigged unless real Live2D files or separated parts exist."
    ];
  }
  if (/\bfirewall\b/.test(topic)) {
    return [
      "Define the goal, default policy, allowed apps/ports, logging, and rollback plan before changing rules.",
      "Use approval-gated commands and verify the resulting Windows Firewall profile/rules.",
      "Keep an audit log of every security change."
    ];
  }
  return [
    "Turn the notes into a small plan before editing Project Blue.",
    "Build or test one piece at a time, then save the result as a real artifact."
  ];
}

function detectLearningSummaryRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(what did you find|what you found|what have you found|give me what you found|tell me what you found|tell me about .*found|what did .*learn|what have .*learned|what has .*learned|what is .*learned|what about what i asked|what i asked|that topic|that thing|show .*learned|list .*learned|learning summary|learned summary|summary|sumrry|summry|summery)\b/.test(text)
    || (/\b(what|show|list|tell|give)\b/.test(text) && /\b(learned|learning|learn|found|findings|summary|sumrry|summry|summery)\b/.test(text));
}

function detectLearningSourcesRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(show|list|give|what are)\b.*\b(sources|links|urls|references)\b/.test(text)
    || /\b(source links|research links|saved links)\b/.test(text);
}

function learningQueryTopic(message) {
  let text = normalizeLearningSearchTopic(message).toLowerCase();
  const pointsAtLastTopic = /\b(that|this|it|what i asked|what you searched|what you learned|last topic|that topic|this topic|that thing|the thing)\b/.test(text);
  text = text
    .replace(/\b(can you|please|ok|okay|blue|qwen)\b/g, " ")
    .replace(/\b(give me|tell me|show me|list|what did you|what have you|what you|what has it|what has blue|what has qwen|what is|what about|what i asked|last topic|that topic|this topic|that thing|this thing|about|the|a|an|of|on|for|found|find|learned|learning|learn|summary|sumrry|summry|summery|you|it|that|this|topic|thing|has|have|did)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (pointsAtLastTopic || vagueLearningTopic(text) || text.length < 3) return "";
  return text.slice(0, 160);
}

function learningRecordScore(record, queryTopic) {
  if (!queryTopic) return record.status === "research_collected" ? 2 : 1;
  const haystack = normalizeLearningSearchTopic([
    record.topic,
    record.notes,
    ...(Array.isArray(record.sources) ? record.sources.flatMap(source => [source.title, source.summary]) : [])
  ].join(" ")).toLowerCase();
  const words = queryTopic.split(/\s+/).filter(word => word.length > 2);
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += 2;
  }
  if (haystack.includes(queryTopic)) score += 8;
  if (record.status === "research_collected") score += 3;
  return score;
}

function selectLearningRecordsForMessage(message) {
  const records = readLearningRecords();
  if (!records.length) return [];
  const queryTopic = learningQueryTopic(message);
  if (!queryTopic) {
    const latestResearch = records.find(record => record.status === "research_collected");
    if (latestResearch) return [latestResearch];
  }
  const scored = records
    .map((record, index) => ({ record, index, score: learningRecordScore(record, queryTopic) }))
    .filter(item => !queryTopic || item.score > 0)
    .sort((left, right) => right.score - left.score || right.index - left.index);
  if (queryTopic && scored.length) {
    const bestResearch = scored.find(item => item.record.status === "research_collected");
    if (bestResearch) return [bestResearch.record];
    return scored.slice(0, 3).map(item => item.record);
  }
  return records
    .map((record, index) => ({ record, index }))
    .filter(item => item.record.status === "research_collected")
    .slice(-3)
    .reverse()
    .map(item => item.record);
}

function formatLearningAnswerForMessage(message) {
  const records = selectLearningRecordsForMessage(message);
  if (!records.length) {
    return "I do not have saved learning notes for that yet. Ask me to learn it first, then approve deep search so I can save findings.";
  }
  const topicLine = records.length === 1
    ? `Topic: ${records[0].topic}`
    : `Topics: ${records.map(record => record.topic).join(", ")}`;
  return [
    "Here is the summarized answer from the saved Learning Queue:",
    topicLine,
    "",
    formatLearningSummaryOnly(records),
    "",
    "Sources are saved in the Learning Queue, but I will not read or dump the links unless you ask for sources."
  ].join("\n");
}

function formatLearningSourcesForMessage(message) {
  const records = selectLearningRecordsForMessage(message);
  if (!records.length) return "I do not have saved sources for that yet.";
  return formatLearningRecords(records);
}

function formatLearningSummaryOnly(records) {
  return records.map(record => [
    `What I learned about ${record.topic}:`,
    ...learningSummaryLines(record).map(line => `- ${line}`),
    "",
    "Useful next steps:",
    ...learningNextSteps(record).map(line => `- ${line}`),
    `Research depth: ${record.pagesRead || 0} readable webpage(s) summarized, ${Array.isArray(record.sources) ? record.sources.length : 0} source(s) saved.`
  ].join("\n")).join("\n\n");
}

function formatLearningRecords(records = readLearningRecords()) {
  if (!records.length) return "No learning requests yet.";
  return records.map(record => {
    const sources = Array.isArray(record.sources) ? record.sources : [];
    return [
      `${record.createdAt} [${record.assistantName}] ${record.status}: ${record.topic}`,
      `Readable webpages summarized: ${record.pagesRead || 0}`,
      "Summary:",
      ...learningSummaryLines(record).map(line => `  - ${line}`),
      "Next steps:",
      ...learningNextSteps(record).map(line => `  - ${line}`),
      sources.length
        ? `Sources saved (${sources.length}):\n${sources.slice(0, 8).map(source => `  - ${source.type === "video" ? "[video] " : ""}${source.title}: ${source.url}`).join("\n")}${sources.length > 8 ? `\n  - ...and ${sources.length - 8} more saved source(s).` : ""}`
        : "Sources saved: none yet."
    ].join("\n");
  }).join("\n\n");
}

function detectSelfLearningToggleRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  if (!/\b(self learn|self-learning|learn by yourself|learn on your own|things you need to know|what you need to learn)\b/.test(text)) return "";
  if (/\b(turn on|enable|start|yes|allow|can it|can you)\b/.test(text)) return "enable";
  if (/\b(turn off|disable|stop|no)\b/.test(text)) return "disable";
  return "status";
}

function detectSelfLearningSuggestionRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(what should you learn|what do you need to learn|suggest.*learn|self learn|self-learning|learn things you may need)\b/.test(text);
}

function selfLearningSuggestionTopics() {
  const records = readLearningRecords();
  const learnedText = records.map(record => `${record.topic} ${record.notes}`).join(" ").toLowerCase();
  const suggestions = [
    {
      topic: "General-purpose desktop assistant task planning and memory",
      reason: "Project Blue is meant to help across many task types, not just VTuber modeling.",
      trigger: true
    },
    {
      topic: "Reliable web research workflow with source reading and summaries",
      reason: "Project Blue needs to learn from webpages, compare sources, and save useful notes for later.",
      trigger: true
    },
    {
      topic: "Windows 11 troubleshooting and repair workflow",
      reason: "Project Blue should be able to help diagnose PC issues before changing settings.",
      trigger: true
    },
    {
      topic: "Live2D Cubism layered PSD to model3 export workflow",
      reason: "Project Blue is trying to create and prepare 2D VTuber outfits and rigs.",
      trigger: /\b(live2d|2d|rig|vtuber|model|outfit|psd|cmo3)\b/.test(learnedText)
    },
    {
      topic: "OpenAI image edit reference image workflow for VTuber outfit concepts",
      reason: "Project Blue uses base and outfit reference images for outfit previews.",
      trigger: /\b(outfit|image|reference|png|vtuber)\b/.test(learnedText)
    },
    {
      topic: "VTube Studio model files motions expressions and API basics",
      reason: "Project Blue needs to understand 2D model files, motions, expressions, and VTube Studio behavior.",
      trigger: /\b(vtube|vts|live2d|motion|expression|model3)\b/.test(learnedText)
    },
    {
      topic: "Android companion app local network approval queue security",
      reason: "Project Blue has a phone bridge and needs safe approval flows.",
      trigger: /\b(phone|android|bridge|approval|token|network)\b/.test(learnedText)
    },
    {
      topic: "LAN browser companion for trusted network PCs with microphone opt-in",
      reason: "Project Blue can be used from other trusted PCs through the network bridge.",
      trigger: /\b(network|lan|bridge|phone|browser|microphone|voice|other pc)\b/.test(learnedText)
    },
    {
      topic: "Windows safe automation with approval gates and audit logs",
      reason: "Project Blue runs on Windows and needs safe file/app/task automation.",
      trigger: /\b(pc|windows|automation|approval|full control|file|app)\b/.test(learnedText)
    },
    {
      topic: "Discord and Twitch moderation automation safety",
      reason: "Project Blue is meant to help manage Discord and Twitch without unsafe account or moderation actions.",
      trigger: /\b(discord|twitch|moderation|server|chat|stream|guild|role)\b/.test(learnedText)
    },
    {
      topic: "Blender automation basics for creating models and renders",
      reason: "Project Blue may need to use Blender to make or preview 3D assets.",
      trigger: /\b(blender|3d|model|render|outfit|avatar|vroid|vrm)\b/.test(learnedText)
    },
    {
      topic: "OpenAI voice image and tool calling patterns for desktop assistants",
      reason: "Project Blue uses OpenAI for chat, voice, images, and tool-guided work.",
      trigger: /\b(openai|voice|image|chat|assistant|tool|api)\b/.test(learnedText)
    }
  ];
  const existingTopics = new Set(records.map(record => normalizeLearningSearchTopic(record.topic).toLowerCase()));
  return suggestions
    .filter(item => item.trigger || !records.length)
    .filter(item => !existingTopics.has(normalizeLearningSearchTopic(item.topic).toLowerCase()))
    .slice(0, 5);
}

function saveSelfLearningSuggestions(sourceMessage = "") {
  if (!autonomySettings.selfLearningSuggestions) {
    return "Self-learning suggestions are off. Say 'turn on self learning' or enable it in Away Rules first.";
  }
  const suggestions = selfLearningSuggestionTopics();
  if (!suggestions.length) {
    return "I do not see any new self-learning topics to add right now. The current Learning Queue already covers the obvious gaps I can detect.";
  }
  const records = suggestions.map(item => appendLearningRecord(
    item.topic,
    "self_suggestion",
    [
      `Blue suggested this because: ${item.reason}`,
      sourceMessage ? `User context: ${compactResearchText(sourceMessage, 500)}` : "",
      "This is a suggestion only. Deep research requires approval."
    ].filter(Boolean).join("\n"),
    { status: "suggested_learning" }
  ));
  for (const record of records) {
    if (autonomySettings.phoneApprovalQueue && autonomySettings.askBeforeDeepResearch) {
      appendPhoneApprovalRequest({
        kind: "deep_research",
        summary: `Start deep research for suggested topic: ${record.topic}`,
        target: record.topic,
        risk: "medium",
        details: "Blue suggested this learning topic. Approving starts online research and saves findings to the Learning Queue."
      });
    }
  }
  return [
    `I saved ${records.length} self-learning suggestion(s).`,
    ...records.map(record => `- ${record.topic}`),
    autonomySettings.askBeforeDeepResearch
      ? "I did not start deep research yet. It is queued for approval."
    : "Deep research is allowed by settings, but these are still saved as suggestions first."
  ].join("\n");
}

function detectSelfImprovementRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(self improve|self-improve|improve yourself|fix yourself|fix it self|fix itself|make yourself better|make it self better|make itself better|upgrade yourself|upgrade itself|better itself|better your self|better yourself)\b/.test(text)
    || (/\b(ai|blue|qwen|it|itself|yourself)\b/.test(text) && /\b(fix|improve|upgrade|repair)\b/.test(text) && /\b(self|itself|yourself|own code|own behavior)\b/.test(text));
}

function selfImprovementFindings() {
  const activities = readActivity(activityLedgerPath, 80);
  const learning = readLearningRecords().slice(-12);
  const findings = [];
  const add = (title, reason, fix, risk = "low") => {
    if (!findings.some(item => item.title === title)) findings.push({ title, reason, fix, risk });
  };
  if (activities.some(item => /fallback|failed|unavailable|unreadable|could not/i.test(`${item.summary || ""} ${JSON.stringify(item.details || {})}`))) {
    add(
      "Improve failure recovery and user-facing explanations",
      "Recent activity includes fallback, failure, or unavailable states.",
      "Add more direct fallback messages, artifact existence checks, and saved next-step proposals when a provider or file operation fails.",
      "low"
    );
  }
  if (learning.some(record => record.status === "research_collected" && !record.pagesRead)) {
    add(
      "Improve deep research quality",
      "Some research records have saved links but no readable webpages summarized.",
      "Prefer sources with readable pages, keep page-read counts, and ask for a better query when a topic only returns video/search links.",
      "low"
    );
  }
  if (learning.some(record => /\b(2d|live2d|model|outfit|psd|cmo3)\b/i.test(record.topic))) {
    add(
      "Improve VTuber asset workflow honesty",
      "The project often works with 2D/3D models and generated outfits, where fake artifact claims caused confusion before.",
      "Require real file checks before claiming PNG/PSD/CMO3/model outputs and keep base/outfit references separate.",
      "low"
    );
  }
  if (activities.some(item => /renderer recovery|restarted|unresponsive/i.test(item.summary || ""))) {
    add(
      "Improve app stability monitoring",
      "The activity log includes renderer recovery or restart events.",
      "Save a stability diagnostic note with process counts, renderer recovery counts, and likely UI bottlenecks before making UI changes.",
      "medium"
    );
  }
  if (!findings.length) {
    add(
      "Create a self-improvement checklist",
      "No obvious recent failure pattern was found, but Blue can still improve its planning, verification, and learning loops.",
      "Add a recurring checklist: verify artifacts, summarize learned notes, read webpages during research, and queue approval for risky actions.",
      "low"
    );
  }
  return findings.slice(0, 6);
}

function createSelfImprovementProposal(sourceMessage = "") {
  const findings = selfImprovementFindings();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const planPath = path.join(artifactDirectory, `self-improvement-proposal-${stamp}.md`);
  const content = [
    "# Project Blue Self-Improvement Proposal",
    "",
    `Created: ${new Date().toISOString()}`,
    sourceMessage ? `User request: ${compactResearchText(sourceMessage, 700)}` : "",
    "",
    "## Rule",
    "Blue can notice weak behavior and prepare improvements, but it must not silently rewrite itself. Code changes need normal editing, checks, and restart.",
    "",
    "## Findings",
    ...findings.flatMap((item, index) => [
      `${index + 1}. ${item.title}`,
      `   - Reason: ${item.reason}`,
      `   - Fix plan: ${item.fix}`,
      `   - Risk: ${item.risk}`
    ]),
    "",
    "## Next Safe Actions",
    "- Save these findings in the Learning Queue.",
    "- If a fix needs research, ask before deep search.",
    "- If a fix needs code, make scoped edits, run checks, then restart Blue.",
    "- Never apply security, credential, account, install, or destructive changes unattended."
  ].filter(Boolean).join("\n");
  fs.writeFileSync(planPath, content, "utf8");
  rememberArtifact({
    path: planPath,
    title: "Project Blue self-improvement proposal",
    kind: "file",
    source: "self_improvement",
    note: "Self-improvement proposal based on recent activity and learning records."
  });
  const record = appendLearningRecord(
    "Project Blue self-improvement backlog",
    "self_improvement",
    findings.map(item => `${item.title}: ${item.fix}`).join("\n"),
    { status: "suggested_improvement" }
  );
  if (autonomySettings.phoneApprovalQueue) {
    appendPhoneApprovalRequest({
      kind: "self_improvement",
      summary: "Review Project Blue self-improvement proposal",
      target: planPath,
      risk: findings.some(item => item.risk !== "low") ? "medium" : "low",
      details: "Blue found possible improvements in its own behavior. Approving lets a future code pass implement scoped fixes with checks and restart."
    });
  }
  appendActivity(activityLedgerPath, "self_improvement", "Self-improvement proposal created", {
    planPath,
    findingCount: findings.length,
    learningRecordId: record.id
  });
  return [
    "I created a self-improvement proposal for Project Blue.",
    `Plan: ${planPath}`,
    `Learning record: ${record.id}`,
    "",
    ...findings.map(item => `- ${item.title}: ${item.fix}`),
    "",
    "I will not silently rewrite myself. A code fix still needs scoped edits, checks, and restart."
  ].join("\n");
}

function maybeCreateSelfImprovementProposal(reason) {
  if (!autonomySettings.selfImprovementProposals) return null;
  const state = loadJson(selfImprovementStatePath, {});
  const lastAt = Date.parse(state.lastProposalAt || "");
  if (Number.isFinite(lastAt) && Date.now() - lastAt < 6 * 60 * 60 * 1000) return null;
  saveJsonAtomic(selfImprovementStatePath, {
    lastProposalAt: new Date().toISOString(),
    reason: String(reason || "").slice(0, 500)
  });
  return createSelfImprovementProposal(reason);
}

function normalizeAgentState(value) {
  if (!value || typeof value !== "object") return null;
  const goal = String(value.goal || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!goal) return null;
  return {
    id: String(value.id || crypto.randomUUID()).slice(0, 80),
    createdAt: String(value.createdAt || new Date().toISOString()).slice(0, 80),
    updatedAt: String(value.updatedAt || new Date().toISOString()).slice(0, 80),
    status: ["planning", "waiting_approval", "researching", "ready", "blocked", "complete"].includes(value.status)
      ? value.status
      : "planning",
    goal,
    mode: String(value.mode || "guided_agent").slice(0, 80),
    risk: String(value.risk || "medium").slice(0, 40),
    summary: String(value.summary || "").slice(0, 1000),
    planPath: String(value.planPath || "").slice(0, 2000),
    currentStep: Math.max(0, Math.min(Number(value.currentStep || 0), 100)),
    decisionEngine: String(value.decisionEngine || "guided").slice(0, 80),
    decisionLog: Array.isArray(value.decisionLog)
      ? value.decisionLog.slice(-12).map(item => ({
        at: String(item.at || new Date().toISOString()).slice(0, 80),
        engine: String(item.engine || "minimax").slice(0, 40),
        selectedStepId: String(item.selectedStepId || "").slice(0, 40),
        selectedTitle: String(item.selectedTitle || "").slice(0, 160),
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
        reason: String(item.reason || "").slice(0, 500)
      }))
      : [],
    steps: Array.isArray(value.steps)
      ? value.steps.slice(0, 20).map((step, index) => ({
        id: String(step.id || `step-${index + 1}`).slice(0, 40),
        title: String(step.title || `Step ${index + 1}`).replace(/\s+/g, " ").trim().slice(0, 160),
        status: ["pending", "in_progress", "waiting_approval", "done", "blocked"].includes(step.status)
          ? step.status
          : "pending",
        details: String(step.details || "").slice(0, 1000),
        tool: String(step.tool || "").slice(0, 80)
      }))
      : []
  };
}

function saveAgentState(value) {
  agentState = normalizeAgentState({
    ...value,
    updatedAt: new Date().toISOString()
  });
  if (agentState) saveJsonAtomic(agentStatePath, agentState);
  return agentState;
}

function agentRiskForGoal(goal) {
  const text = String(goal || "").toLowerCase();
  if (highRiskActionHint("agent_goal", goal, "")) return "high";
  if (/\b(download|install|run|execute|blender|discord|twitch|bot|api|pc|windows|fix|repair|file|folder|edit)\b/.test(text)) return "medium";
  return "low";
}

function agentStepsForGoal(goal) {
  const text = String(goal || "").toLowerCase();
  const steps = [
    {
      title: "Understand the goal",
      details: "Restate the target, constraints, required files/accounts/apps, and what done should look like.",
      tool: "chat"
    }
  ];
  if (/\b(learn|research|find|web|how to|fix|repair|troubleshoot|discord|twitch|blender|live2d|openai|api)\b/.test(text)) {
    steps.push({
      title: "Research what is needed",
      details: "Use deep research, read webpages where possible, and save findings to the Learning Queue before making claims.",
      tool: "deep_research"
    });
  }
  if (/\b(file|folder|code|app|project|model|png|psd|blend|vrm|live2d|desktop|pc)\b/.test(text)) {
    steps.push({
      title: "Inspect local context",
      details: "Use explicitly shared files, project folders, or current artifacts. Do not guess about files that were not provided.",
      tool: "shared_files"
    });
  }
  steps.push({
    title: "Make a safe execution plan",
    details: "Choose the next visible action, identify risks, and decide which existing Project Blue module should perform it.",
    tool: "agent_planner"
  });
  if (agentRiskForGoal(goal) !== "low") {
    steps.push({
      title: "Ask for approval when needed",
      details: "Queue approval before downloads, installs, security changes, account actions, file writes, or app automation.",
      tool: "approval_queue"
    });
  }
  steps.push(
    {
      title: "Run the allowed next action",
      details: "Use only bounded Project Blue capabilities such as learning research, artifact creation, PC Action, or app helpers.",
      tool: "guarded_action"
    },
    {
      title: "Verify and report",
      details: "Check whether the artifact, file, setting, or answer really exists. Report exact paths, tests, and any remaining blockers.",
      tool: "verification"
    }
  );
  return steps.map((step, index) => ({
    id: `step-${index + 1}`,
    status: index === 0 ? "in_progress" : "pending",
    ...step
  }));
}

function buildAgentPlanMarkdown(state) {
  return [
    `# Project Blue Agent Plan`,
    "",
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    `Risk: ${state.risk}`,
    `Created: ${state.createdAt}`,
    "",
    "## Agent Rules",
    "- Plan first, then act through Project Blue's existing tools.",
    "- Deep research reads webpages where possible and saves notes before claiming findings.",
    "- Downloads, installs, account actions, security changes, deletes, registry/startup edits, and file writes require approval.",
    "- The agent must verify real files/artifacts before saying something is done.",
    "",
    state.decisionLog?.length ? "## MiniMax Decisions" : "",
    ...(state.decisionLog || []).map(item => [
      `- ${item.at}: ${item.selectedTitle}`,
      `  - Score: ${item.score}`,
      `  - ${item.reason}`
    ].join("\n")),
    state.decisionLog?.length ? "" : "",
    "## Steps",
    ...state.steps.map((step, index) => [
      `${index + 1}. [${step.status}] ${step.title}`,
      `   - Tool: ${step.tool || "none"}`,
      `   - ${step.details}`
    ].join("\n"))
  ].join("\n");
}

function minimaxScoreAgentStep(step, state) {
  const status = String(step.status || "pending");
  const tool = String(step.tool || "");
  const goalRisk = String(state.risk || "medium");
  const donePenalty = status === "done" ? 100 : 0;
  const blockedPenalty = status === "blocked" ? 80 : 0;
  const progress = status === "in_progress" ? 36
    : tool === "deep_research" ? 32
      : tool === "shared_files" ? 28
        : tool === "agent_planner" ? 26
          : tool === "verification" ? 24
            : 20;
  const riskPenalty = tool === "approval_queue" ? 12
    : tool === "guarded_action" && goalRisk === "high" ? 34
      : tool === "guarded_action" ? 20
        : tool === "deep_research" ? 8
          : 4;
  const costPenalty = tool === "deep_research" ? 10
    : tool === "shared_files" ? 6
      : tool === "verification" ? 5
        : 3;
  const approvalBonus = tool === "approval_queue" && goalRisk !== "low" ? 20 : 0;
  const score = progress + approvalBonus - riskPenalty - costPenalty - donePenalty - blockedPenalty;
  return {
    stepId: step.id,
    title: step.title,
    score,
    progress,
    riskPenalty,
    costPenalty,
    reason: `Maximize progress (${progress}) while minimizing risk (${riskPenalty}) and cost (${costPenalty}).${approvalBonus ? " Approval is needed before risky work." : ""}`
  };
}

function runMiniMaxAgentDecision() {
  if (!agentState) throw new Error("No active agent plan. Start an agent plan first.");
  const candidates = agentState.steps
    .filter(step => !["done", "blocked"].includes(step.status))
    .map(step => minimaxScoreAgentStep(step, agentState))
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) {
    agentState = saveAgentState({
      ...agentState,
      status: "complete",
      summary: "MiniMax agent found no remaining actionable steps."
    });
    return agentState;
  }
  const selected = candidates[0];
  const updatedSteps = agentState.steps.map(step => ({
    ...step,
    status: step.id === selected.stepId
      ? "in_progress"
      : step.status === "in_progress"
        ? "pending"
        : step.status
  }));
  const decision = {
    at: new Date().toISOString(),
    engine: "minimax",
    selectedStepId: selected.stepId,
    selectedTitle: selected.title,
    score: selected.score,
    reason: selected.reason
  };
  const nextState = saveAgentState({
    ...agentState,
    status: selected.title.toLowerCase().includes("approval") ? "waiting_approval" : "planning",
    decisionEngine: "minimax",
    currentStep: Math.max(0, updatedSteps.findIndex(step => step.id === selected.stepId)),
    steps: updatedSteps,
    decisionLog: [...(agentState.decisionLog || []), decision],
    summary: `MiniMax selected next step: ${selected.title}`
  });
  if (nextState.planPath) fs.writeFileSync(nextState.planPath, buildAgentPlanMarkdown(nextState), "utf8");
  appendActivity(activityLedgerPath, "agent", "MiniMax agent decision selected", {
    goal: nextState.goal,
    selectedStepId: selected.stepId,
    selectedTitle: selected.title,
    score: selected.score
  });
  if (autonomySettings.phoneApprovalQueue && nextState.status === "waiting_approval") {
    appendPhoneApprovalRequest({
      kind: "agent_next_step",
      summary: `MiniMax agent selected: ${selected.title}`,
      target: nextState.goal,
      risk: nextState.risk,
      details: selected.reason
    });
  }
  return nextState;
}

function detectAgentRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(ai agent|agent mode|use an agent|run an agent|make an agent|put .*agent|agent in the ai|agentic)\b/.test(text);
}

function detectMiniMaxAgentRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(mini max|minimax|mini-max)\b.*\b(agent|ai|decision|choose|next step)\b/.test(text)
    || /\b(agent|ai)\b.*\b(mini max|minimax|mini-max)\b/.test(text);
}

function agentGoalFromMessage(message) {
  return normalizeLearningSearchTopic(message)
    .replace(/\b(can you|please|also|put in|add|make|create|turn on|enable|use|run)\b/gi, " ")
    .replace(/\b(ai agent|agent mode|agent in the ai|agent|inside the ai|in the ai)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "Build a guided Project Blue agent mode";
}

function createAgentPlan(goal, source = "chat") {
  const cleanGoal = normalizeLearningSearchTopic(goal).slice(0, 500) || "Guided Project Blue agent task";
  const state = saveAgentState({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "planning",
    goal: cleanGoal,
    risk: agentRiskForGoal(cleanGoal),
    summary: "Guided agent plan created. The agent can plan, research, queue approvals, and route work through existing safe tools.",
    steps: agentStepsForGoal(cleanGoal)
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const planPath = path.join(artifactDirectory, `agent-plan-${stamp}.md`);
  state.planPath = planPath;
  fs.writeFileSync(planPath, buildAgentPlanMarkdown(state), "utf8");
  saveAgentState(state);
  rememberArtifact({
    path: planPath,
    title: "Project Blue agent plan",
    kind: "file",
    source: "agent_mode",
    note: cleanGoal
  });
  appendActivity(activityLedgerPath, "agent", "Agent plan created", {
    source,
    goal: cleanGoal,
    risk: state.risk,
    stepCount: state.steps.length
  });
  if (autonomySettings.phoneApprovalQueue && state.steps.some(step => step.tool === "deep_research")) {
    appendPhoneApprovalRequest({
      kind: "agent_deep_research",
      summary: `Agent wants to deep research: ${cleanGoal}`,
      target: cleanGoal,
      risk: "medium",
      details: "Approving lets the guided agent run deep research, read webpages where possible, and save findings to the Learning Queue."
    });
  }
  return state;
}

function formatAgentState(state = agentState) {
  if (!state) return "No active Project Blue agent plan yet. Say 'start agent mode for ...' to create one.";
  return [
    `Agent mode: ${state.status}`,
    `Decision engine: ${state.decisionEngine || "guided"}`,
    `Goal: ${state.goal}`,
    `Risk: ${state.risk}`,
    state.planPath ? `Plan: ${state.planPath}` : "",
    state.decisionLog?.length
      ? `Last MiniMax choice: ${state.decisionLog.at(-1).selectedTitle} (score ${state.decisionLog.at(-1).score})`
      : "",
    "",
    ...state.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.title} - ${step.details}`)
  ].filter(Boolean).join("\n");
}

function artifactKindForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(extension)) return "image";
  if ([".vrm", ".glb", ".gltf", ".fbx", ".obj"].includes(extension)) return "3d_model";
  if ([".model3.json", ".moc3"].includes(extension) || filePath.toLowerCase().includes(".model3.")) return "2d_model";
  if ([".html", ".htm"].includes(extension)) return "app_preview";
  if ([".exe", ".cmd", ".bat", ".ps1"].includes(extension)) return "app";
  return "file";
}

function normalizeArtifactDescriptor(value) {
  if (!value || typeof value !== "object") return null;
  const filePath = String(value.path || "").trim();
  if (!filePath || filePath.includes("\0")) return null;
  const resolved = path.resolve(filePath);
  return {
    path: resolved,
    title: String(value.title || path.basename(resolved)).slice(0, 160),
    kind: String(value.kind || artifactKindForPath(resolved)).slice(0, 40),
    createdAt: String(value.createdAt || new Date().toISOString()).slice(0, 80),
    source: String(value.source || "Project Blue").slice(0, 80),
    note: String(value.note || "").slice(0, 500)
  };
}

function verifyCreatedPath(filePath, label = "generated result", options = {}) {
  const resolved = path.resolve(String(filePath || ""));
  if (!resolved || resolved.includes("\0")) {
    throw new Error(`${label} failed: invalid output path.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} failed: expected path was not created: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (options.directory && !stat.isDirectory()) {
    throw new Error(`${label} failed: expected a folder but found a file: ${resolved}`);
  }
  if (options.file && !stat.isFile()) {
    throw new Error(`${label} failed: expected a file but found a folder: ${resolved}`);
  }
  if (options.nonEmptyFile && stat.isFile() && stat.size <= 0) {
    throw new Error(`${label} failed: file is empty: ${resolved}`);
  }
  return resolved;
}

function verifyCreatedPaths(paths, label = "generated result") {
  for (const item of paths) {
    if (typeof item === "string") verifyCreatedPath(item, label);
    else verifyCreatedPath(item.path, item.label || label, item.options || {});
  }
}

function artifactFailureReply(task, error) {
  const reason = String(error?.message || error || "Unknown error").replace(/\s+/g, " ").trim();
  appendActivity(activityLedgerPath, "artifact", `${task} failed`, {
    reason: reason.slice(0, 300)
  });
  return [
    `Failed to create ${task}.`,
    `Reason: ${reason || "Unknown error."}`,
    "I did not save this as Latest Result because the required file or folder was not verified on disk."
  ].join("\n");
}

function rememberArtifact(value) {
  latestArtifact = normalizeArtifactDescriptor({
    ...value,
    createdAt: new Date().toISOString()
  });
  if (!latestArtifact) return null;
  verifyCreatedPath(latestArtifact.path, "Latest Result artifact");
  saveJsonAtomic(artifactStatePath, latestArtifact);
  appendActivity(activityLedgerPath, "system", "Result artifact ready to preview", {
    title: latestArtifact.title,
    kind: latestArtifact.kind,
    path: latestArtifact.path
  });
  return latestArtifact;
}

function artifactPreviewPayload() {
  if (!latestArtifact) return null;
  const payload = {
    ...latestArtifact,
    exists: fs.existsSync(latestArtifact.path),
    isDirectory: false,
    canInlinePreview: false,
    imageDataUrl: ""
  };
  if (!payload.exists) return payload;
  const stat = fs.statSync(latestArtifact.path);
  payload.isDirectory = stat.isDirectory();
  payload.size = stat.isFile() ? stat.size : 0;
  if (stat.isFile() && latestArtifact.kind === "image" && stat.size <= 25 * 1024 * 1024) {
    if (path.extname(latestArtifact.path).toLowerCase() === ".svg") {
      payload.canInlinePreview = true;
      payload.imageDataUrl = `data:image/svg+xml;base64,${fs.readFileSync(latestArtifact.path).toString("base64")}`;
      return payload;
    }
    const image = nativeImage.createFromPath(latestArtifact.path);
    if (!image.isEmpty()) {
      const extension = path.extname(latestArtifact.path).toLowerCase();
      const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
      const data = mime === "image/jpeg" ? image.toJPEG(90) : image.toPNG();
      payload.canInlinePreview = true;
      payload.imageDataUrl = `data:${mime};base64,${data.toString("base64")}`;
      payload.imageSize = image.getSize();
    }
  }
  return payload;
}

function normalizeOutfitReference(value) {
  if (!value || typeof value !== "object") return null;
  const filePath = String(value.path || "").trim();
  if (!filePath || filePath.includes("\0")) return null;
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return null;
  return {
    path: resolved,
    title: String(value.title || path.basename(resolved)).slice(0, 160),
    createdAt: String(value.createdAt || new Date().toISOString()).slice(0, 80),
    source: String(value.source || "shared_image").slice(0, 80),
    note: String(value.note || "").slice(0, 500)
  };
}

function conversationReferenceKey(conversationId = currentConversation) {
  return conversationMemoryKey(conversationId);
}

function conversationReferencePath(conversationId = currentConversation) {
  const digest = crypto
    .createHash("sha256")
    .update(conversationReferenceKey(conversationId))
    .digest("hex")
    .slice(0, 24);
  return path.join(conversationReferenceDirectory, `${digest}.json`);
}

function normalizeConversationReferenceState(value) {
  return {
    base: normalizeOutfitReference(value?.base),
    style: normalizeOutfitReference(value?.style)
  };
}

function outfitReferencesFor(conversationId = currentConversation) {
  const key = conversationReferenceKey(conversationId);
  if (!conversationReferences.has(key)) {
    conversationReferences.set(
      key,
      normalizeConversationReferenceState(loadJson(conversationReferencePath(key), {}))
    );
  }
  return conversationReferences.get(key);
}

function saveOutfitReferencesFor(conversationId = currentConversation, state = outfitReferencesFor(conversationId)) {
  const key = conversationReferenceKey(conversationId);
  conversationReferences.set(key, normalizeConversationReferenceState(state));
  saveJsonAtomic(conversationReferencePath(key), conversationReferences.get(key));
}

function currentOutfitReference() {
  return outfitReferencesFor().base;
}

function currentOutfitStyleReference() {
  return outfitReferencesFor().style;
}

function rememberOutfitReference(value) {
  const reference = normalizeOutfitReference({
    ...value,
    createdAt: new Date().toISOString()
  });
  if (!reference) return null;
  saveOutfitReferencesFor(currentConversation, {
    ...outfitReferencesFor(),
    base: reference
  });
  appendActivity(activityLedgerPath, "sharing", "Outfit reference image selected", {
    conversation: currentConversation,
    path: reference.path,
    title: reference.title
  });
  return reference;
}

function rememberOutfitStyleReference(value) {
  const reference = normalizeOutfitReference({
    ...value,
    createdAt: new Date().toISOString()
  });
  if (!reference) return null;
  saveOutfitReferencesFor(currentConversation, {
    ...outfitReferencesFor(),
    style: reference
  });
  appendActivity(activityLedgerPath, "sharing", "Outfit style reference image selected", {
    conversation: currentConversation,
    path: reference.path,
    title: reference.title
  });
  return reference;
}

function outfitReferenceStatus() {
  const outfitReference = currentOutfitReference();
  const outfitStyleReference = currentOutfitStyleReference();
  const baseExists = outfitReference?.path && fs.existsSync(outfitReference.path);
  const styleExists = outfitStyleReference?.path && fs.existsSync(outfitStyleReference.path);
  return {
    ready: Boolean(baseExists),
    exists: Boolean(baseExists),
    path: outfitReference?.path || "",
    title: outfitReference?.title || "",
    source: outfitReference?.source || "",
    note: outfitReference?.note || "",
    styleReady: Boolean(styleExists),
    styleExists: Boolean(styleExists),
    stylePath: outfitStyleReference?.path || "",
    styleTitle: outfitStyleReference?.title || "",
    styleNote: outfitStyleReference?.note || "",
    message: [
      baseExists
        ? `Base model reference: ${outfitReference.path}`
        : outfitReference?.path
          ? `The base model reference is missing: ${outfitReference.path}`
          : "No base model reference is set. Share or drop a PNG/JPG/WebP screenshot of your current model first.",
      styleExists
        ? `Outfit/style reference: ${outfitStyleReference.path}`
        : outfitStyleReference?.path
          ? `The outfit/style reference is missing: ${outfitStyleReference.path}`
          : "No outfit/style reference is set. Drop a clothing/style photo and say 'use the dropped image as the outfit reference'."
    ].join("\n")
  };
}

function clearOutfitReference() {
  saveOutfitReferencesFor(currentConversation, {
    ...outfitReferencesFor(),
    base: null
  });
  appendActivity(activityLedgerPath, "sharing", "Outfit reference image cleared", {
    conversation: currentConversation
  });
  return outfitReferenceStatus();
}

function clearOutfitStyleReference() {
  saveOutfitReferencesFor(currentConversation, {
    ...outfitReferencesFor(),
    style: null
  });
  appendActivity(activityLedgerPath, "sharing", "Outfit style reference image cleared", {
    conversation: currentConversation
  });
  return outfitReferenceStatus();
}

function useLatestArtifactAsOutfitReference() {
  if (!latestArtifact) throw new Error("No latest result exists to use as a reference.");
  if (latestArtifact.kind !== "image") throw new Error("The latest result is not an image.");
  if (!fs.existsSync(latestArtifact.path)) throw new Error("The latest result file no longer exists.");
  const reference = rememberOutfitReference({
    path: latestArtifact.path,
    title: latestArtifact.title || path.basename(latestArtifact.path),
    source: "latest_artifact",
    note: "Selected from Latest Result."
  });
  return {
    ...outfitReferenceStatus(),
    reference
  };
}

function useLatestArtifactAsOutfitStyleReference() {
  if (!latestArtifact) throw new Error("No latest result exists to use as an outfit/style reference.");
  if (latestArtifact.kind !== "image") throw new Error("The latest result is not an image.");
  if (!fs.existsSync(latestArtifact.path)) throw new Error("The latest result file no longer exists.");
  const reference = rememberOutfitStyleReference({
    path: latestArtifact.path,
    title: latestArtifact.title || path.basename(latestArtifact.path),
    source: "latest_artifact",
    note: "Selected from Latest Result as clothing/style reference."
  });
  return {
    ...outfitReferenceStatus(),
    styleReference: reference
  };
}

function rememberSharedItem(value) {
  const item = {
    path: String(value?.path || "").trim(),
    originalPath: String(value?.originalPath || "").trim(),
    name: String(value?.name || "").slice(0, 160),
    kind: String(value?.kind || "file").slice(0, 40),
    createdAt: new Date().toISOString(),
    note: String(value?.note || "").slice(0, 500)
  };
  if (!item.path) return null;
  const key = conversationMemoryKey();
  const items = recentSharedItemsByConversation.get(key) || [];
  items.push(item);
  recentSharedItemsByConversation.set(key, items.slice(-12));
  return item;
}

function latestSharedImage() {
  return [...(recentSharedItemsByConversation.get(conversationMemoryKey()) || [])]
    .reverse()
    .find(item => item.kind === "image" && fs.existsSync(item.path));
}

function detectUseSharedAsBaseRequest(message) {
  const text = String(message || "").toLowerCase();
  return /\b(use|set|make)\b.*\b(this|that|last|dropped|shared|file|image|png)\b.*\b(base|model|modal|reference|ref)\b/.test(text)
    || /\b(this|that|last|dropped|shared)\b.*\b(is|as)\b.*\b(base|model|modal|reference|ref)\b/.test(text);
}

function detectUseSharedAsOutfitStyleRequest(message) {
  const text = String(message || "").toLowerCase();
  return /\b(use|set|make)\b.*\b(this|that|last|dropped|shared|second|2nd|sed|file|image|photo|png)\b.*\b(outfit|clothing|clothes|style|design|dress|swimsuit|swimsute|reference|ref)\b/.test(text)
    || /\b(this|that|last|dropped|shared|second|2nd|sed)\b.*\b(is|as)\b.*\b(outfit|clothing|clothes|style|design|dress|swimsuit|swimsute)\b/.test(text);
}

function setLatestSharedImageAsReference() {
  const shared = latestSharedImage();
  if (!shared) {
    throw new Error("No recent shared image is available. Drop a PNG/JPG/WebP first.");
  }
  const reference = rememberOutfitReference({
    path: shared.path,
    title: shared.name || path.basename(shared.path),
    source: "recent_shared_image",
    note: "Explicitly selected from the most recent shared image."
  });
  return [
    "Set the most recent shared image as the base outfit/model reference.",
    `Reference: ${reference.path}`,
    "Now you can ask for outfit edits using this base. For Live2D rigging, use a layered PSD or real separated transparent PNG parts."
  ].join(" ");
}

function setLatestSharedImageAsOutfitStyleReference() {
  const shared = latestSharedImage();
  if (!shared) {
    throw new Error("No recent shared image is available. Drop a PNG/JPG/WebP outfit or style photo first.");
  }
  const reference = rememberOutfitStyleReference({
    path: shared.path,
    title: shared.name || path.basename(shared.path),
    source: "recent_shared_image",
    note: "Explicitly selected from the most recent shared image as the outfit/style reference."
  });
  return [
    "Set the most recent shared image as the outfit/style reference.",
    `Outfit/style reference: ${reference.path}`,
    currentOutfitReference()?.path && fs.existsSync(currentOutfitReference().path)
      ? `Base model reference for this chat is still: ${currentOutfitReference().path}`
      : "No base model reference is set yet. Drop your character/model screenshot and say 'use the dropped image as the base reference'.",
    "Now ask me to make an outfit, and I will use the base image for the character plus this second image for the clothing/style."
  ].join(" ");
}

async function openLatestArtifact() {
  if (!latestArtifact) throw new Error("No generated result is ready to show yet.");
  if (!fs.existsSync(latestArtifact.path)) throw new Error("The latest result file no longer exists.");
  const error = await shell.openPath(latestArtifact.path);
  if (error) throw new Error(error);
  appendActivity(activityLedgerPath, "system", "Opened result artifact", {
    path: latestArtifact.path,
    kind: latestArtifact.kind
  });
  return `Opened result: ${latestArtifact.path}`;
}

function revealLatestArtifact() {
  if (!latestArtifact) throw new Error("No generated result is ready to reveal yet.");
  if (!fs.existsSync(latestArtifact.path)) throw new Error("The latest result file no longer exists.");
  shell.showItemInFolder(latestArtifact.path);
  appendActivity(activityLedgerPath, "system", "Revealed result artifact", {
    path: latestArtifact.path,
    kind: latestArtifact.kind
  });
  return `Showing result in folder: ${latestArtifact.path}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detectOutfitPreviewRequest(message) {
  const text = String(message || "").toLowerCase();
  if (/[a-z]:[\\/]/i.test(text)) return false;
  if (/\b(see|load|review|inspect|look at|use).*\b(model|modal|folder|file)\b/.test(text)) return false;
  if (/\b(list|show current|what outfits|available outfits)\b/.test(text)) return false;
  const clothing =
    /\b(outfit|clothes|clothing|costume|look|style|wear|swimsuit|swimsute|swimsuite|bikini|one-piece|beachwear|armor|armour|dress|gown|hoodie|jacket|suit|uniform|shoes|boots|accessor(?:y|ies))\b/.test(text);
  const action =
    /\b(make|create|generate|design|draw|show|preview|visual|see|do|build|give|change|new|want|can you|could you)\b/.test(text);
  return clothing && action;
}

function detectOutfitOptionsRequest(message) {
  const text = String(message || "").toLowerCase();
  if (/[a-z]:[\\/]/i.test(text)) return false;
  if (!/\b(outfit|outfits|clothes|clothing|costume|costumes|look|looks|style|styles|wear)\b/.test(text)) return false;
  return /\b(option|options|ideas|choices|pick|choose|remaining|show me|show|list|give me|view)\b/.test(text)
    || /\boutfit\s*\d+\b/.test(text)
    || /\b(neon dreams|mystic knight)\b/.test(text);
}

function detectMissingArtifactRequest(message) {
  const text = String(message || "").toLowerCase();
  return /\b(can'?t find|cannot find|not there|where is|open|show|preview|latest result|result file|png file|windows can'?t find)\b/.test(text)
    && /\b(file|png|image|outfit|result|preview|path)\b/.test(text);
}

function detectTaskDoneRequest(message) {
  const text = String(message || "").toLowerCase();
  return /\b(is it done|is this done|are you done|done yet|did it finish|finished yet|where.*(psd|cmo3|outfit|files)|where are.*files)\b/.test(text);
}

function detectPsdCmo3OutfitRequest(message) {
  const text = String(message || "").toLowerCase();
  return /\b(psd|cmo3|cmo 3|editable file|photoshop)\b/.test(text)
    && /\b(outfit|clothes|swimsuit|swimsute|swimsuite|vtuber|model|modal|live2d|rig)\b/.test(text);
}

function latestOutfitPartsFolder() {
  try {
    return fs.readdirSync(artifactDirectory, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith("outfit-live2d-parts-"))
      .map(entry => path.join(artifactDirectory, entry.name))
      .filter(folder => fs.existsSync(path.join(folder, "parts-manifest.json")))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0] || "";
  } catch {
    return "";
  }
}

async function replyWithLatestArtifact() {
  const partsFolder = latestOutfitPartsFolder();
  if (!latestArtifact && !partsFolder) {
    return "I do not have a generated result recorded yet. Ask me to make the outfit again and I will save it under Project Blue's .blue\\artifacts folder.";
  }
  const exists = latestArtifact && fs.existsSync(latestArtifact.path);
  if (exists) {
    await openLatestArtifact();
    return [
      "I found the real latest result and opened it.",
      `${fs.statSync(latestArtifact.path).isDirectory() ? "Existing folder" : "Existing file"}: ${latestArtifact.path}`,
      partsFolder ? `Latest rig-ready outfit parts folder: ${partsFolder}` : "",
      "Use System > Latest Result > Show Folder if you want to browse to it."
    ].filter(Boolean).join(" ");
  }
  if (partsFolder) {
    await shell.openPath(partsFolder);
    return [
      "I found the real rig-ready outfit parts folder and opened it.",
      `Existing folder: ${partsFolder}`,
      "I do not have a PSD or CMO3 file unless Project Blue actually writes one. I will not claim those paths unless they exist."
    ].join(" ");
  }
  return [
    "The latest result record points to a file that no longer exists.",
    `Missing file: ${latestArtifact.path}`,
    "Ask me to make the outfit again and I will save a new result in Project Blue's .blue\\artifacts folder."
  ].join(" ");
}

function windowsPathsInText(value) {
  return [...String(value || "").matchAll(/[A-Za-z]:\\[^\r\n`"']+\.(?:png|jpg|jpeg|webp|bmp|svg|psd|cmo3|moc3|json)/gi)]
    .map(match => match[0].trim().replace(/[).,;]+$/g, ""));
}

function sanitizeArtifactClaims(reply) {
  const paths = windowsPathsInText(reply);
  const missing = paths.filter(filePath => !fs.existsSync(filePath));
  if (!missing.length) return reply;
  maybeCreateSelfImprovementProposal(`Blue attempted to mention missing generated path(s): ${missing.slice(0, 3).join(", ")}`);
  const current = latestArtifact && fs.existsSync(latestArtifact.path)
    ? `The real latest generated result is here: ${latestArtifact.path}`
    : "There is no generated result file on disk yet.";
  const partsFolder = latestOutfitPartsFolder();
  return [
    "I need to correct that: I did not create the file path I was about to mention.",
    current,
    partsFolder ? `The real latest rig-ready outfit parts folder is here: ${partsFolder}` : "",
    "I will only give you generated paths after Project Blue has actually written them."
  ].filter(Boolean).join(" ");
}

function detect2DRiggingRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  if (!/\b(rig|rigging|rigg|start rigging|make.*move|make.*2d)\b/.test(text)) return false;
  if (/\b3d|vrm|vroid|blender\b/.test(text) && !/\b2d|live2d|cubism\b/.test(text)) return false;
  return /\b(2d|live2d|cubism|model|modal|outfit|this|it|one|we made|psd|parts|layered|separated)\b/.test(text);
}

function detect2DModelArtRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(make|create|generate|draw|build|set up|setup)\b/.test(text)
    && /\b(2d|live2d|vtuber|modal|model)\b/.test(text)
    && /\b(art|artwork|character|base|psd|layered|layers|separated|riggable|rigged|rig)\b/.test(text);
}

function detectCubismEditorRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(live2d cubism|cubism editor|use cubism|open cubism|rig.*cubism|cubism.*rig|this software|shofwhere|software)\b/.test(text)
    && /\b(rig|rigging|model|modal|live2d|2d|editor|software|use|open)\b/.test(text);
}

function cubismEditorCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    path.join(os.homedir(), "AppData", "Local", "Programs"),
    path.join(os.homedir(), "AppData", "Local"),
    path.join(os.homedir(), "Downloads")
  ].filter(Boolean);
  const direct = [
    "Live2D Cubism Editor.exe",
    "CubismEditor.exe",
    "Cubism Editor.exe"
  ];
  const found = [
    ...roots.flatMap(root => direct.flatMap(name => [
      path.join(root, "Live2D Cubism", name),
      path.join(root, "Live2D Cubism Editor", name),
      path.join(root, "Live2D", "Cubism Editor", name)
    ]))
  ];
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (!fs.existsSync(resolved)) continue;
    const stack = [resolved];
    let scanned = 0;
    while (stack.length && scanned < 2500) {
      scanned += 1;
      const current = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const lower = entry.name.toLowerCase();
        if (entry.isFile() && direct.some(name => name.toLowerCase() === lower)) {
          found.push(fullPath);
        } else if (entry.isDirectory() && /live2d|cubism|editor/i.test(fullPath)) {
          stack.push(fullPath);
        }
      }
    }
  }
  return [...new Set(found)].filter(filePath => fs.existsSync(filePath));
}

function buildCubismHandoffPlan({ planPath, partsWorkspace, partsFolder, rigAsset, referencePath, cubismPath }) {
  return [
    "# Live2D Cubism Editor Handoff",
    "",
    "This package is for opening the real riggable assets in Live2D Cubism Editor. Blue can prepare and open the workspace, but Cubism must create/export the actual .cmo3/.moc3/.model3.json files.",
    "",
    `Cubism Editor: ${cubismPath || "Not found on this PC"}`,
    rigAsset?.path ? `Rigging asset: ${rigAsset.path}` : "",
    partsFolder?.path ? `Existing parts folder: ${partsFolder.path}` : "",
    referencePath ? `Reference image: ${referencePath}` : "",
    `Rigging plan: ${planPath}`,
    `Workspace: ${partsWorkspace}`,
    "",
    "## What Blue Should Do With Cubism",
    "1. Open Live2D Cubism Editor.",
    "2. Import the layered PSD or separated same-canvas PNG parts.",
    "3. Generate or refine ArtMeshes for each meaningful part.",
    "4. Add warp/rotation deformers for head, eyes, brows, mouth, hair, body, arms, outfit, and accessories.",
    "5. Key standard parameters such as Angle X/Y/Z, Eye Blink, Mouth Open, Body Angle, and breathing.",
    "6. Add expressions and physics only after the base deformations are stable.",
    "7. Export .moc3/.model3.json/textures from Cubism.",
    "8. Import the exported model folder into Project Blue and test movement/speech.",
    "",
    "## Guardrail",
    "Do not claim a Cubism project or export exists until the .cmo3, .moc3, or .model3.json file is actually on disk."
  ].filter(Boolean).join("\n");
}

function latestImageReferencePath() {
  const outfitReference = currentOutfitReference();
  if (outfitReference?.path && fs.existsSync(outfitReference.path)) return outfitReference.path;
  return "";
}

function latestLive2DRiggingAsset() {
  const rigExtensions = new Set([".psd", ".moc3"]);
  const shared = [...(recentSharedItemsByConversation.get(conversationMemoryKey()) || [])].reverse().find(item => {
    if (!item?.path || !fs.existsSync(item.path)) return false;
    if (item.kind === "live2d_asset") return true;
    const lower = path.basename(item.path).toLowerCase();
    return lower.endsWith(".model3.json") || rigExtensions.has(path.extname(lower));
  });
  if (shared) return shared;
  return null;
}

function folderLooksLikeLive2DParts(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return false;
  const requiredGroups = ["eyes", "mouth", "hair", "body"];
  const entries = new Set(fs.readdirSync(folderPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name.toLowerCase()));
  if (requiredGroups.some(group => entries.has(group))) return true;
  const pngCount = fs.readdirSync(folderPath, { recursive: true })
    .filter(name => String(name).toLowerCase().endsWith(".png")).length;
  return pngCount >= 8;
}

function latestLive2DPartsFolder() {
  const shared = [...(recentSharedItemsByConversation.get(conversationMemoryKey()) || [])].reverse().find(item =>
    item?.kind === "folder"
    && item.path
    && folderLooksLikeLive2DParts(item.path)
  );
  return shared || null;
}

function build2DRiggingPlan(referencePath) {
  const name = path.basename(referencePath || "current-reference-image");
  return `# Project Blue 2D Rigging Starter

Reference image: ${referencePath || "No reference image selected"}
Created: ${new Date().toISOString()}

## What Blue Can Do Now

This creates a Live2D rigging starter package and checklist. A flat PNG is reference-only and is not treated as riggable artwork. Live2D needs a layered PSD or separated transparent PNG parts with editable layers.

## Source Image

- File: ${name}
- Use as visual reference for part separation, colors, outfit shape, and proportions.

## Needed Art Layers

Use the parts workspace as the target. Add real separated transparent PNG parts or export them from a layered PSD. Each part should use the exact same canvas size as the reference image, so the pieces line up when imported into Live2D Cubism.

- head/head_base.png
- hair/hair_back.png
- hair/hair_side_l.png
- hair/hair_side_r.png
- hair/bangs_front.png
- face/face_base.png
- eyes/eye_l_white.png
- eyes/eye_l_iris.png
- eyes/eye_l_pupil.png
- eyes/eye_l_lid.png
- eyes/eye_l_lashes.png
- eyes/eye_r_white.png
- eyes/eye_r_iris.png
- eyes/eye_r_pupil.png
- eyes/eye_r_lid.png
- eyes/eye_r_lashes.png
- brows/brow_l.png
- brows/brow_r.png
- mouth/mouth_closed.png
- mouth/mouth_open.png
- mouth/upper_lip.png
- mouth/lower_lip.png
- body/neck.png
- body/torso_base.png
- arms/upper_arm_l.png
- arms/lower_arm_l.png
- arms/hand_l.png
- arms/upper_arm_r.png
- arms/lower_arm_r.png
- arms/hand_r.png
- outfit/outfit_top_front.png
- outfit/outfit_top_shadow.png
- outfit/outfit_trim.png
- outfit/outfit_bottom.png
- legs/leg_l.png
- legs/leg_r.png
- accessories/accessory_01.png

## Live2D Rigging Order

1. Prepare a layered PSD or separated transparent PNGs using the parts above.
2. Import into Live2D Cubism Editor.
3. Generate ArtMeshes for every part; manually refine face, mouth, eyes, and high-motion outfit parts.
4. Add warp deformers for head, face, hair groups, torso, clothing groups, and accessories.
5. Add rotation deformers for neck, arms, hands, hair strands, dangling accessories, and body tilt.
6. Create standard parameters: Angle X/Y/Z, Body Angle X/Y/Z, Eye Open L/R, Eye Smile L/R, Eyeball X/Y, Brow L/R, Mouth Open, Mouth Form, Breath, Hair/Accessory physics.
7. Add keyforms for each parameter.
8. Add physics for hair, outfit strings, soft accessories, and any hanging clothing.
9. Export model3.json and test in Project Blue/VTube Studio.

## Starter Parameters

- ParamAngleX: -30 to 30
- ParamAngleY: -30 to 30
- ParamAngleZ: -30 to 30
- ParamBodyAngleX: -10 to 10
- ParamBodyAngleY: -10 to 10
- ParamBodyAngleZ: -10 to 10
- ParamEyeLOpen / ParamEyeROpen: 0 to 1
- ParamEyeBallX / ParamEyeBallY: -1 to 1
- ParamMouthOpenY: 0 to 1
- ParamMouthForm: -1 to 1
- ParamBreath: 0 to 1

## Project Blue Next Build Step

Add a 2D Rigging Studio module that can:

- store a selected reference image
- track required separated parts
- generate a part checklist
- save rigging plans
- open Live2D Cubism/manual links
- import finished model3.json into assets/vtuber_models
- test the model in Project Blue
`;
}

function live2DPartList() {
  return [
    ["head", "head_base.png"],
    ["hair", "hair_back.png"],
    ["hair", "hair_side_l.png"],
    ["hair", "hair_side_r.png"],
    ["hair", "bangs_front.png"],
    ["face", "face_base.png"],
    ["eyes", "eye_l_white.png"],
    ["eyes", "eye_l_iris.png"],
    ["eyes", "eye_l_pupil.png"],
    ["eyes", "eye_l_lid.png"],
    ["eyes", "eye_l_lashes.png"],
    ["eyes", "eye_r_white.png"],
    ["eyes", "eye_r_iris.png"],
    ["eyes", "eye_r_pupil.png"],
    ["eyes", "eye_r_lid.png"],
    ["eyes", "eye_r_lashes.png"],
    ["brows", "brow_l.png"],
    ["brows", "brow_r.png"],
    ["mouth", "mouth_closed.png"],
    ["mouth", "mouth_open.png"],
    ["mouth", "upper_lip.png"],
    ["mouth", "lower_lip.png"],
    ["body", "neck.png"],
    ["body", "torso_base.png"],
    ["arms", "upper_arm_l.png"],
    ["arms", "lower_arm_l.png"],
    ["arms", "hand_l.png"],
    ["arms", "upper_arm_r.png"],
    ["arms", "lower_arm_r.png"],
    ["arms", "hand_r.png"],
    ["outfit", "outfit_top_front.png"],
    ["outfit", "outfit_top_shadow.png"],
    ["outfit", "outfit_trim.png"],
    ["outfit", "outfit_bottom.png"],
    ["legs", "leg_l.png"],
    ["legs", "leg_r.png"],
    ["accessories", "accessory_01.png"]
  ];
}

function create2DPartsWorkspace(baseName, referencePath) {
  const workspace = path.join(artifactDirectory, `${baseName}-parts`);
  fs.mkdirSync(workspace, { recursive: true });
  const parts = live2DPartList().map(([folder, file]) => {
    const directory = path.join(workspace, folder);
    fs.mkdirSync(directory, { recursive: true });
    return {
      group: folder,
      file,
      path: path.join(directory, file),
      status: "needed"
    };
  });
  const checklist = [
    "# Live2D Part Separation Checklist",
    "",
    `Reference image: ${referencePath}`,
    "",
    "Put transparent PNGs into these folders. Keep every PNG on the same canvas size as the reference image.",
    "",
    ...parts.map(part => `- [ ] ${part.group}/${part.file}`)
  ].join("\n");
  fs.writeFileSync(path.join(workspace, "PARTS_CHECKLIST.md"), checklist, "utf8");
  fs.writeFileSync(path.join(workspace, "parts-manifest.json"), JSON.stringify({
    createdAt: new Date().toISOString(),
    referencePath,
    canvasRule: "Every part PNG must use the same canvas size and alignment as the reference image.",
    importTarget: "Live2D Cubism Editor",
    parts
  }, null, 2), "utf8");
  return workspace;
}

function modelArtLayerDrawSpec(file) {
  const specs = {
    "hair_back.png": { type: "ellipse", cx: 450, cy: 210, rx: 150, ry: 165, color: "hair", alpha: 245 },
    "head_base.png": { type: "ellipse", cx: 450, cy: 240, rx: 105, ry: 125, color: "skin", alpha: 255 },
    "face_base.png": { type: "ellipse", cx: 450, cy: 250, rx: 92, ry: 105, color: "skinLight", alpha: 165 },
    "hair_side_l.png": { type: "poly", points: [[350, 185], [405, 220], [390, 470], [320, 520], [325, 310]], color: "hair", alpha: 245 },
    "hair_side_r.png": { type: "poly", points: [[550, 185], [495, 220], [510, 470], [580, 520], [575, 310]], color: "hair", alpha: 245 },
    "bangs_front.png": { type: "poly", points: [[330, 185], [390, 115], [460, 150], [535, 118], [575, 188], [500, 226], [452, 198], [404, 232]], color: "hairDark", alpha: 250 },
    "neck.png": { type: "poly", points: [[420, 340], [480, 340], [494, 430], [406, 430]], color: "skin", alpha: 255 },
    "torso_base.png": { type: "poly", points: [[350, 420], [550, 420], [610, 760], [290, 760]], color: "skin", alpha: 255 },
    "upper_arm_l.png": { type: "line", x1: 330, y1: 440, x2: 245, y2: 585, width: 48, color: "skin", alpha: 255 },
    "lower_arm_l.png": { type: "line", x1: 245, y1: 585, x2: 205, y2: 740, width: 42, color: "skin", alpha: 255 },
    "hand_l.png": { type: "ellipse", cx: 205, cy: 760, rx: 30, ry: 36, color: "skin", alpha: 255 },
    "upper_arm_r.png": { type: "line", x1: 570, y1: 440, x2: 655, y2: 585, width: 48, color: "skin", alpha: 255 },
    "lower_arm_r.png": { type: "line", x1: 655, y1: 585, x2: 695, y2: 740, width: 42, color: "skin", alpha: 255 },
    "hand_r.png": { type: "ellipse", cx: 695, cy: 760, rx: 30, ry: 36, color: "skin", alpha: 255 },
    "leg_l.png": { type: "line", x1: 395, y1: 740, x2: 360, y2: 1010, width: 58, color: "skin", alpha: 255 },
    "leg_r.png": { type: "line", x1: 505, y1: 740, x2: 540, y2: 1010, width: 58, color: "skin", alpha: 255 },
    "eye_l_white.png": { type: "ellipse", cx: 410, cy: 250, rx: 28, ry: 16, color: "white", alpha: 255 },
    "eye_r_white.png": { type: "ellipse", cx: 490, cy: 250, rx: 28, ry: 16, color: "white", alpha: 255 },
    "eye_l_iris.png": { type: "ellipse", cx: 410, cy: 252, rx: 12, ry: 14, color: "accent", alpha: 255 },
    "eye_r_iris.png": { type: "ellipse", cx: 490, cy: 252, rx: 12, ry: 14, color: "accent", alpha: 255 },
    "eye_l_pupil.png": { type: "ellipse", cx: 410, cy: 253, rx: 6, ry: 8, color: "black", alpha: 255 },
    "eye_r_pupil.png": { type: "ellipse", cx: 490, cy: 253, rx: 6, ry: 8, color: "black", alpha: 255 },
    "eye_l_lid.png": { type: "line", x1: 382, y1: 235, x2: 438, y2: 235, width: 7, color: "line", alpha: 230 },
    "eye_r_lid.png": { type: "line", x1: 462, y1: 235, x2: 518, y2: 235, width: 7, color: "line", alpha: 230 },
    "eye_l_lashes.png": { type: "line", x1: 380, y1: 242, x2: 438, y2: 242, width: 5, color: "line", alpha: 255 },
    "eye_r_lashes.png": { type: "line", x1: 462, y1: 242, x2: 520, y2: 242, width: 5, color: "line", alpha: 255 },
    "brow_l.png": { type: "line", x1: 382, y1: 210, x2: 436, y2: 202, width: 8, color: "hairDark", alpha: 255 },
    "brow_r.png": { type: "line", x1: 464, y1: 202, x2: 518, y2: 210, width: 8, color: "hairDark", alpha: 255 },
    "mouth_closed.png": { type: "line", x1: 425, y1: 305, x2: 475, y2: 305, width: 7, color: "mouth", alpha: 255 },
    "mouth_open.png": { type: "ellipse", cx: 450, cy: 312, rx: 18, ry: 22, color: "mouth", alpha: 210 },
    "upper_lip.png": { type: "line", x1: 428, y1: 300, x2: 472, y2: 300, width: 4, color: "mouthLight", alpha: 255 },
    "lower_lip.png": { type: "line", x1: 432, y1: 326, x2: 468, y2: 326, width: 4, color: "mouthLight", alpha: 255 },
    "outfit_top_front.png": { type: "poly", points: [[350, 420], [550, 420], [585, 610], [315, 610]], color: "primary", alpha: 240 },
    "outfit_top_shadow.png": { type: "poly", points: [[405, 430], [495, 430], [510, 600], [390, 600]], color: "dark", alpha: 170 },
    "outfit_trim.png": { type: "line", x1: 340, y1: 425, x2: 560, y2: 425, width: 14, color: "accent", alpha: 255 },
    "outfit_bottom.png": { type: "poly", points: [[315, 610], [585, 610], [625, 770], [275, 770]], color: "secondary", alpha: 235 },
    "accessory_01.png": { type: "poly", points: [[420, 100], [450, 60], [480, 100], [462, 128], [438, 128]], color: "accent", alpha: 255 }
  };
  return specs[file] || null;
}

function buildModelArtLayerPng(file, message, width = 900, height = 1100) {
  const [primary, secondary, dark, accent] = outfitPaletteFromPrompt(message);
  const colors = {
    primary: parseHexColor(primary, 245),
    secondary: parseHexColor(secondary, 240),
    dark: parseHexColor(dark, 225),
    accent: parseHexColor(accent, 255),
    skin: [244, 190, 165, 255],
    skinLight: [255, 219, 202, 180],
    hair: /\b(blonde|yellow|gold)\b/i.test(message) ? [232, 197, 92, 245] : /\b(white|silver)\b/i.test(message) ? [220, 230, 238, 245] : [55, 70, 105, 245],
    hairDark: /\b(blonde|yellow|gold)\b/i.test(message) ? [178, 126, 48, 250] : /\b(white|silver)\b/i.test(message) ? [155, 175, 190, 250] : [22, 32, 58, 250],
    white: [248, 252, 255, 255],
    black: [8, 12, 20, 255],
    line: [13, 20, 32, 255],
    mouth: [116, 36, 55, 255],
    mouthLight: [232, 115, 139, 255]
  };
  const rgba = Buffer.alloc(width * height * 4);
  const spec = modelArtLayerDrawSpec(file);
  if (!spec) return encodeRgbaPng(width, height, rgba);
  const color = [...(colors[spec.color] || colors.primary)];
  color[3] = spec.alpha ?? color[3];
  if (spec.type === "ellipse") fillEllipse(rgba, width, height, spec.cx, spec.cy, spec.rx, spec.ry, color);
  if (spec.type === "poly") fillPolygon(rgba, width, height, spec.points, color);
  if (spec.type === "line") drawLine(rgba, width, height, spec.x1, spec.y1, spec.x2, spec.y2, spec.width, color);
  return encodeRgbaPng(width, height, rgba);
}

function photoshopLayerAssemblerScript(layerOrder) {
  const scriptLines = [
    "#target photoshop",
    "app.displayDialogs = DialogModes.NO;",
    "var root = File($.fileName).parent;",
    "var doc = app.documents.add(900, 1100, 72, 'Project Blue Live2D Model Art', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);",
    "function placeLayer(relativePath, layerName) {",
    "  var file = File(root.fsName + '/' + relativePath.replace(/\\\\/g, '/'));",
    "  if (!file.exists) return;",
    "  app.open(file);",
    "  var source = app.activeDocument;",
    "  source.activeLayer.name = layerName;",
    "  source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);",
    "  source.close(SaveOptions.DONOTSAVECHANGES);",
    "}",
    ...layerOrder.map(layer => `placeLayer(${JSON.stringify(`${layer.group}/${layer.file}`)}, ${JSON.stringify(layer.file.replace(/\.png$/i, ""))});`),
    "var psdFile = File(root.fsName + '/project-blue-live2d-model-art.psd');",
    "var options = new PhotoshopSaveOptions();",
    "options.layers = true;",
    "doc.saveAs(psdFile, options, true, Extension.LOWERCASE);"
  ];
  return scriptLines.join("\n");
}

function create2DModelArtKit(message) {
  const assistantName = assistantNameForModel();
  const outfitTag = matureOutfitTagForMessage(message);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = path.join(artifactDirectory, `live2d-model-art-${assistantName}-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });
  const layerOrder = live2DPartList().map(([group, file], index) => {
    const directory = path.join(folder, group);
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, file);
    fs.writeFileSync(filePath, buildModelArtLayerPng(file, message));
    return {
      index,
      group,
      file,
      path: filePath,
      canvas: "900x1100",
      status: "generated_transparent_png_layer"
    };
  });
  const guidePath = path.join(folder, "PSD_BUILD_GUIDE.md");
  const manifestPath = path.join(folder, "model-art-manifest.json");
  const jsxPath = path.join(folder, "CREATE_LAYERED_PSD_IN_PHOTOSHOP.jsx");
  fs.writeFileSync(jsxPath, photoshopLayerAssemblerScript(layerOrder), "utf8");
  fs.writeFileSync(guidePath, [
    "# Project Blue 2D Model Art Kit",
    "",
    `Assistant: ${displayAssistantName(assistantName)}`,
    `Created: ${new Date().toISOString()}`,
    `Safety tag: ${outfitTag.label}`,
    outfitTag.warning,
    "",
    "## What This Is",
    "",
    "This folder contains real same-canvas transparent PNG layers for a Live2D-ready model art starting point.",
    "It is PSD-ready, but it is not a binary .psd until Photoshop, Krita, Photopea, or another art app imports the layers and exports a layered PSD.",
    "",
    "## How To Make The PSD",
    "",
    "Photoshop: File > Scripts > Browse, then run CREATE_LAYERED_PSD_IN_PHOTOSHOP.jsx from this folder.",
    "Krita/Photopea/manual: create a 900x1100 transparent document, import every PNG as a separate layer, keep the layer order from layer-order.json, then save/export as PSD.",
    "",
    "## Rigging Notes",
    "",
    "Keep face, eyes, brows, mouth, hair, body, arms, outfit, legs, and accessories as separate editable layers.",
    "Before final rigging, an artist should clean edges, fill hidden areas behind joints, separate left/right symmetric parts, and refine mouth/eye layers.",
    "Then import the PSD or separated PNGs into Live2D Cubism Editor and create ArtMeshes/deformers/parameters.",
    "",
    "## Layer Checklist",
    "",
    ...layerOrder.map(layer => `- [x] ${layer.group}/${layer.file}`)
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(folder, "layer-order.json"), JSON.stringify(layerOrder, null, 2), "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    type: "live2d_model_art_kit",
    assistantName,
    prompt: compactResearchText(message, 1000),
    safetyTag: outfitTag.label,
    warning: outfitTag.warning,
    canvas: "900x1100",
    realPsdWritten: false,
    psdOutputTarget: path.join(folder, "project-blue-live2d-model-art.psd"),
    psdAssemblerScript: jsxPath,
    layerOrder,
    riggingNextSteps: [
      "Open the layer kit in an art app and export a layered PSD.",
      "Clean and refine each layer, especially eyes, mouth, hair, hands, and outfit edges.",
      "Import the PSD into Live2D Cubism Editor.",
      "Generate/refine ArtMeshes, deformers, parameters, expressions, and physics.",
      "Export .moc3/.model3.json/textures and import into Project Blue."
    ]
  }, null, 2), "utf8");
  verifyCreatedPaths([
    { path: folder, label: "2D model art kit folder", options: { directory: true } },
    { path: guidePath, label: "PSD build guide", options: { file: true, nonEmptyFile: true } },
    { path: manifestPath, label: "2D model art manifest", options: { file: true, nonEmptyFile: true } },
    { path: jsxPath, label: "Photoshop PSD assembler script", options: { file: true, nonEmptyFile: true } },
    { path: path.join(folder, "layer-order.json"), label: "2D model layer order", options: { file: true, nonEmptyFile: true } },
    ...layerOrder.map(layer => ({
      path: layer.path,
      label: `2D model layer ${layer.group}/${layer.file}`,
      options: { file: true, nonEmptyFile: true }
    }))
  ]);
  rememberSharedItem({
    path: folder,
    originalPath: folder,
    name: path.basename(folder),
    kind: "folder",
    note: "Generated 2D model art layer kit with same-canvas transparent PNG parts."
  });
  rememberArtifact({
    path: folder,
    title: `${displayAssistantName(assistantName)} Live2D model art kit`,
    kind: "folder",
    source: "live2d_model_art_kit",
    note: `${outfitTag.label}: PSD-ready transparent PNG layer kit for Live2D model art.`
  });
  appendActivity(activityLedgerPath, "artifact", "2D model art kit generated", {
    folder,
    layerCount: layerOrder.length,
    safetyTag: outfitTag.label
  });
  return { folder, guidePath, manifestPath, jsxPath, layerCount: layerOrder.length, outfitTag };
}

async function handle2DModelArtRequest(message) {
  const kit = create2DModelArtKit(message);
  await shell.openPath(kit.folder);
  sendPetBubble("2D model art kit ready", 6000);
  return [
    `I made a PSD-ready layered 2D model art kit for ${displayAssistantName(assistantNameForModel())}.`,
    `Safety tag: ${kit.outfitTag.label}. ${kit.outfitTag.warning}`,
    `Layer folder: ${kit.folder}`,
    `Layers generated: ${kit.layerCount}`,
    `PSD build guide: ${kit.guidePath}`,
    `Photoshop PSD assembler script: ${kit.jsxPath}`,
    `Manifest: ${kit.manifestPath}`,
    "Important: this is real separated transparent PNG artwork and a PSD assembly script. It is not a real .psd until an art app imports the layers and exports the PSD."
  ].join("\n");
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = crypto.createHash("sha256")
    .update(typeBuffer)
    .update(data)
    .digest()
    .subarray(0, 4);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunkCrc(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodeRgbaPng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunkCrc("IHDR", header),
    pngChunkCrc("IDAT", zlib.deflateSync(raw)),
    pngChunkCrc("IEND", Buffer.alloc(0))
  ]);
}

function parseHexColor(value, alpha = 255) {
  const hex = String(value || "#ffffff").replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16) || 0,
    parseInt(hex.slice(2, 4), 16) || 0,
    parseInt(hex.slice(4, 6), 16) || 0,
    alpha
  ];
}

function drawPixel(rgba, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  rgba[offset] = Math.round(color[0] * alpha + rgba[offset] * inverse);
  rgba[offset + 1] = Math.round(color[1] * alpha + rgba[offset + 1] * inverse);
  rgba[offset + 2] = Math.round(color[2] * alpha + rgba[offset + 2] * inverse);
  rgba[offset + 3] = Math.min(255, Math.round(color[3] + rgba[offset + 3] * inverse));
}

function fillEllipse(rgba, width, height, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1) {
        drawPixel(rgba, width, height, x, y, color);
      }
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(rgba, width, height, points, color) {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) drawPixel(rgba, width, height, x, y, color);
    }
  }
}

function drawLine(rgba, width, height, x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps ? i / steps : 0;
    fillEllipse(rgba, width, height, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2, thickness / 2, color);
  }
}

function buildOutfitPartPng(part, prompt, assistantName, width = 900, height = 1100) {
  const [primary, secondary, dark, accent] = outfitPaletteFromPrompt(prompt);
  const style = outfitStyleFromPrompt(prompt);
  const rgba = Buffer.alloc(width * height * 4);
  const p = parseHexColor(primary, 235);
  const s = parseHexColor(secondary, 230);
  const d = parseHexColor(dark, 210);
  const a = parseHexColor(accent, 240);
  const ox = 200, oy = 230;
  const poly = points => points.map(([x, y]) => [x + ox, y + oy]);
  if (part === "outfit_top_front.png") {
    fillPolygon(rgba, width, height, poly([[188, 250], [250, 218], [312, 250], [302, 400], [198, 400]]), style === "formal" ? d : p);
    drawLine(rgba, width, height, ox + 192, oy + 250, ox + 250, oy + 218, 8, a);
    drawLine(rgba, width, height, ox + 250, oy + 218, ox + 308, oy + 250, 8, a);
  } else if (part === "outfit_top_shadow.png") {
    fillPolygon(rgba, width, height, poly([[218, 265], [250, 308], [282, 265], [274, 386], [226, 386]]), d);
  } else if (part === "outfit_trim.png") {
    drawLine(rgba, width, height, ox + 190, oy + 250, ox + 310, oy + 250, 12, a);
    drawLine(rgba, width, height, ox + 204, oy + 400, ox + 296, oy + 400, 10, s);
  } else if (part === "outfit_bottom.png") {
    fillPolygon(rgba, width, height, poly([[198, 390], [302, 390], [322, 552], [292, 574], [208, 574], [178, 552]]), p);
    drawLine(rgba, width, height, ox + 198, oy + 390, ox + 302, oy + 390, 8, a);
  } else if (part === "sleeve_l.png") {
    drawLine(rgba, width, height, ox + 148, oy + 268, ox + 116, oy + 352, 34, s);
    drawLine(rgba, width, height, ox + 116, oy + 352, ox + 134, oy + 445, 34, s);
  } else if (part === "sleeve_r.png") {
    drawLine(rgba, width, height, ox + 352, oy + 268, ox + 384, oy + 352, 34, s);
    drawLine(rgba, width, height, ox + 384, oy + 352, ox + 366, oy + 445, 34, s);
  } else if (part === "glove_l.png") {
    fillEllipse(rgba, width, height, ox + 132, oy + 455, 22, 22, a);
  } else if (part === "glove_r.png") {
    fillEllipse(rgba, width, height, ox + 368, oy + 455, 22, 22, a);
  } else if (part === "accessory_01.png") {
    fillPolygon(rgba, width, height, poly([[214, 176], [226, 134], [274, 134], [286, 176], [250, 162]]), a);
  } else if (part === "accessory_02.png") {
    fillEllipse(rgba, width, height, ox + 250, oy + 236, 14, 14, s);
    drawLine(rgba, width, height, ox + 250, oy + 250, ox + 250, oy + 318, 8, s);
  }
  return encodeRgbaPng(width, height, rgba);
}

function createRigReadyOutfitParts(message, assistantName, previewPath = "", nameHint = "") {
  const outfitTag = matureOutfitTagForMessage(message);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hint = nameHint ? `-${artifactSlug(nameHint)}` : "";
  const folder = path.join(artifactDirectory, `outfit-live2d-parts-${assistantName}${hint}-${stamp}`);
  const outfitFolder = path.join(folder, "outfit");
  const armsFolder = path.join(folder, "arms");
  const accessoriesFolder = path.join(folder, "accessories");
  fs.mkdirSync(outfitFolder, { recursive: true });
  fs.mkdirSync(armsFolder, { recursive: true });
  fs.mkdirSync(accessoriesFolder, { recursive: true });
  const parts = [
    ["outfit", "outfit_top_front.png"],
    ["outfit", "outfit_top_shadow.png"],
    ["outfit", "outfit_trim.png"],
    ["outfit", "outfit_bottom.png"],
    ["arms", "sleeve_l.png"],
    ["arms", "sleeve_r.png"],
    ["arms", "glove_l.png"],
    ["arms", "glove_r.png"],
    ["accessories", "accessory_01.png"],
    ["accessories", "accessory_02.png"]
  ].map(([group, file]) => {
    const target = path.join(folder, group, file);
    fs.writeFileSync(target, buildOutfitPartPng(file, message, assistantName));
    return {
      group,
      file,
      path: target,
      status: "generated_outfit_part",
      canvas: "900x1100"
    };
  });
  const checklist = [
    "# Rig-Ready Outfit Parts",
    "",
    "These are same-canvas transparent PNG outfit parts for Live2D preparation.",
    "They are generated outfit layers, not a finished Cubism rig. Import/refine them with the character's real base PSD/parts.",
    "",
    `Safety tag: ${outfitTag.label}`,
    outfitTag.warning,
    outfitTag.mature
      ? "Mature layer intent: covered adult-coded fashion only, such as bikini/swimsuit panels, opaque lingerie-inspired stagewear, bodysuit sections, towel/robe overlays, nightclub accessories, fantasy armor plates, or car-wash themed covered layers."
      : "Layer intent: normal stream-safe clothing layers.",
    "For Live2D/VRoid use, keep every transparent PNG aligned to the same canvas and separate wearable layers from body/skin layers.",
    "",
    `Prompt: ${compactResearchText(message, 500)}`,
    previewPath ? `Preview: ${previewPath}` : "",
    "",
    ...parts.map(part => `- [ ] ${part.group}/${part.file}`)
  ].filter(Boolean).join("\n");
  const manifestPath = path.join(folder, "parts-manifest.json");
  const checklistPath = path.join(folder, "PARTS_CHECKLIST.md");
  fs.writeFileSync(checklistPath, checklist, "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    type: "live2d_outfit_parts",
    safetyTag: outfitTag.label,
    warning: outfitTag.warning,
    streamSafe: true,
    explicitNudity: false,
    assistantName,
    prompt: compactResearchText(message, 1000),
    previewPath,
    canvasRule: "Every generated PNG uses 900x1100 transparent canvas alignment.",
    riggableLayerGuidance: [
      "Use separate outfit PNGs over the character base: top/front, shadow, trim, bottom, sleeves, gloves, accessories.",
      "For bikini/swimsuit outfits, split straps, cups/panels, waistbands, bottoms, ties, wet-look highlights, and accessories.",
      "For lingerie-inspired stagewear, keep opaque coverage and split corset/bodice, lace-like trim, stockings, gloves, bows, and jewelry.",
      "For beachwear/towel/robe outfits, split robe panels, belt, towel overlay, swimsuit base, sandals, and water/soap props.",
      "For VRoid/3D, treat this as concept/layer guidance for texture/outfit authoring, not a finished VRM edit."
    ],
    nextStep: "Combine with the character base PSD or separated body/face/hair parts, then rig in Live2D Cubism.",
    parts
  }, null, 2), "utf8");
  verifyCreatedPaths([
    { path: folder, label: "rig-ready outfit parts folder", options: { directory: true } },
    { path: checklistPath, label: "rig-ready outfit checklist", options: { file: true, nonEmptyFile: true } },
    { path: manifestPath, label: "rig-ready outfit manifest", options: { file: true, nonEmptyFile: true } },
    ...parts.map(part => ({
      path: part.path,
      label: `rig-ready outfit part ${part.group}/${part.file}`,
      options: { file: true, nonEmptyFile: true }
    }))
  ]);
  rememberSharedItem({
    path: folder,
    originalPath: folder,
    name: path.basename(folder),
    kind: "folder",
    note: "Generated same-canvas transparent PNG outfit parts for Live2D rigging."
  });
  rememberArtifact({
    path: folder,
    title: `${displayAssistantName(assistantName)} Live2D outfit parts`,
    kind: "folder",
    source: "outfit_live2d_parts",
    note: `${outfitTag.label}: rig-ready outfit part folder generated with same-canvas transparent PNG layers.`
  });
  appendActivity(activityLedgerPath, "artifact", "Rig-ready outfit parts generated", {
    folder,
    partCount: parts.length,
    safetyTag: outfitTag.label
  });
  return { folder, partCount: parts.length };
}

function artifactSlug(value) {
  return String(value || "artifact")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "artifact";
}

function outfitOptionPrompts(message) {
  const base = compactResearchText(message, 260);
  if (matureOutfitTagForMessage(message).mature) {
    return [
      {
        name: "Beach Flash",
        prompt: `${base}. Mature stream-safe covered bikini or swimsuit VTuber outfit with opaque fabric, towel or robe overlay, beach accessories, and bright summer colors. No nudity.`
      },
      {
        name: "Velvet Stage",
        prompt: `${base}. Opaque lingerie-inspired idol stage outfit with corset-like bodice, lace-like trim, gloves, stockings, jewelry, and performance-ready coverage. No nudity.`
      },
      {
        name: "Neon Club",
        prompt: `${base}. Nightclub VTuber outfit with glossy bodysuit panels, cropped jacket, covered silhouette, neon accents, boots, and confident adult styling. No nudity.`
      },
      {
        name: "Car Wash Shine",
        prompt: `${base}. Car-wash themed covered swimsuit or bodysuit outfit with soap-bubble accessories, towel belt, wet-look highlights, waterproof boots, and playful stream-safe styling. No nudity.`
      }
    ];
  }
  return [
    {
      name: "Neon Dreams",
      prompt: `${base}. Futuristic neon-lit VTuber outfit with glowing trim, sleek black skirt or layered bottom, cyber accessories, crisp blue and pink accents.`
    },
    {
      name: "Mystic Knight",
      prompt: `${base}. Regal fantasy knight VTuber outfit with ornate armor plates, cloth layers, metallic trims, cape-like accessories, jewel accents.`
    },
    {
      name: "Ocean Circuit",
      prompt: `${base}. Aqua tech idol VTuber outfit with swimsuit-inspired stage layers, translucent fabric, shell-like details, waterproof neon accessories.`
    },
    {
      name: "Moonlit Idol",
      prompt: `${base}. Elegant moon idol VTuber outfit with layered dress panels, star accessories, dark fabric, silver highlights, performance-ready silhouette.`
    }
  ];
}

async function createOutfitOptionsArtifacts(message) {
  const assistantName = assistantNameForModel();
  const outfitTag = matureOutfitTagForMessage(message);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = [];
  for (const option of outfitOptionPrompts(message)) {
    const filePath = path.join(
      artifactDirectory,
      `outfit-option-${assistantName}-${artifactSlug(option.name)}-${stamp}.svg`
    );
    fs.writeFileSync(filePath, buildOutfitPreviewSvg(option.prompt, assistantName), "utf8");
    verifyCreatedPath(filePath, `${option.name} outfit preview`, { file: true, nonEmptyFile: true });
    const parts = createRigReadyOutfitParts(option.prompt, assistantName, filePath, option.name);
    options.push({
      name: option.name,
      previewPath: filePath,
      partsFolder: parts.folder,
      partCount: parts.partCount
    });
  }
  const indexPath = path.join(artifactDirectory, `outfit-options-${assistantName}-${stamp}.md`);
  const lines = [
    `# ${displayAssistantName(assistantName)} Outfit Options`,
    "",
    "These are real generated preview files plus matching same-canvas transparent PNG outfit part folders.",
    "They are outfit design drafts for Live2D preparation, not finished PSD/CMO3 rigs.",
    "",
    `Safety tag: ${outfitTag.label}`,
    outfitTag.warning,
    "",
    `Request: ${compactResearchText(message, 600)}`,
    "",
    ...options.flatMap((option, index) => [
      `## ${index + 1}. ${option.name}`,
      `Preview: ${option.previewPath}`,
      `Rig-ready parts folder: ${option.partsFolder}`,
      `Parts generated: ${option.partCount}`,
      ""
    ])
  ];
  fs.writeFileSync(indexPath, lines.join("\n"), "utf8");
  verifyCreatedPath(indexPath, "outfit options index", { file: true, nonEmptyFile: true });
  const artifact = rememberArtifact({
    path: indexPath,
    title: `${displayAssistantName(assistantName)} outfit options`,
    kind: "file",
    source: "outfit_options",
    note: `${outfitTag.label}: index of real outfit option previews and rig-ready PNG part folders.`
  });
  if (artifact) await shell.openPath(indexPath);
  sendPetBubble("Outfit options ready", 6000);
  return [
    `I made ${options.length} real outfit options for ${displayAssistantName(assistantName)} and opened the index file.`,
    `Safety tag: ${outfitTag.label}. ${outfitTag.warning}`,
    `Index: ${indexPath}`,
    "",
    ...options.flatMap((option, index) => [
      `${index + 1}. ${option.name}`,
      `Preview: ${option.previewPath}`,
      `Rig-ready parts: ${option.partsFolder}`
    ]),
    "",
    "I will not claim a PNG/PSD/CMO3 exists unless Project Blue actually wrote that file."
  ].join("\n");
}

async function handle2DRiggingRequest(message) {
  const rigAsset = latestLive2DRiggingAsset();
  const partsFolder = latestLive2DPartsFolder();
  if (!rigAsset && !partsFolder) {
    return [
      "You are right: this is not good enough to call rigging.",
      "I do not have real riggable Live2D artwork yet, so I will not make another fake starter package.",
      "",
      "Give me one of these:",
      "- a layered PSD with separate face, eyes, brows, mouth, hair, body, arms, outfit, and accessory layers",
      "- a folder of separated transparent PNG parts on the same canvas",
      "- an existing Live2D export with .model3.json/.moc3/textures",
      "",
      "Once you share that, ask 'rig this Live2D model' and I will build around the real parts instead of guessing from a flat image."
    ].join("\n");
  }
  const referencePath = latestImageReferencePath();
  const research = await researchLearningTopic("Live2D 2D model rigging ArtMesh deformers parameters");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `live2d-rigging-starter-${stamp}`;
  const planPath = path.join(artifactDirectory, `${baseName}.md`);
  const partsWorkspace = create2DPartsWorkspace(baseName, referencePath);
  fs.writeFileSync(planPath, build2DRiggingPlan(referencePath), "utf8");
  const cubismPath = cubismEditorCandidates()[0] || "";
  const cubismPlanPath = path.join(artifactDirectory, `${baseName}-cubism-handoff.md`);
  fs.writeFileSync(cubismPlanPath, buildCubismHandoffPlan({
    planPath,
    partsWorkspace,
    partsFolder,
    rigAsset,
    referencePath,
    cubismPath
  }), "utf8");
  const manifestPath = path.join(artifactDirectory, `${baseName}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    referencePath: referencePath || "",
    riggingAssetPath: rigAsset?.path || "",
    partsFolderPath: partsFolder?.path || "",
    mode: "live2d_rigging_starter",
    status: rigAsset?.path?.toLowerCase().endsWith(".model3.json")
      ? "existing_live2d_model_ready_to_import"
      : "real_parts_or_psd_received",
    partsWorkspace,
    cubismEditorPath: cubismPath,
    cubismHandoffPath: cubismPlanPath,
    autoSplitSummary: "disabled",
    sources: research.sources,
    nextRequiredAsset: "layered PSD or separated transparent PNG parts"
  }, null, 2), "utf8");
  verifyCreatedPaths([
    { path: planPath, label: "Live2D rigging plan", options: { file: true, nonEmptyFile: true } },
    { path: cubismPlanPath, label: "Live2D Cubism handoff plan", options: { file: true, nonEmptyFile: true } },
    { path: manifestPath, label: "Live2D handoff manifest", options: { file: true, nonEmptyFile: true } },
    { path: partsWorkspace, label: "Live2D parts workspace", options: { directory: true } }
  ]);
  rememberArtifact({
    path: cubismPlanPath,
    title: "Live2D Cubism handoff plan",
    kind: "file",
    source: "live2d_rigging",
    note: "Cubism Editor handoff package created from the current riggable input."
  });
  await shell.openPath(cubismPlanPath);
  await shell.openPath(partsFolder?.path || partsWorkspace);
  if (cubismPath) await shell.openPath(cubismPath);
  sendPetBubble("2D rigging plan ready", 6000);
  return [
    "I found real Live2D rigging input and made a Cubism Editor handoff package.",
    cubismPath
      ? `Live2D Cubism Editor found and opened: ${cubismPath}`
      : "I could not find Live2D Cubism Editor installed on this PC. Install it from Live2D's official site, then ask me again and I will open it.",
    rigAsset ? `Rigging asset: ${rigAsset.path}` : "",
    partsFolder ? `Parts folder: ${partsFolder.path}` : "",
    referencePath ? `Reference image: ${referencePath}` : "Reference image: none selected yet",
    `Rigging plan: ${planPath}`,
    `Cubism handoff: ${cubismPlanPath}`,
    `Parts workspace: ${partsWorkspace}`,
    `Manifest: ${manifestPath}`,
    "",
    "Important: this is now based on real riggable input, not a flat PNG guess."
  ].filter(Boolean).join("\n");
}

function outfitPaletteFromPrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  const palettes = [
    { terms: ["blue", "ice", "cyber"], colors: ["#1a9cff", "#dff7ff", "#091827", "#74e0ff"] },
    { terms: ["red", "fire", "demon"], colors: ["#e23b4f", "#ffd2d8", "#1b0710", "#ff9b4d"] },
    { terms: ["black", "goth", "dark", "shadow"], colors: ["#141820", "#e7edf5", "#030509", "#8a9bb8"] },
    { terms: ["white", "angel", "holy"], colors: ["#f4f8ff", "#2e7bd8", "#cdddf0", "#f6ce74"] },
    { terms: ["green", "forest", "nature"], colors: ["#26a269", "#e2ffe9", "#092016", "#91d45c"] },
    { terms: ["purple", "violet", "magic"], colors: ["#7a4de8", "#f0e8ff", "#13091f", "#f08cff"] },
    { terms: ["gold", "royal", "queen", "king"], colors: ["#d9a441", "#fff1c2", "#1c1320", "#7cc7ff"] }
  ];
  return palettes.find(palette => palette.terms.some(term => text.includes(term)))?.colors
    || ["#2674d9", "#e8f3ff", "#111827", "#72d3ff"];
}

function outfitStyleFromPrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (/\b(armor|armour|knight|warrior)\b/.test(text)) return "armored";
  if (/\b(hoodie|street|casual)\b/.test(text)) return "streetwear";
  if (/\b(swimsuit|swimsute|swimsuite|bikini|beachwear|dress|gown|idol|stage)\b/.test(text)) return "stage";
  if (/\b(suit|formal|business)\b/.test(text)) return "formal";
  return "vtuber";
}

function buildOutfitPreviewSvg(prompt, assistantName) {
  const [primary, secondary, dark, accent] = outfitPaletteFromPrompt(prompt);
  const style = outfitStyleFromPrompt(prompt);
  const title = `${displayAssistantName(assistantName)} Outfit Preview`;
  const promptText = compactResearchText(prompt, 160);
  const jacket = style === "armored"
    ? `<path d="M190 250 L250 218 L310 250 L292 390 L208 390 Z" fill="${primary}" stroke="${accent}" stroke-width="7"/>
       <path d="M220 256 L250 232 L280 256 L270 348 L230 348 Z" fill="${dark}" opacity=".86"/>
       <circle cx="215" cy="300" r="11" fill="${secondary}"/><circle cx="285" cy="300" r="11" fill="${secondary}"/>`
    : style === "stage"
      ? `<path d="M190 250 C220 220 280 220 310 250 L332 438 C294 462 206 462 168 438 Z" fill="${primary}" stroke="${accent}" stroke-width="6"/>
         <path d="M208 276 C230 292 270 292 292 276 L282 404 C260 416 240 416 218 404 Z" fill="${secondary}" opacity=".82"/>`
      : style === "formal"
        ? `<path d="M192 250 L250 218 L308 250 L294 404 L206 404 Z" fill="${dark}" stroke="${primary}" stroke-width="6"/>
           <path d="M228 230 L250 314 L272 230 L250 218 Z" fill="${secondary}"/>
           <path d="M244 274 L256 274 L262 358 L250 384 L238 358 Z" fill="${accent}"/>`
        : `<path d="M188 250 C218 228 282 228 312 250 L302 400 L198 400 Z" fill="${primary}" stroke="${accent}" stroke-width="6"/>
           <path d="M218 265 L250 308 L282 265 L274 386 L226 386 Z" fill="${dark}" opacity=".82"/>`;
  const accessory = style === "streetwear"
    ? `<path d="M198 226 C212 184 288 184 302 226 C282 214 218 214 198 226 Z" fill="${secondary}" opacity=".9"/>`
    : `<path d="M214 176 C226 134 274 134 286 176 C264 162 236 162 214 176 Z" fill="${accent}" opacity=".85"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07111f"/><stop offset="1" stop-color="#18324d"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".35"/>
    </filter>
  </defs>
  <rect width="900" height="1100" fill="url(#bg)"/>
  <rect x="70" y="72" width="760" height="956" rx="28" fill="#102238" stroke="#355f82" stroke-width="3"/>
  <text x="110" y="145" fill="#eaf4ff" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="700">${escapeXml(title)}</text>
  <text x="110" y="188" fill="#9ab2c9" font-family="Segoe UI, Arial, sans-serif" font-size="24">${escapeXml(style.toUpperCase())} visual draft</text>
  <g transform="translate(200 230)" filter="url(#shadow)">
    <ellipse cx="250" cy="760" rx="150" ry="28" fill="#020811" opacity=".45"/>
    <path d="M148 268 C104 310 98 386 134 445" fill="none" stroke="${secondary}" stroke-width="34" stroke-linecap="round"/>
    <path d="M352 268 C396 310 402 386 366 445" fill="none" stroke="${secondary}" stroke-width="34" stroke-linecap="round"/>
    <path d="M218 390 L198 706" stroke="${dark}" stroke-width="46" stroke-linecap="round"/>
    <path d="M282 390 L302 706" stroke="${dark}" stroke-width="46" stroke-linecap="round"/>
    <path d="M178 724 L238 724" stroke="${accent}" stroke-width="24" stroke-linecap="round"/>
    <path d="M282 724 L342 724" stroke="${accent}" stroke-width="24" stroke-linecap="round"/>
    ${jacket}
    <circle cx="250" cy="156" r="70" fill="${secondary}" stroke="${accent}" stroke-width="6"/>
    <path d="M178 152 C194 80 306 80 322 152 C292 126 208 126 178 152 Z" fill="${dark}"/>
    ${accessory}
    <circle cx="225" cy="158" r="7" fill="#07111f"/><circle cx="275" cy="158" r="7" fill="#07111f"/>
    <path d="M230 190 C244 204 258 204 272 190" fill="none" stroke="#07111f" stroke-width="5" stroke-linecap="round"/>
  </g>
  <g transform="translate(110 900)">
    <rect x="0" y="0" width="680" height="74" rx="14" fill="#07111f" stroke="#315676"/>
    <circle cx="36" cy="37" r="16" fill="${primary}"/><circle cx="82" cy="37" r="16" fill="${secondary}"/>
    <circle cx="128" cy="37" r="16" fill="${dark}"/><circle cx="174" cy="37" r="16" fill="${accent}"/>
    <text x="216" y="32" fill="#cfe8fa" font-family="Segoe UI, Arial, sans-serif" font-size="18">Prompt</text>
    <text x="216" y="57" fill="#9ab2c9" font-family="Segoe UI, Arial, sans-serif" font-size="16">${escapeXml(promptText)}</text>
  </g>
</svg>`;
}

function openAiImageApiKey() {
  return process.env.OPENAI_API_KEY || readWindowsEnvironmentVariable("OPENAI_API_KEY");
}

function openAiImageModel() {
  return process.env.OPENAI_IMAGE_MODEL
    || readWindowsEnvironmentVariable("OPENAI_IMAGE_MODEL")
    || "gpt-image-2";
}

function safeImageError(error) {
  return String(error?.message || error || "Unknown image generator error")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function normalizeOutfitImageRequest(message) {
  return compactResearchText(message, 700)
    .replace(/\bhot\s+girl\b/gi, "confident adult VTuber")
    .replace(/\bsexy\b/gi, "stylish")
    .replace(/\bnaked\b/gi, "covered mature fashion")
    .replace(/\bnude\b/gi, "covered mature fashion")
    .replace(/\bneked\b/gi, "covered mature fashion")
    .replace(/\bslutty\b/gi, "bold fashion")
    .replace(/\bthot\b/gi, "confident adult VTuber")
    .replace(/\bminor\b/gi, "adult")
    .replace(/\bteen\b/gi, "adult")
    .replace(/\s+/g, " ")
    .trim();
}

function buildOutfitImagePrompt(message, assistantName) {
  const name = displayAssistantName(assistantName);
  const outfitReference = currentOutfitReference();
  const outfitStyleReference = currentOutfitStyleReference();
  const outfitTag = matureOutfitTagForMessage(message);
  const hasReference = outfitReference && fs.existsSync(outfitReference.path);
  const hasStyleReference = outfitStyleReference && fs.existsSync(outfitStyleReference.path);
  return [
    `Create a polished full-body VTuber outfit concept art preview for ${name}.`,
    hasReference
      ? "Use the provided reference image as the base identity/style reference. Preserve the character's face, hair, proportions, overall vibe, and recognizable model identity while changing only the outfit design."
      : "Show the whole character from head to shoes on a clean neutral studio background.",
    hasStyleReference
      ? "A second image is provided as the outfit/style reference. Use it for clothing silhouette, colors, fabric, accessories, and design mood, but keep the base character identity from the first image."
      : "",
    "Focus on clothing design, colors, silhouette, accessories, fabric details, and how the outfit would look on a 2D or 3D VTuber model.",
    "If the creator gives only a simple idea, infer the missing details yourself and complete the design without asking follow-up questions.",
    "Keep the character clearly adult, non-explicit, and suitable as a stream-safe fashion/outfit concept.",
    outfitTag.mature
      ? "Mature stream-safe mode: adult-coded fashion is allowed, such as swimsuit, bikini, opaque lingerie-inspired stagewear, covered pin-up styling, nightclub outfit, fantasy armor, towel/robe, or car-wash themed outfit. The body must remain covered with no explicit nudity."
      : "Normal mode: keep the outfit broadly stream-safe and non-suggestive.",
    "For sheer-looking fabric, render opaque lining or coverage underneath. Avoid exposed genitals, explicit sexual poses, and minor-coded features.",
    "Anime/Vtuber concept art style, high detail, crisp lighting, no text, no labels, no watermark.",
    `Creator request: ${normalizeOutfitImageRequest(message)}`
  ].filter(Boolean).join(" ");
}

async function generateOpenAiOutfitEditPng(message, assistantName) {
  const outfitReference = currentOutfitReference();
  const outfitStyleReference = currentOutfitStyleReference();
  const outfitTag = matureOutfitTagForMessage(message);
  if (!outfitReference || !fs.existsSync(outfitReference.path)) {
    throw new Error("No outfit reference image is set.");
  }
  const apiKey = openAiImageApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set for image editing.");
  const model = openAiImageModel();
  const imageMime = filePath => {
    const extension = path.extname(filePath).toLowerCase();
    return extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  };
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", buildOutfitImagePrompt(message, assistantName));
  form.append("size", "1024x1536");
  form.append("quality", "low");
  form.append("image[]", new Blob([fs.readFileSync(outfitReference.path)], { type: imageMime(outfitReference.path) }), path.basename(outfitReference.path));
  if (outfitStyleReference?.path && fs.existsSync(outfitStyleReference.path)) {
    form.append("image[]", new Blob([fs.readFileSync(outfitStyleReference.path)], { type: imageMime(outfitStyleReference.path) }), path.basename(outfitStyleReference.path));
  }
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: form
  });
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; }
  catch {
    throw new Error(`OpenAI image edit returned unreadable output: ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = result?.error?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  const imageBase64 = result?.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("OpenAI image edit did not return image data.");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(artifactDirectory, `outfit-edit-${assistantName}-${stamp}.png`);
  fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));
  verifyCreatedPath(filePath, "OpenAI outfit edit PNG", { file: true, nonEmptyFile: true });
  const artifact = rememberArtifact({
    path: filePath,
    title: `${displayAssistantName(assistantName)} reference outfit edit`,
    kind: "image",
    source: "openai_image_edit",
    note: `${outfitTag.label}: generated with ${model} from reference: ${path.basename(outfitReference.path)}`
  });
  if (artifact) await openLatestArtifact();
  return {
    filePath,
    model,
    referencePath: outfitReference.path,
    safetyTag: outfitTag.label,
    warning: outfitTag.warning,
    styleReferencePath: outfitStyleReference?.path && fs.existsSync(outfitStyleReference.path)
      ? outfitStyleReference.path
      : ""
  };
}

async function generateOpenAiOutfitPng(message, assistantName) {
  const outfitTag = matureOutfitTagForMessage(message);
  const apiKey = openAiImageApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set for image generation.");
  const model = openAiImageModel();
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt: buildOutfitImagePrompt(message, assistantName),
      n: 1,
      size: "1024x1536",
      quality: "low"
    })
  });
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; }
  catch {
    throw new Error(`OpenAI image generation returned unreadable output: ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = result?.error?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  const imageBase64 = result?.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("OpenAI image generation did not return image data.");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(artifactDirectory, `outfit-preview-${assistantName}-${stamp}.png`);
  fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));
  verifyCreatedPath(filePath, "OpenAI outfit preview PNG", { file: true, nonEmptyFile: true });
  const artifact = rememberArtifact({
    path: filePath,
    title: `${displayAssistantName(assistantName)} generated outfit PNG`,
    kind: "image",
    source: "openai_image_generation",
    note: `${outfitTag.label}: generated with ${model} from your outfit request.`
  });
  if (artifact) await openLatestArtifact();
  return { filePath, model, safetyTag: outfitTag.label, warning: outfitTag.warning };
}

async function createOutfitPreviewArtifact(message) {
  const assistantName = assistantNameForModel();
  const outfitTag = matureOutfitTagForMessage(message);
  let imageGeneratorError = "";
  try {
    const outfitReference = currentOutfitReference();
    if (outfitReference && fs.existsSync(outfitReference.path)) {
      const edited = await generateOpenAiOutfitEditPng(message, assistantName);
      const parts = createRigReadyOutfitParts(message, assistantName, edited.filePath);
      sendPetBubble("Reference outfit edit ready", 6000);
      return [
        `I used your reference image and generated a new outfit edit for ${displayAssistantName(assistantName)} with ${edited.model}.`,
        `Safety tag: ${edited.safetyTag}. ${edited.warning}`,
        `Base reference: ${edited.referencePath}`,
        edited.styleReferencePath ? `Outfit/style reference: ${edited.styleReferencePath}` : "",
        `Saved here: ${edited.filePath}`,
        `Rig-ready outfit parts: ${parts.folder}`,
        `Parts generated: ${parts.partCount}`,
        "It is loaded in System > Latest Result so you can preview it, open it, or show the folder."
      ].join(" ");
    }
    const generated = await generateOpenAiOutfitPng(message, assistantName);
    const parts = createRigReadyOutfitParts(message, assistantName, generated.filePath);
    sendPetBubble("Outfit PNG ready", 6000);
    return [
      `I generated a real PNG outfit preview for ${displayAssistantName(assistantName)} with ${generated.model} and opened it.`,
      `Safety tag: ${generated.safetyTag}. ${generated.warning}`,
      `Saved here: ${generated.filePath}`,
      `Rig-ready outfit parts: ${parts.folder}`,
      `Parts generated: ${parts.partCount}`,
      "It is also loaded in System > Latest Result so you can preview it, open it, or show the folder.",
      "This is now the richer image-generator path plus same-canvas transparent outfit parts for Live2D preparation."
    ].join(" ");
  } catch (error) {
    imageGeneratorError = safeImageError(error);
    appendActivity(activityLedgerPath, "system", "OpenAI outfit PNG fallback used", {
      reason: imageGeneratorError
    });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(artifactDirectory, `outfit-preview-${assistantName}-${stamp}.svg`);
  fs.writeFileSync(filePath, buildOutfitPreviewSvg(message, assistantName), "utf8");
  verifyCreatedPath(filePath, "fallback outfit preview SVG", { file: true, nonEmptyFile: true });
  const parts = createRigReadyOutfitParts(message, assistantName, filePath);
  const artifact = rememberArtifact({
    path: filePath,
    title: `${displayAssistantName(assistantName)} outfit preview`,
    kind: "image",
    source: "chat_outfit_preview",
    note: `${outfitTag.label}: visual draft generated from your outfit request.`
  });
  if (artifact) await openLatestArtifact();
  sendPetBubble("Outfit preview ready", 6000);
  return [
    `I could not reach the full image generator this time, so I made the simple fallback SVG preview for ${displayAssistantName(assistantName)} and opened it.`,
    `Safety tag: ${outfitTag.label}. ${outfitTag.warning}`,
    `Saved here: ${filePath}`,
    `Rig-ready outfit parts: ${parts.folder}`,
    `Parts generated: ${parts.partCount}`,
    "It is also loaded in System > Latest Result, where you can preview it, open it, or show the folder.",
    imageGeneratorError ? `Image generator error: ${imageGeneratorError}` : "",
    "To get the richer PNG path, make sure OPENAI_API_KEY is set and your OpenAI organization has access to GPT Image generation. You can set OPENAI_IMAGE_MODEL if you want a different image model."
  ].filter(Boolean).join(" ");
}

function pcActionGuidelines() {
  const roots = [
    path.resolve(appRoot, ".."),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Downloads")
  ];
  return {
    allowedActions: ["open_path", "open_url", "create_text_file", "append_text_file", "overwrite_text_file"],
    approvedWriteRoots: roots,
    rules: [
      "Open path/app and open URL are visible user actions.",
      "File writes are limited to approved folders.",
      "File writes require the explicit approval checkbox unless Away Rules and the per-task low-risk waiver are both enabled.",
      "The low-risk waiver only covers text file create/append/overwrite in approved folders.",
      "Executable, script, system, hidden, and credential-looking files are blocked.",
      "Delete, move, registry, startup, service, firewall, security, credential, and admin actions are queued for explicit approval instead of running unattended."
    ]
  };
}

function highRiskActionHint(action, target, content) {
  const text = `${action} ${target} ${content}`.toLowerCase();
  if (/\b(firewall|defender|security|antivirus|quarantine|scan)\b/.test(text)) return "security_change";
  if (/\b(registry|regedit|hkcu|hklm)\b/.test(text)) return "registry_change";
  if (/\b(startup|service|scheduled task|schtasks)\b/.test(text)) return "startup_or_service_change";
  if (/\b(password|token|secret|credential|api key|apikey)\b/.test(text)) return "credential_access";
  if (/\b(delete|remove|wipe|format|erase)\b/.test(text)) return "destructive_file_action";
  if (/\b(remote|rdp|teamviewer|anydesk|ssh|let .* on|access .* pc)\b/.test(text)) return "remote_pc_access";
  if (/\b(admin|administrator|elevated|sudo)\b/.test(text)) return "admin_action";
  return "";
}

function normalizeAutonomySettings(value = {}) {
  const fullControlUntil = String(value.fullControlUntil || "");
  const fullControlActive = Date.parse(fullControlUntil) > Date.now();
  return {
    awayMode: Boolean(value.awayMode),
    autoLowRiskTasks: value.autoLowRiskTasks !== false,
    askBeforeDeepResearch: value.askBeforeDeepResearch !== false,
    phoneApprovalQueue: value.phoneApprovalQueue !== false,
    prepareHighRiskWhileWaiting: value.prepareHighRiskWhileWaiting !== false,
    phoneBridgeNoToken: Boolean(value.phoneBridgeNoToken),
    selfLearningSuggestions: Boolean(value.selfLearningSuggestions),
    selfImprovementProposals: Boolean(value.selfImprovementProposals),
    fullControlUntil: fullControlActive ? fullControlUntil : "",
    allowUnattendedRiskyActions: false,
    allowRemotePcAccess: false,
    notes: String(value.notes || "").slice(0, 2000)
  };
}

function fullControlActive() {
  return Date.parse(autonomySettings.fullControlUntil || "") > Date.now();
}

function autonomyStatusPayload() {
  return {
    ...autonomySettings,
    fullControlActive: fullControlActive(),
    rules: [
      "Blue may auto-plan work and auto-run low-risk visible actions when away mode is enabled.",
      "A Full Control session lets Blue continue local allowed tasks without repeated approval prompts until the timer expires.",
      "Blue may choose helper apps such as Blender when the task clearly needs them, but file writes and system changes stay approval-gated.",
      "Self-learning suggestions save local learning requests only. Deep research still waits for approval.",
      "Self-improvement proposals can identify weak Blue behavior and prepare a fix plan, but code changes still require normal edits, checks, and restart.",
      "For high-risk tasks, Blue may prepare a plan and queue an approval question while waiting.",
      "Deep research is saved as a learning task first, then started only after approval.",
      "Remote PC access, security changes, credential actions, startup/service changes, registry edits, firewall changes, and destructive actions are never allowed unattended. They can be queued for explicit approval.",
      "Phone bridge work starts as a local paired companion. It should expose approval prompts, chat, and status, not raw unrestricted PC control.",
      "Tokenless phone bridge mode only belongs on a trusted private network because anyone on that network can reach Blue."
    ]
  };
}

function saveAutonomySettings(value) {
  autonomySettings = normalizeAutonomySettings(value);
  saveJsonAtomic(autonomySettingsPath, autonomySettings);
  appendActivity(activityLedgerPath, "settings", "Autonomy rules saved", {
    awayMode: autonomySettings.awayMode,
    autoLowRiskTasks: autonomySettings.autoLowRiskTasks,
    askBeforeDeepResearch: autonomySettings.askBeforeDeepResearch,
    phoneApprovalQueue: autonomySettings.phoneApprovalQueue,
    prepareHighRiskWhileWaiting: autonomySettings.prepareHighRiskWhileWaiting,
    phoneBridgeNoToken: autonomySettings.phoneBridgeNoToken,
    selfLearningSuggestions: autonomySettings.selfLearningSuggestions,
    selfImprovementProposals: autonomySettings.selfImprovementProposals
  });
  return autonomyStatusPayload();
}

function grantFullControlSession(minutes = 60, source = "manual") {
  const duration = Math.max(5, Math.min(Number(minutes || 60), 240));
  autonomySettings = normalizeAutonomySettings({
    ...autonomySettings,
    awayMode: true,
    autoLowRiskTasks: true,
    prepareHighRiskWhileWaiting: true,
    phoneApprovalQueue: true,
    fullControlUntil: new Date(Date.now() + duration * 60000).toISOString()
  });
  saveJsonAtomic(autonomySettingsPath, autonomySettings);
  appendActivity(activityLedgerPath, "settings", "Full Control session granted", {
    source,
    fullControlUntil: autonomySettings.fullControlUntil
  });
  return autonomyStatusPayload();
}

function revokeFullControlSession(source = "manual") {
  autonomySettings = normalizeAutonomySettings({
    ...autonomySettings,
    fullControlUntil: ""
  });
  saveJsonAtomic(autonomySettingsPath, autonomySettings);
  appendActivity(activityLedgerPath, "settings", "Full Control session revoked", { source });
  return autonomyStatusPayload();
}

function detectFullControlGrantRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\bi grant (blue|qwen|her|the ai) full control( for local tasks)?\b/.test(text)
    || /\bgive (blue|qwen|her|the ai) full control\b/.test(text);
}

function detectFullControlRevokeRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(revoke|turn off|disable|stop|cancel).*\bfull control\b/.test(text);
}

function detectNetworkBridgeStartRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(start|open|enable|turn on|make)\b.*\b(network bridge|lan bridge|phone bridge|network ai|ai on (?:my )?network|use.*all.*pc|all.*network.*pc)\b/.test(text)
    || /\b(use|hear|talk to).*\b(ai|blue|qwen)\b.*\b(network|lan|other pc|all pc)\b/.test(text);
}

function detectNetworkBridgeStopRequest(message) {
  const text = normalizeLearningSearchTopic(message).toLowerCase();
  return /\b(stop|turn off|disable|close)\b.*\b(network bridge|lan bridge|phone bridge|network ai)\b/.test(text);
}

function appendPhoneApprovalRequest({ kind, summary, target, risk, details }) {
  const record = {
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
    kind: String(kind || "approval").slice(0, 80),
    summary: String(summary || "Approval requested").slice(0, 500),
    target: String(target || "").slice(0, 2000),
    risk: String(risk || "high").slice(0, 80),
    details: String(details || "").slice(0, 4000)
  };
  fs.mkdirSync(path.dirname(phoneApprovalQueuePath), { recursive: true });
  fs.appendFileSync(phoneApprovalQueuePath, `${JSON.stringify(record)}\n`, "utf8");
  appendActivity(activityLedgerPath, "approval", "Phone approval request queued", {
    id: record.id,
    kind: record.kind,
    risk: record.risk
  });
  return record;
}

function readPhoneApprovalQueue(limit = 30) {
  if (!fs.existsSync(phoneApprovalQueuePath)) return [];
  return fs.readFileSync(phoneApprovalQueuePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line)]; }
      catch { return []; }
    })
    .slice(-limit)
    .reverse();
}

function formatPhoneApprovalQueue() {
  const rows = readPhoneApprovalQueue();
  if (!rows.length) return "No phone approval requests are queued.";
  return rows.map(row => [
    `${row.createdAt} [${row.status}] ${row.kind} (${row.risk})`,
    `id: ${row.id}`,
    `summary: ${row.summary}`,
    row.target ? `target: ${row.target}` : "",
    row.details ? `details: ${row.details}` : ""
  ].filter(Boolean).join("\n")).join("\n\n");
}

function updatePhoneApprovalStatus(id, status, note = "") {
  if (!["approved", "denied"].includes(status)) {
    throw new Error("Choose approved or denied.");
  }
  const rows = fs.existsSync(phoneApprovalQueuePath)
    ? fs.readFileSync(phoneApprovalQueuePath, "utf8").split(/\r?\n/).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; }
      catch { return []; }
    })
    : [];
  let changed = false;
  const updated = rows.map(row => {
    if (row.id !== id) return row;
    changed = true;
    return {
      ...row,
      status,
      answeredAt: new Date().toISOString(),
      answerNote: String(note || "").slice(0, 1000)
    };
  });
  if (!changed) throw new Error("Approval request was not found.");
  fs.writeFileSync(phoneApprovalQueuePath, updated.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");
  appendActivity(activityLedgerPath, "approval", "Phone approval request answered", {
    id,
    status
  });
  return updated.find(row => row.id === id);
}

function localNetworkAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const item of addresses || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return "127.0.0.1";
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phoneBridgePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Project Blue Network Bridge</title>
  <meta name="theme-color" content="#07111f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Blue">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #07111f; color: #eaf4ff; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; display: grid; gap: 12px; }
    h1 { margin: 0; color: #54b4ff; }
    section { border: 1px solid #294b68; border-radius: 8px; padding: 12px; background: #102238; }
    input, textarea, button { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 10px; border-radius: 8px; border: 1px solid #315676; }
    input, textarea { background: #07111f; color: white; }
    button { background: #1672b8; color: white; }
    button.secondary { background: #263d52; }
    pre { white-space: pre-wrap; background: #07111f; padding: 10px; border-radius: 8px; overflow: auto; }
    .approval { border-top: 1px solid #294b68; padding-top: 10px; margin-top: 10px; }
    .appbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .appbar button { width: auto; min-width: 96px; margin-top: 0; }
    .hint { color: #9ab2c9; font-size: 13px; }
    .choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <div class="appbar">
      <h1>Project Blue Network</h1>
      <button id="installApp" class="secondary" hidden>Install</button>
    </div>
    <section id="optIn">
      <strong>Use Blue on this device?</strong>
      <p class="hint">Blue runs on the main Project Blue PC, not inside the Xfinity modem. This page lets a trusted network device opt in to chat, voice input, and approval prompts. Saying no stores that choice only in this browser.</p>
      <div class="choice">
        <button onclick="acceptBlue()">Use Blue Here</button>
        <button class="secondary" onclick="declineBlue()">No Thanks</button>
      </div>
    </section>
    <section>
      <strong>Pair</strong>
      <input id="token" type="password" placeholder="Pairing token from the PC">
      <button onclick="saveToken()">Save Token</button>
      <p class="hint">Open this URL from any trusted PC or phone on your LAN. It lets that device chat with Blue and answer queued approval questions. It does not expose raw PC control or install anything automatically.</p>
    </section>
    <section>
      <strong>Chat</strong>
      <textarea id="message" placeholder="Talk to Blue on your PC..."></textarea>
      <button class="secondary" onclick="voiceInput()">Voice Input From This Device</button>
      <button onclick="sendChat()">Send</button>
      <pre id="reply">Ready.</pre>
    </section>
    <section>
      <strong>Approval Queue</strong>
      <button onclick="loadApprovals()">Refresh Approvals</button>
      <div id="approvals"></div>
    </section>
  </main>
  <script>
    let installPrompt = null;
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      installPrompt = event;
      document.querySelector("#installApp").hidden = false;
    });
    document.querySelector("#installApp").onclick = async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      document.querySelector("#installApp").hidden = true;
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (localStorage.getItem("blueNetworkOptIn") === "no") {
      document.body.innerHTML = "<main><section><strong>Blue is off on this device.</strong><p class='hint'>This browser said no. Clear site data or open the network URL again and choose Use Blue Here if you change your mind.</p></section></main>";
    }
    function acceptBlue() {
      localStorage.setItem("blueNetworkOptIn", "yes");
      document.querySelector("#optIn").classList.add("hidden");
    }
    function declineBlue() {
      localStorage.setItem("blueNetworkOptIn", "no");
      document.body.innerHTML = "<main><section><strong>Blue is off on this device.</strong><p class='hint'>No app was installed and Blue has no control over this device.</p></section></main>";
    }
    if (localStorage.getItem("blueNetworkOptIn") === "yes") {
      document.querySelector("#optIn").classList.add("hidden");
    }
    const tokenInput = document.querySelector("#token");
    tokenInput.value = localStorage.getItem("bluePhoneToken") || "";
    function token() { return tokenInput.value.trim(); }
    function saveToken() { localStorage.setItem("bluePhoneToken", token()); }
    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { "content-type": "application/json", "x-blue-token": token(), ...(options.headers || {}) }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    }
    async function sendChat() {
      saveToken();
      const reply = document.querySelector("#reply");
      const message = document.querySelector("#message").value.trim();
      if (!message) {
        reply.textContent = "Type or speak a message first.";
        return;
      }
      reply.textContent = "Thinking...";
      try {
        const data = await api("/api/chat", {
          method: "POST",
          body: JSON.stringify({ message })
        });
        reply.textContent = data.reply;
        document.querySelector("#message").value = "";
      } catch (error) {
        reply.textContent = error.message;
      }
    }
    function voiceInput() {
      const reply = document.querySelector("#reply");
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reply.textContent = "Voice input is not supported in this browser. Try Chrome or Edge, or type the message.";
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { reply.textContent = "Listening on this device..."; };
      recognition.onerror = event => {
        reply.textContent = "Voice input failed: " + (event.error || "permission or browser issue");
      };
      recognition.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        document.querySelector("#message").value = transcript;
        reply.textContent = transcript ? "Heard: " + transcript : "I did not catch that.";
      };
      recognition.start();
    }
    async function loadApprovals() {
      saveToken();
      const container = document.querySelector("#approvals");
      container.textContent = "Loading...";
      try {
        const data = await api("/api/approvals");
        container.innerHTML = data.approvals.length ? "" : "<p class='hint'>No approval questions queued.</p>";
        for (const item of data.approvals) {
          const row = document.createElement("div");
          row.className = "approval";
          row.innerHTML = "<strong></strong><p></p><pre></pre><button>Approve</button><button class='secondary'>Deny</button>";
          row.querySelector("strong").textContent = item.kind + " - " + item.status;
          row.querySelector("p").textContent = item.summary;
          row.querySelector("pre").textContent = item.details || item.target || "";
          const buttons = row.querySelectorAll("button");
          buttons[0].onclick = () => answer(item.id, "approved");
          buttons[1].onclick = () => answer(item.id, "denied");
          container.append(row);
        }
      } catch (error) {
        container.textContent = error.message;
      }
    }
    async function answer(id, decision) {
      await api("/api/approvals/" + encodeURIComponent(id), {
        method: "POST",
        body: JSON.stringify({ decision })
      });
      await loadApprovals();
    }
  </script>
</body>
</html>`;
}

function phoneBridgeManifest() {
  return {
    name: "Project Blue Network Bridge",
    short_name: "Blue",
    description: "Chat with Project Blue and answer approval questions from trusted devices on your LAN.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
    ]
  };
}

function phoneBridgeIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#07111f"/>
  <circle cx="256" cy="214" r="122" fill="#1672b8"/>
  <circle cx="212" cy="194" r="18" fill="#eaf4ff"/>
  <circle cx="300" cy="194" r="18" fill="#eaf4ff"/>
  <path d="M190 280c38 34 94 34 132 0" fill="none" stroke="#eaf4ff" stroke-width="24" stroke-linecap="round"/>
  <path d="M122 390c44-58 88-86 134-86s90 28 134 86" fill="none" stroke="#54b4ff" stroke-width="32" stroke-linecap="round"/>
</svg>`;
}

function phoneBridgeServiceWorker() {
  return `const CACHE = "project-blue-phone-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(match => match || caches.match("/"))));
});`;
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 20000) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Request body must be JSON.")); }
    });
    request.on("error", reject);
  });
}

function sendBridgeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function bridgeAuthorized(request) {
  if (autonomySettings.phoneBridgeNoToken) return true;
  const supplied = String(request.headers["x-blue-token"] || "");
  if (!phoneBridgeToken || !supplied) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const tokenBuffer = Buffer.from(phoneBridgeToken);
  return suppliedBuffer.length === tokenBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, tokenBuffer);
}

async function handlePhoneBridgeRequest(request, response) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  try {
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(phoneBridgePage());
      return;
    }
    if (request.method === "GET" && url.pathname === "/manifest.webmanifest") {
      response.writeHead(200, { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(phoneBridgeManifest()));
      return;
    }
    if (request.method === "GET" && url.pathname === "/icon.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" });
      response.end(phoneBridgeIconSvg());
      return;
    }
    if (request.method === "GET" && url.pathname === "/sw.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end(phoneBridgeServiceWorker());
      return;
    }
    if (!bridgeAuthorized(request)) {
      sendBridgeJson(response, 401, { error: "Pairing token is required. Or enable tokenless bridge mode on the PC." });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      sendBridgeJson(response, 200, { ok: true, blue: "online", approvals: readPhoneApprovalQueue().length });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/approvals") {
      sendBridgeJson(response, 200, { approvals: readPhoneApprovalQueue() });
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/approvals/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) || "");
      const body = await readRequestJson(request);
      const record = updatePhoneApprovalStatus(id, String(body.decision || ""), body.note || "phone bridge");
      sendBridgeJson(response, 200, { approval: record });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readRequestJson(request);
      const message = validateChatMessage(body.message);
      const conversationId = await ensureConversation("Blue Phone Bridge");
      const reply = sanitizeArtifactClaims(cleanChat(
        await blue(["conversation-chat", conversationId, message])
      ));
      appendActivity(activityLedgerPath, "phone_bridge", "Phone chat completed", {
        inputCharacters: message.length,
        outputCharacters: reply.length
      });
      sendBridgeJson(response, 200, { reply });
      return;
    }
    sendBridgeJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendBridgeJson(response, 400, { error: error.message });
  }
}

function phoneBridgeStatus() {
  return {
    running: Boolean(phoneBridgeServer),
    url: phoneBridgeUrl,
    token: autonomySettings.phoneBridgeNoToken ? "" : phoneBridgeToken,
    tokenRequired: !autonomySettings.phoneBridgeNoToken,
    localAddress: localNetworkAddress(),
    note: autonomySettings.phoneBridgeNoToken
      ? "Open the URL on any trusted PC or phone while it is on the same network. No token is required. Blue runs on this PC; your modem/router only carries the LAN traffic."
      : "Open the URL on any trusted PC or phone while it is on the same network, then enter the pairing token. Blue runs on this PC; your modem/router only carries the LAN traffic."
  };
}

async function startPhoneBridge() {
  if (phoneBridgeServer) return phoneBridgeStatus();
  phoneBridgeToken = crypto.randomBytes(18).toString("base64url");
  const host = "0.0.0.0";
  const port = 8776;
  phoneBridgeServer = http.createServer((request, response) => {
    handlePhoneBridgeRequest(request, response);
  });
  await new Promise((resolve, reject) => {
    phoneBridgeServer.once("error", reject);
    phoneBridgeServer.listen(port, host, resolve);
  });
  phoneBridgeUrl = `http://${localNetworkAddress()}:${port}/`;
  appendActivity(activityLedgerPath, "phone_bridge", "Network bridge started", {
    url: phoneBridgeUrl
  });
  return phoneBridgeStatus();
}

async function stopPhoneBridge() {
  if (!phoneBridgeServer) return phoneBridgeStatus();
  const server = phoneBridgeServer;
  phoneBridgeServer = null;
  phoneBridgeUrl = "";
  phoneBridgeToken = "";
  await new Promise(resolve => server.close(resolve));
  appendActivity(activityLedgerPath, "phone_bridge", "Network bridge stopped");
  return phoneBridgeStatus();
}

async function createPhoneBridgeStarter() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = path.join(artifactDirectory, `phone-bridge-starter-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });
  const readmePath = path.join(folder, "README.md");
  const htmlPath = path.join(folder, "mobile.html");
  const configPath = path.join(folder, "bridge-config.json");
  fs.writeFileSync(readmePath, [
    "# Project Blue Phone Bridge Starter",
    "",
    "Goal: install a small phone app that talks to Blue on the PC and answers approval questions while away.",
    "",
    "First version scope:",
    "- Installable PWA-style app for Android Chrome and iPhone Safari.",
    "- Chat with the running desktop Blue app.",
    "- Show pending approvals, deep-research prompts, and security alerts.",
    "- Send approve/deny answers back to the PC.",
    "- Keep risky PC actions approval-gated.",
    "- Do not expose raw unrestricted computer control.",
    "",
    "Security rules:",
    "- Pair each phone with a one-time local pairing code.",
    "- Use a long random session token.",
    "- Bind locally by default; internet access needs a deliberate tunnel choice.",
    "- Never let a phone approve remote PC login, firewall/security changes, file deletion, credential access, or admin actions without a fresh explicit confirmation.",
    "",
    "Current bridge path: System > Safe PC Help > Start Phone Bridge.",
    "Install path: open the bridge URL on the phone, enter the pairing token, then use Install/Add to Home Screen."
  ].join("\n") + "\n", "utf8");
  fs.writeFileSync(configPath, JSON.stringify({
    name: "Project Blue Phone Bridge",
    version: 1,
    defaultHost: "127.0.0.1",
    defaultPort: 8776,
    features: ["chat", "approval_queue", "deep_research_prompt", "security_alerts"],
    unattendedDeniedActions: [
      "remote_pc_access",
      "firewall_change",
      "registry_change",
      "startup_change",
      "credential_access",
      "delete_files",
      "admin_actions"
    ]
  }, null, 2) + "\n", "utf8");
  fs.writeFileSync(htmlPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Project Blue Phone Bridge</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #07111f; color: #eaf4ff; }
    main { max-width: 680px; margin: 0 auto; padding: 18px; display: grid; gap: 12px; }
    h1 { margin: 0; color: #54b4ff; }
    section { border: 1px solid #294b68; border-radius: 8px; padding: 12px; background: #102238; }
    input, textarea, button { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 10px; border-radius: 8px; border: 1px solid #315676; }
    input, textarea { background: #07111f; color: white; }
    button { background: #1672b8; color: white; }
    .secondary { background: #263d52; }
    .hint { color: #9ab2c9; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>Project Blue</h1>
    <section>
      <strong>Pair Phone</strong>
      <input placeholder="Pairing code from the PC">
      <button>Pair</button>
      <p class="hint">Starter UI only. The desktop bridge server still needs to be built before this connects.</p>
    </section>
    <section>
      <strong>Ask Blue</strong>
      <textarea placeholder="Message Blue on your PC..."></textarea>
      <button>Send</button>
    </section>
    <section>
      <strong>Approval Queue</strong>
      <p class="hint">Deep research, app-building steps, and security alerts will appear here for approve/deny.</p>
      <button>Approve Selected</button>
      <button class="secondary">Deny Selected</button>
    </section>
  </main>
</body>
</html>
`, "utf8");
  rememberArtifact({
    path: htmlPath,
    title: "Project Blue phone bridge starter",
    kind: "html",
    source: "phone_bridge_starter",
    note: "Starter mobile companion UI and bridge plan."
  });
  await shell.openPath(folder);
  appendActivity(activityLedgerPath, "artifact", "Phone bridge starter created", {
    folder
  });
  return `Phone bridge starter created:\n${folder}\n\nIt includes a mobile HTML starter, bridge config, and README. Next step is building the paired local bridge server.`;
}

function normalizePcActionPath(value, { mustExist = false, forWrite = false } = {}) {
  const input = String(value || "").trim().replace(/^"|"$/g, "");
  if (!input || input.includes("\0")) throw new Error("Enter a valid local path.");
  const resolved = path.resolve(input);
  const guidelines = pcActionGuidelines();
  const blockedRoots = [
    process.env.WINDIR || "C:\\Windows",
    process.env.ProgramFiles || "C:\\Program Files",
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    process.env.ProgramData || "C:\\ProgramData"
  ].map(item => path.resolve(item).toLowerCase());
  const lower = resolved.toLowerCase();
  if (blockedRoots.some(root => lower === root || lower.startsWith(`${root}${path.sep}`))) {
    throw new Error("Blue will not change or launch from protected Windows/system folders.");
  }
  if (mustExist && !fs.existsSync(resolved)) throw new Error("That path does not exist.");
  if (forWrite) {
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      throw new Error("The destination folder must already exist.");
    }
    const realParent = fs.realpathSync(parent).toLowerCase();
    const allowed = guidelines.approvedWriteRoots
      .map(root => path.resolve(root).toLowerCase())
      .some(root => realParent === root || realParent.startsWith(`${root}${path.sep}`));
    if (!allowed) {
      throw new Error("File writes are limited to the approved folders shown in the guidelines.");
    }
    const extension = path.extname(resolved).toLowerCase();
    const textExtensions = new Set([
      ".txt", ".md", ".json", ".csv", ".log", ".html", ".css", ".js", ".cjs",
      ".mjs", ".py", ".yml", ".yaml", ".xml", ".svg"
    ]);
    const executableExtensions = new Set([
      ".exe", ".dll", ".msi", ".scr", ".lnk", ".reg", ".vbs", ".jar", ".com"
    ]);
    if (executableExtensions.has(extension)) {
      throw new Error("Blue will not create or edit executable/system-action files.");
    }
    if (!textExtensions.has(extension)) {
      throw new Error("Blue only edits known text file types in PC Actions.");
    }
    if (/(^|[._-])(secret|token|password|credential|key)([._-]|$)/i.test(path.basename(resolved))) {
      throw new Error("Blue will not edit files that look like secrets or credentials.");
    }
  }
  return resolved;
}

async function runPcAction(value) {
  const action = String(value?.action || "").trim();
  const target = String(value?.target || "").trim();
  const content = String(value?.content || "");
  const approved = Boolean(value?.approved);
  const allowTaskWithoutApprovals = Boolean(value?.allowTaskWithoutApprovals);
  const guidelines = pcActionGuidelines();
  const highRiskKind = highRiskActionHint(action, target, content);
  if (!guidelines.allowedActions.includes(action)) {
    if (autonomySettings.phoneApprovalQueue && autonomySettings.prepareHighRiskWhileWaiting) {
      const request = appendPhoneApprovalRequest({
        kind: highRiskKind || "unsupported_pc_action",
        summary: "Blue needs approval before preparing or running this PC action.",
        target,
        risk: "high",
        details: `Requested action: ${action || "(none)"}\nContent preview: ${content.slice(0, 800)}`
      });
      return `This is high-risk or unsupported, so I queued it for approval instead of running it.\nApproval id: ${request.id}\nKind: ${request.kind}\n\nI can keep preparing a plan while waiting, but I will not run this on the PC until you approve it.`;
    }
    throw new Error("Choose an allowed PC action.");
  }
  if (highRiskKind) {
    if (autonomySettings.phoneApprovalQueue && autonomySettings.prepareHighRiskWhileWaiting) {
      const request = appendPhoneApprovalRequest({
        kind: highRiskKind,
        summary: "Blue needs approval before this high-risk PC action can run.",
        target,
        risk: "high",
        details: `Requested action: ${action}\nContent preview: ${content.slice(0, 800)}`
      });
      return `I queued this high-risk task for approval instead of running it.\nApproval id: ${request.id}\nKind: ${request.kind}\n\nI can prepare the steps while waiting, but execution needs your approval.`;
    }
    throw new Error("That looks high-risk. Turn on high-risk approval queueing or use a safer action.");
  }
  if (action === "open_url") {
    const url = parseHttpUrl(target);
    await shell.openExternal(url.href);
    appendActivity(activityLedgerPath, "pc_action", "Opened web link", { host: url.host });
    return `Opened link: ${url.href}`;
  }
  if (action === "open_path") {
    const resolved = normalizePcActionPath(target, { mustExist: true });
    const error = await shell.openPath(resolved);
    if (error) throw new Error(error);
    rememberArtifact({
      path: resolved,
      title: path.basename(resolved),
      kind: fs.statSync(resolved).isDirectory() ? "folder" : artifactKindForPath(resolved),
      source: "pc_action",
      note: "Opened by Blue as a visible result."
    });
    appendActivity(activityLedgerPath, "pc_action", "Opened local path", { path: resolved });
    return `Opened: ${resolved}`;
  }
  const lowRiskTaskWaiver = allowTaskWithoutApprovals
    && autonomySettings.awayMode
    && autonomySettings.autoLowRiskTasks
    && ["create_text_file", "append_text_file", "overwrite_text_file"].includes(action);
  const fullControlWaiver = fullControlActive()
    && ["create_text_file", "append_text_file", "overwrite_text_file"].includes(action);
  if (!approved && !lowRiskTaskWaiver && !fullControlWaiver) {
    throw new Error("Tick the approval checkbox, or enable Away Rules and the low-risk task option before Blue writes a file.");
  }
  if (content.length > 100000) throw new Error("PC Action file content is limited to 100,000 characters.");
  const resolved = normalizePcActionPath(target, { forWrite: true });
  if (action === "create_text_file" && fs.existsSync(resolved)) {
    throw new Error("That file already exists. Use append or overwrite if you really want to change it.");
  }
  if ((action === "append_text_file" || action === "overwrite_text_file") && !fs.existsSync(resolved)) {
    throw new Error("That file does not exist yet. Use create file first.");
  }
  if (action === "create_text_file") fs.writeFileSync(resolved, content, "utf8");
  if (action === "append_text_file") fs.appendFileSync(resolved, content, "utf8");
  if (action === "overwrite_text_file") fs.writeFileSync(resolved, content, "utf8");
  appendActivity(activityLedgerPath, "pc_action", `Completed ${action}`, {
    path: resolved,
    bytes: Buffer.byteLength(content, "utf8"),
    approval: approved ? "explicit_checkbox" : (fullControlWaiver ? "full_control_session" : "low_risk_task_waiver")
  });
  rememberArtifact({
    path: resolved,
    title: path.basename(resolved),
    kind: artifactKindForPath(resolved),
    source: "pc_action",
    note: "Blue finished writing this result. Use Show Latest Result to inspect it."
  });
  return `Completed ${action.replace(/_/g, " ")}:\n${resolved}\n\nResult is ready. Use Show Latest Result to inspect it.`;
}

function cleanChat(output) {
  return output.replace(/\r\n/g, "\n").split("\nPolicy:", 1)[0].trim();
}

function parseConversations(output) {
  if (!output || output === "No named conversations.") return [];
  const seenTitles = new Set();
  return output.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(\S+)\s{2}(.+?)\s{2}updated=(.+)$/);
    if (!match || seenTitles.has(match[2])) return [];
    seenTitles.add(match[2]);
    return [{ id: match[1], title: match[2], updatedAt: match[3] }];
  });
}

async function ensureConversation(title) {
  let rows = parseConversations(await blue(["conversations"]));
  let existing = rows.find(row => row.title === title);
  if (existing) return existing.id;
  await blue(["conversation-create", title]);
  rows = parseConversations(await blue(["conversations"]));
  existing = rows.find(row => row.title === title);
  if (!existing) throw new Error(`Blue could not open the ${title} conversation.`);
  return existing.id;
}

const discordAddon = new DiscordAddon({
  askBlue: async prompt => {
    const conversationId = await ensureConversation("Blue Discord");
    return cleanChat(await blue(["conversation-chat", conversationId, prompt]));
  },
  blueStatus: async () =>
    `Blue is online locally. Presence: ${presenceSnapshot().state}. `
    + `Vision: off. Automatic capture: off. Desktop ${desktopVersion}.`,
  onStatus: status => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send("blue:discord-status", status);
    }
  }
});
discordAddon.configure(discordConfig);
blueFeatureService.attach({
  memory: {
    status: async () => ({ conversations: parseConversations(await blue(["conversations"])).length, currentConversation }),
    summarize: value => `${value.conversations} conversation(s); active: ${value.currentConversation}.`
  },
  bluemesh: { status: async () => blueMeshStatusSummary(), summarize: value => value.installed ? "Installed; trusted sync is approval-gated." : "Not installed." },
  discord: { status: async () => discordAddon.status(), summarize: value => value.connected ? "Connected." : "Disconnected; token remains session-only." },
  streaming: { status: async () => ({ config: sanitizeStreamingConfig(streamingConfig), policy: streamingPolicySummary(streamingConfig), preflight: buildStreamingPreflight(streamingConfig) }), summarize: value => `${value.config.platform || "No platform"}; ${value.config.streamMode || "mode not selected"}.` },
  voice: { status: async () => ({ ...voiceSettings, listening: microphoneListening }), summarize: value => value.enabled === false ? "Voice disabled." : "Voice configured; microphone use is explicit." },
  vision: { status: async () => presenceSnapshot(), summarize: value => `Presence ${value.state}; automatic capture remains off.` },
  companion: { status: async () => ({ model: currentVtuberModel(), presence: presenceSnapshot(), visible: Boolean(petWindow && !petWindow.isDestroyed()) }), summarize: value => `${value.visible ? "Visible" : "Hidden"}; model ${value.model?.name || value.model?.id || "default"}.` },
  research: { status: async () => ({ catalog: await blue(["research-catalog"]), records: readLearningRecords().length }), summarize: value => `${value.records} saved learning/research record(s).` },
  ideas: { status: async () => ({ capability: "Blue Laboratory", approvalRequiredForChanges: true }), actions: { capture: async value => appendLearningRecord(String(value || "Untitled idea"), "idea", "Captured through the unified Blue workbench.") } },
  generated: { status: async () => artifactPreviewPayload(), summarize: value => value?.exists ? `Latest result: ${value.name || value.path}.` : "No generated result is currently recorded." },
  workflows: { status: async () => ({ agent: normalizeAgentState(agentState), approvals: "required for sensitive execution" }), actions: { plan: async value => createAgentPlan(String(value || "Creator workflow"), "blue_workbench") } }
});
workspaceAgent.attachServices({ blue: blueFeatureService });

async function shareNote(note) {
  return cleanChat(await blue(["conversation-chat", "Blue Desktop Pet", note]));
}

async function preserveSharedFile(filePath) {
  const inbox = path.join(appRoot, ".blue", "shared_inbox");
  await fs.promises.mkdir(inbox, { recursive: true });
  const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._ -]/g, "_");
  const target = path.join(inbox, `${crypto.randomUUID()}-${safeName}`);
  await fs.promises.copyFile(filePath, target);
  return target;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", data => digest.update(data));
    stream.on("error", reject);
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

async function recordSharedImage(filePath, preservedPath, analysis = {}) {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > 104857600) {
    throw new Error(`Images are limited to 100 MB: ${path.basename(filePath)}`);
  }
  const image = nativeImage.createFromPath(filePath);
  const size = image.isEmpty() ? null : image.getSize();
  const digest = await hashFile(filePath);
  appendObservation(observationLedgerPath, {
    id: crypto.randomUUID(),
    name: path.basename(filePath),
    preservedPath,
    width: size?.width,
    height: size?.height,
    sha256: digest,
    interpretation: analysis.interpretation,
    provider: analysis.provider,
    extractedText: analysis.extractedText
  });
  return { size, digest };
}

async function handleSharedPaths(paths) {
  const normalizedPaths = normalizeSharedPaths(paths);
  const textTypes = new Set([".txt", ".md", ".json", ".csv", ".py"]);
  const imageTypes = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
  const notes = [];
  for (const filePath of normalizedPaths) {
    const stat = fs.statSync(filePath);
    const lowerName = path.basename(filePath).toLowerCase();
    const isLive2DAsset = lowerName.endsWith(".psd")
      || lowerName.endsWith(".moc3")
      || lowerName.endsWith(".model3.json");
    if (stat.isDirectory()) {
      const name = `Shared ${path.basename(filePath)} ${Date.now()}`;
      await blue(["workspace-add", name, filePath]);
      rememberSharedItem({
        path: filePath,
        originalPath: filePath,
        name: path.basename(filePath),
        kind: folderLooksLikeLive2DParts(filePath) ? "folder" : "folder",
        note: folderLooksLikeLive2DParts(filePath)
          ? "Shared folder appears to contain separated Live2D parts."
          : "Shared folder available as read-only context."
      });
      notes.push(`Folder shared read-only as '${name}'.\n${await blue(["workspace-index", name])}`);
    } else if (isLive2DAsset) {
      const preserved = await preserveSharedFile(filePath);
      rememberSharedItem({
        path: preserved,
        originalPath: filePath,
        name: path.basename(filePath),
        kind: "live2d_asset",
        note: "Shared file is a Live2D rigging asset."
      });
      notes.push(await shareNote(
        `[Shared Live2D rigging asset] ${path.basename(filePath)} preserved locally at ${preserved}. `
        + "Blue can use this for the Live2D rigging workflow."
      ));
    } else if (textTypes.has(path.extname(filePath).toLowerCase())) {
      try { notes.push(await blue(["source-add", filePath])); }
      catch (error) {
        notes.push(`Could not index ${path.basename(filePath)}: ${error.message}`);
      }
    } else if (imageTypes.has(path.extname(filePath).toLowerCase())) {
      const preserved = await preserveSharedFile(filePath);
      const { size, digest } = await recordSharedImage(filePath, preserved);
      rememberSharedItem({
        path: preserved,
        originalPath: filePath,
        name: path.basename(filePath),
        kind: "image",
        note: "Shared image available as chat context. It is not the base model reference unless explicitly selected."
      });
      rememberArtifact({
        title: path.basename(filePath),
        path: preserved,
        kind: "image",
        source: "shared_image",
        note: "Shared image. Use it as reference only if you explicitly choose it."
      });
      notes.push(await shareNote(
        `[Shared image] ${path.basename(filePath)} preserved locally at ${preserved}. `
        + `${size ? `Dimensions: ${size.width}x${size.height}. ` : ""}`
        + `SHA-256: ${digest}. `
        + "This image is available in chat as shared context. It has not replaced the base outfit/model reference. "
        + "Say 'use the dropped image as the base reference' or click 'Use Latest Result as Reference' if that is what you want. "
        + "Say 'use the dropped image as the outfit reference' when this is the second clothing/style photo for an outfit edit. "
        + "Blue recorded this user-selected share in Observation History. "
        + "No automatic screen capture occurred and no vision model analyzed it."
      ));
    } else {
      const preserved = await preserveSharedFile(filePath);
      rememberSharedItem({
        path: preserved,
        originalPath: filePath,
        name: path.basename(filePath),
        kind: "file",
        note: "Shared file available as chat context."
      });
      notes.push(await shareNote(
        `[Shared file] ${path.basename(filePath)} preserved locally at ${preserved}`
      ));
    }
  }
  appendActivity(activityLedgerPath, "sharing", `Shared ${normalizedPaths.length} local item(s)`, {
    count: normalizedPaths.length,
    automaticCapture: false
  });
  return notes.join("\n");
}

function virtualWorkArea() {
  const displays = screen.getAllDisplays()
    .map(display => display.workArea)
    .filter(area => [area.x, area.y, area.width, area.height].every(Number.isFinite));
  if (!displays.length) {
    const primary = screen.getPrimaryDisplay()?.workArea;
    if (primary) {
      return {
        left: primary.x,
        top: primary.y,
        right: primary.x + primary.width,
        bottom: primary.y + primary.height
      };
    }
    return null;
  }
  return {
    left: Math.min(...displays.map(area => area.x)),
    top: Math.min(...displays.map(area => area.y)),
    right: Math.max(...displays.map(area => area.x + area.width)),
    bottom: Math.max(...displays.map(area => area.y + area.height))
  };
}

function signalLocomotion(
  mode,
  direction = { x: 0, y: 0 },
  speed = 0,
  dynamics = {}
) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const moving = mode === "walk" || mode === "run";
  if (moving !== lastWalkingSignal) {
    lastWalkingSignal = moving;
    petWindow.webContents.send("pet:walking", moving);
  }
  petWindow.webContents.send("pet:motion", {
    x: direction.x,
    y: direction.y,
    speed,
    mode,
    turn: Number(dynamics.turn) || 0,
    braking: Boolean(dynamics.braking)
  });
  setPresenceBase(mode);
}

function chooseRoamTarget(forcedMode = null) {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const bounds = petWindow.getBounds();
  const areas = screen.getAllDisplays()
    .map(display => display.workArea)
    .filter(area => [area.x, area.y, area.width, area.height].every(Number.isFinite))
    .filter(area => area.width >= bounds.width + 20 && area.height >= bounds.height + 20);
  if (!areas.length) return false;

  // Usually stay on this display, but sometimes take a longer trip to another screen.
  const current = screen.getDisplayMatching(bounds)?.workArea;
  const useAnotherDisplay = areas.length > 1 && Math.random() < 0.24;
  const area = useAnotherDisplay
    ? areas[Math.floor(Math.random() * areas.length)]
    : (current || areas[0]);
  const margin = 10;
  const minX = area.x + margin;
  const maxX = area.x + area.width - bounds.width - margin;
  const minY = area.y + 34;
  const maxY = area.y + area.height - bounds.height - margin;
  const currentY = Number.isFinite(roamPosition?.y) ? roamPosition.y : bounds.y;
  const freeY = minY + Math.random() * Math.max(0, maxY - minY);
  const nearbyY = Math.max(minY, Math.min(maxY, currentY + (Math.random() - 0.5) * 180));
  roamTarget = {
    x: minX + Math.random() * Math.max(0, maxX - minX),
    // Most trips read as grounded horizontal travel; occasional larger vertical
    // trips still let Blue explore the whole desktop and cross displays.
    y: Math.random() < 0.72 ? nearbyY : freeY
  };
  const profile = proactivityProfile(presenceSettings.proactivity);
  locomotion = forcedMode || (Math.random() < profile.runChance ? "run" : "walk");
  return true;
}

function startWandering() {
  clearInterval(wanderTimer);
  lastWanderTick = Date.now();
  wanderTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const now = Date.now();
    const delta = Math.min((now - lastWanderTick) / 1000, 0.1);
    lastWanderTick = now;

    if (!wandering) {
      locomotion = "idle";
      roamTarget = null;
      roamPosition = null;
      roamVelocity = { x: 0, y: 0 };
      signalLocomotion("idle");
      return;
    }
    if (now < phaseUntil) {
      signalLocomotion("idle");
      return;
    }

    const bounds = petWindow.getBounds();
    if (!roamPosition) roamPosition = { x: bounds.x, y: bounds.y };
    if (!roamTarget && !chooseRoamTarget(requestedLocomotion)) return;
    requestedLocomotion = null;

    const profile = locomotion === "run"
      ? { maxSpeed: 210, acceleration: 520, deceleration: 620, arrivalRadius: 3 }
      : { maxSpeed: 82, acceleration: 235, deceleration: 330, arrivalRadius: 3 };
    const movement = advanceLocomotion(
      { position: roamPosition, velocity: roamVelocity },
      roamTarget,
      delta,
      profile
    );
    if (![movement.position.x, movement.position.y, movement.speed].every(Number.isFinite)) {
      roamPosition = null;
      roamVelocity = { x: 0, y: 0 };
      roamTarget = null;
      return;
    }
    roamPosition = movement.position;
    roamVelocity = movement.velocity;
    if (movement.arrived) {
      roamTarget = null;
      locomotion = "idle";
      const profile = proactivityProfile(presenceSettings.proactivity);
      phaseUntil = now + profile.pauseMinMs + Math.random() * profile.pauseRangeMs;
      signalLocomotion("idle");
      if (Math.random() < profile.arrivalActionChance) {
        const arrivalActions = ["wave", "smile", "look", "lean"];
        const arrivalAction = arrivalActions[Math.floor(Math.random() * arrivalActions.length)];
        petWindow.webContents.send("pet:action", arrivalAction);
        setPresenceOverride(arrivalAction);
      }
      return;
    }

    const nextX = Math.round(roamPosition.x);
    const nextY = Math.round(roamPosition.y);
    if (!Number.isSafeInteger(nextX) || !Number.isSafeInteger(nextY)) {
      roamPosition = null;
      roamVelocity = { x: 0, y: 0 };
      roamTarget = null;
      return;
    }
    try {
      petWindow.setPosition(nextX, nextY, false);
      signalLocomotion(
        locomotion,
        movement.direction,
        movement.speed,
        { turn: movement.turn, braking: movement.braking }
      );
    } catch (error) {
      wandering = false;
      locomotion = "idle";
      roamVelocity = { x: 0, y: 0 };
      roamTarget = null;
      signalLocomotion("idle");
      console.error("Blue roaming paused after a position error:", error);
    }
  }, 16);
}

function schedulePetRecovery(reason) {
  if (quitting || petRecoveryTimer) return;
  const now = Date.now();
  petRecoveryAttempts = petRecoveryAttempts.filter(value => now - value < 60000);
  if (petRecoveryAttempts.length >= 3) {
    appendActivity(activityLedgerPath, "system", "Pet recovery paused after repeated failures", {
      reason,
      attemptsInLastMinute: petRecoveryAttempts.length
    });
    return;
  }
  petRecoveryAttempts.push(now);
  appendActivity(activityLedgerPath, "system", "Pet renderer recovery scheduled", {
    reason,
    attempt: petRecoveryAttempts.length
  });
  petRecoveryTimer = setTimeout(() => {
    petRecoveryTimer = null;
    if (quitting) return;
    if (!petWindow || petWindow.isDestroyed()) {
      createPetWindow();
    } else {
      petWindow.loadFile("pet.html");
    }
  }, 800);
}

function scheduleControlRecovery(reason) {
  if (quitting || controlRecoveryTimer) return;
  const now = Date.now();
  controlRecoveryAttempts = controlRecoveryAttempts.filter(
    value => now - value < 60000
  );
  if (controlRecoveryAttempts.length >= 3) {
    appendActivity(activityLedgerPath, "system", "Control recovery paused after repeated failures", {
      reason,
      attemptsInLastMinute: controlRecoveryAttempts.length
    });
    return;
  }
  controlRecoveryAttempts.push(now);
  controlRecoveryTimer = setTimeout(() => {
    controlRecoveryTimer = null;
    if (quitting) return;
    if (!controlWindow || controlWindow.isDestroyed()) createControlWindow();
    else controlWindow.loadFile("index.html");
  }, 800);
}

function secureWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", event => event.preventDefault());
  contents.on("will-attach-webview", event => event.preventDefault());
}

function createApplicationMenu() {
  const template = [
    {
      label: "Project Blue",
      submenu: [
        { label: "Show Control Center", click: () => showControl() },
        { label: "Minimize Control Center", click: () => controlWindow?.hide() },
        { type: "separator" },
        { label: "Quit Blue", click: () => {
          quitting = true;
          app.quit();
        } }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload Control Center" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle Full Screen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        { label: "Open Blue Folder", click: () => shell.openPath(appRoot) },
        { label: "Run diagnostics in Chat", click: () => {
          showControl();
          controlWindow?.webContents.executeJavaScript(
            'selectTab("chat"); document.querySelector("#chatRunAudit")?.click();'
          ).catch(() => {});
        } }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const petWidth = Math.min(330, area.width);
  const petHeight = Math.min(560, area.height);
  petWindow = new BrowserWindow({
    title: "Blue 3D Pet - OBS Capture",
    width: petWidth,
    height: petHeight,
    x: area.x + area.width - petWidth - 20,
    y: area.y + area.height - petHeight,
    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      backgroundThrottling: false
    }
  });
  secureWebContents(petWindow.webContents);
  petWindow.setContentProtection(false);
  petWindow.loadFile("pet.html");
  petWindow.webContents.on("did-finish-load", () => {
    broadcastPresence();
    broadcastWanderState();
  });
  petWindow.webContents.on("render-process-gone", (_event, details) => {
    schedulePetRecovery(`renderer-${details.reason || "gone"}`);
  });
  petWindow.on("unresponsive", () => schedulePetRecovery("unresponsive"));
  petWindow.on("move", () => {
    if (!petWindow || petWindow.isDestroyed() || locomotion !== "idle") return;
    const bounds = petWindow.getBounds();
    roamPosition = { x: bounds.x, y: bounds.y };
    roamVelocity = { x: 0, y: 0 };
  });
  petWindow.on("closed", () => {
    petWindow = null;
  });
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    title: "Project Blue Control Center",
    width: 1280,
    height: 780,
    minWidth: 900,
    minHeight: 540,
    show: true,
    frame: true,
    resizable: true,
    minimizable: true,
    backgroundColor: "#07111f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  });
  secureWebContents(controlWindow.webContents);
  controlWindow.loadFile("index.html");
  controlWindow.webContents.on("did-finish-load", () => {
    broadcastPresence();
    broadcastWanderState();
  });
  controlWindow.webContents.on("render-process-gone", (_event, details) => {
    appendActivity(activityLedgerPath, "system", "Control panel renderer restarted", {
      reason: details.reason || "gone"
    });
    scheduleControlRecovery(`renderer-${details.reason || "gone"}`);
  });
  controlWindow.on("focus", () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.setAlwaysOnTop(false);
  });
  controlWindow.on("blur", () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.setAlwaysOnTop(true);
  });
  controlWindow.on("unresponsive", () => scheduleControlRecovery("unresponsive"));
  controlWindow.on("close", event => {
    if (!quitting) {
      quitting = true;
      app.quit();
    }
  });
}

function showControl() {
  if (!controlWindow || controlWindow.isDestroyed()) createControlWindow();
  if (petWindow && !petWindow.isDestroyed()) petWindow.setAlwaysOnTop(false);
  controlWindow.show();
  controlWindow.restore();
  controlWindow.focus();
}

function createTray() {
  const iconPath = path.join(appRoot, "src", "project_blue", "data", "blue_avatar.png");
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }));
  tray.setToolTip("Project Blue");
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Show Blue",
      click: () => {
        if (!petWindow || petWindow.isDestroyed()) createPetWindow();
        else petWindow.show();
      }
    },
    { label: "Open Control Panel", click: showControl },
    {
      label: wandering ? "Pause Wandering" : "Resume Wandering",
      click: () => {
        wandering = !wandering;
        if (!wandering) signalLocomotion("idle");
        broadcastPresence();
        broadcastWanderState();
        rebuild();
      }
    },
    { type: "separator" },
    {
      label: "Quit Blue",
      click: () => { quitting = true; app.quit(); }
    }
  ]));
  rebuild();
  tray.on("double-click", showControl);
}

function isTrustedSender(event) {
  return [petWindow, controlWindow].some(window =>
    window
    && !window.isDestroyed()
    && !window.webContents.isDestroyed()
    && event.sender.id === window.webContents.id
  );
}

function trustedHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error("Blue rejected a request from an untrusted window.");
    }
    return handler(event, ...args);
  });
}

function trustedOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    handler(event, ...args);
  });
}


async function maybeHandleWorkspaceAgentChat(message) {
  const result = await workspaceAgent.handleMessage(message);
  if (!result) return null;
  return formatWorkspaceAgentResult(result);
}
function registerHandlers() {
  trustedHandle("blue:chat", async (_event, message) => {
    const validatedMessage = validateChatMessage(message);
    rememberChatTurn("user", validatedMessage);
    const workspaceAgentReply = await maybeHandleWorkspaceAgentChat(validatedMessage);
    if (workspaceAgentReply) {
      rememberChatTurn("assistant", workspaceAgentReply);
      return workspaceAgentReply;
    }
    if (detectFullControlRevokeRequest(validatedMessage)) {
      const status = revokeFullControlSession("chat");
      const reply = "Full Control is now off. I will go back to normal approval rules.";
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectFullControlGrantRequest(validatedMessage)) {
      const status = grantFullControlSession(60, "chat");
      const reply = [
        "Full Control session granted for allowed local tasks.",
        `It expires at ${status.fullControlUntil}.`,
        "I can continue allowed local work without repeated prompts during this session.",
        "High-risk actions like security changes, credential access, remote PC access, admin actions, registry/startup edits, deletes, and executables still go to the approval queue."
      ].join(" ");
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectNetworkBridgeStopRequest(validatedMessage)) {
      const status = await stopPhoneBridge();
      const reply = "Network bridge stopped. Blue is no longer being served to other LAN devices from this app.";
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectNetworkBridgeStartRequest(validatedMessage)) {
      const status = await startPhoneBridge();
      const reply = [
        "Network bridge is running for trusted devices on your LAN.",
        `Open this URL from another PC or phone: ${status.url}`,
        status.tokenRequired ? `Pairing token: ${status.token}` : "Pairing token: not required by your current settings.",
        "Voice works from that device only after someone opens the page, clicks Voice Input, and grants mic permission.",
        "This does not secretly listen to network microphones or expose raw unrestricted PC control."
      ].join("\n");
      rememberChatTurn("assistant", reply);
      return reply;
    }
    const selfLearningToggle = detectSelfLearningToggleRequest(validatedMessage);
    if (selfLearningToggle) {
      if (selfLearningToggle === "enable") {
        autonomySettings = normalizeAutonomySettings({
          ...autonomySettings,
          selfLearningSuggestions: true
        });
        saveJsonAtomic(autonomySettingsPath, autonomySettings);
        const reply = [
          "Self-learning suggestions are now on.",
          "I can save topics I think Project Blue may need to learn, but I will still ask before deep research.",
          saveSelfLearningSuggestions(validatedMessage)
        ].join("\n");
        rememberChatTurn("assistant", reply);
        return reply;
      }
      if (selfLearningToggle === "disable") {
        autonomySettings = normalizeAutonomySettings({
          ...autonomySettings,
          selfLearningSuggestions: false
        });
        saveJsonAtomic(autonomySettingsPath, autonomySettings);
        const reply = "Self-learning suggestions are now off. I will only learn topics you directly ask for.";
        rememberChatTurn("assistant", reply);
        return reply;
      }
      const reply = autonomySettings.selfLearningSuggestions
        ? "Self-learning suggestions are on. I can save suggested learning topics, then ask before deep research."
        : "Self-learning suggestions are off. Say 'turn on self learning' if you want Blue to suggest topics it may need to know.";
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectSelfLearningSuggestionRequest(validatedMessage)) {
      const reply = saveSelfLearningSuggestions(validatedMessage);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    const matureOutfitMode = detectMatureOutfitModeRequest(validatedMessage);
    if (matureOutfitMode) {
      if (matureOutfitMode === "enable") {
        saveMatureOutfitSettings({ enabled: true });
        const reply = formatMatureOutfitSettings();
        rememberChatTurn("assistant", reply);
        return reply;
      }
      if (matureOutfitMode === "disable") {
        saveMatureOutfitSettings({ enabled: false });
        const reply = formatMatureOutfitSettings();
        rememberChatTurn("assistant", reply);
        return reply;
      }
      const reply = formatMatureOutfitSettings();
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectSelfImprovementRequest(validatedMessage)) {
      autonomySettings = normalizeAutonomySettings({
        ...autonomySettings,
        selfLearningSuggestions: true,
        selfImprovementProposals: true
      });
      saveJsonAtomic(autonomySettingsPath, autonomySettings);
      const reply = createSelfImprovementProposal(validatedMessage);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectMiniMaxAgentRequest(validatedMessage)) {
      if (!agentState) createAgentPlan(agentGoalFromMessage(validatedMessage), "chat_minimax");
      const state = runMiniMaxAgentDecision();
      const reply = [
        "MiniMax agent is active.",
        "It picked the next step by maximizing useful progress and minimizing risk/cost.",
        "",
        formatAgentState(state)
      ].join("\n");
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectAgentRequest(validatedMessage)) {
      const state = createAgentPlan(agentGoalFromMessage(validatedMessage), "chat");
      const reply = [
        "Agent mode is now inside Project Blue.",
        "It can plan, research, track steps, queue approvals, and route work through safe Project Blue tools.",
        "It will not silently download, install, delete, change security settings, or control accounts.",
        "",
        formatAgentState(state)
      ].join("\n");
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectMissingArtifactRequest(validatedMessage)) {
      const reply = await replyWithLatestArtifact();
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectTaskDoneRequest(validatedMessage)) {
      const reply = await replyWithLatestArtifact();
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detect2DModelArtRequest(validatedMessage)) {
      const reply = await handle2DModelArtRequest(validatedMessage)
        .catch(error => artifactFailureReply("2D model art kit", error));
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectPsdCmo3OutfitRequest(validatedMessage)) {
      const reply = [
        "I need to be precise: Project Blue cannot currently write a real layered PSD or real CMO3 file by itself.",
        "What it can create now is a visual outfit preview plus a folder of same-canvas transparent PNG outfit parts with a manifest/checklist.",
        "Those are real files that can be used toward Live2D work, but CMO3 requires Live2D Cubism project creation/export and should not be claimed unless that file actually exists.",
        "Ask me to make the outfit, and I will save the real preview and rig-ready PNG parts under Project Blue's .blue\\artifacts folder."
      ].join(" ");
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectUseSharedAsOutfitStyleRequest(validatedMessage)) {
      const reply = setLatestSharedImageAsOutfitStyleReference();
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectUseSharedAsBaseRequest(validatedMessage)) {
      const reply = setLatestSharedImageAsReference();
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectLearnAndImplementRequest(validatedMessage)) {
      const reply = await handleLearnAndImplementRequest(validatedMessage);
      sendPetBubble("Implementation plan saved", 6000);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    const learningTopic = resolveLearningRequestTopic(validatedMessage);
    if (learningTopic) {
      const record = appendLearningRecord(learningTopic, "chat", validatedMessage);
      const name = displayAssistantName(record.assistantName);
      let queuedDeepResearch = null;
      let queuedToolDownloads = null;
      if (autonomySettings.phoneApprovalQueue && autonomySettings.askBeforeDeepResearch) {
        queuedDeepResearch = appendPhoneApprovalRequest({
          kind: "deep_research",
          summary: `Start deep research for: ${record.topic}`,
          target: record.topic,
          risk: "medium",
          details: "Blue will collect trusted sources, summaries, notes, and next-step plans. This may take a long time and use the internet."
        });
      }
      if (autonomySettings.phoneApprovalQueue && detectLearningToolDownloadRequest(validatedMessage)) {
        queuedToolDownloads = appendPhoneApprovalRequest({
          kind: "tool_downloads_for_learning",
          summary: `Approve tool/download planning for: ${record.topic}`,
          target: record.topic,
          risk: "high",
          details: "Blue may research needed tools such as Live2D Cubism, VTube Studio, PSD/art tools, examples, SDK docs, or Blender-related tools. Blue should present official download links and wait for approval before downloading or installing anything."
        });
      }
      if (autonomySettings.askBeforeDeepResearch) {
        controlWindow?.webContents.send("blue:deep-research-prompt", {
          topic: record.topic,
          recordId: record.id
        });
        const reply = [
          `Yes. I saved a learning request for ${name}: ${record.topic}.`,
          "I did not start deep web research yet because Away Rules say to ask first.",
          "I opened a prompt on this PC so you can start deep search now or leave it for later.",
          queuedDeepResearch
            ? `I queued deep research approval for your phone bridge: ${queuedDeepResearch.id}.`
            : "You can also turn on the phone approval queue in Safe PC Help.",
          queuedToolDownloads
            ? `I also queued tool/download approval for your phone bridge: ${queuedToolDownloads.id}.`
            : "I will not download or install tools silently."
        ].join(" ");
        sendPetBubble(`Learning saved: ${record.topic}`, 6000);
        rememberChatTurn("assistant", reply);
        return reply;
      }
      const research = await researchLearningTopic(record.topic);
      const reply = [
        `Yes. I saved a learning request for ${name}: ${record.topic}.`,
        `I also ran a deep web research pass, saved ${research.sources.length} source(s), and read ${research.pagesRead || 0} webpage(s).`,
        research.sources.length
          ? "I saved source links, readable webpage summaries, and notes in the Learning Queue."
          : "I could not collect usable sources this time, so the topic still needs research.",
        "I will treat this as something to research deeper, test, and turn into notes first.",
        "If you later ask me to build it into Project Blue, I will use those notes but still make normal code changes with checks and approval guardrails."
      ].join(" ");
      sendPetBubble(`Learning: ${record.topic}`, 6000);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectCubismEditorRequest(validatedMessage) || detect2DRiggingRequest(validatedMessage)) {
      const reply = await handle2DRiggingRequest(validatedMessage)
        .catch(error => artifactFailureReply("Live2D rigging handoff", error));
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectOutfitOptionsRequest(validatedMessage)) {
      const reply = await createOutfitOptionsArtifacts(validatedMessage)
        .catch(error => artifactFailureReply("outfit options", error));
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectOutfitPreviewRequest(validatedMessage)) {
      const reply = await createOutfitPreviewArtifact(validatedMessage)
        .catch(error => artifactFailureReply("outfit preview", error));
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectFirewallBuildRequest(validatedMessage)) {
      const record = appendLearningRecord(
        "build an approval-gated firewall module",
        "chat",
        validatedMessage
      );
      const research = await researchLearningTopic("build a firewall");
      const reply = [
        "I can help with that, but not by silently changing Windows Firewall from normal chat.",
        `I saved a learning/build request and ran deep firewall research with ${research.sources.length} source(s).`,
        "Safe path: first I draft the firewall goal, rules, profiles, logging, rollback plan, and tests.",
        "Then I can help build an approval-gated Project Blue firewall module that shows the exact commands or code before anything changes on the PC.",
        "Direct firewall changes should require explicit approval, audit logs, and a rollback option."
      ].join(" ");
      sendPetBubble("Firewall plan saved", 6000);
      appendActivity(activityLedgerPath, "learning", "Firewall build request captured", {
        recordId: record.id,
        sourceCount: research.sources.length
      });
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectLearningSourcesRequest(validatedMessage)) {
      const reply = formatLearningSourcesForMessage(validatedMessage);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    if (detectLearningSummaryRequest(validatedMessage)) {
      const reply = formatLearningAnswerForMessage(validatedMessage);
      rememberChatTurn("assistant", reply);
      return reply;
    }
    const reply = sanitizeArtifactClaims(cleanChat(
      await blue(["conversation-chat", currentConversation, validatedMessage])
    ));
    appendActivity(activityLedgerPath, "conversation", "Conversation turn completed", {
      inputCharacters: validatedMessage.length,
      outputCharacters: reply.length
    });
    rememberChatTurn("assistant", reply);
    return reply;
  });
  trustedHandle("blue:ensure-session", async () => {
    currentConversation = await ensureConversation("Blue Desktop Pet");
    return "Blue Desktop Pet session resumed.";
  });
  trustedHandle("blue:conversations", async () => ({
    current: currentConversation,
    conversations: parseConversations(await blue(["conversations"]))
  }));
  trustedHandle("blue:conversation-create", async (_event, value) => {
    const title = String(value || "").replace(/\s+/g, " ").trim();
    if (!title || title.length > 120) {
      throw new Error("Conversation names must be between 1 and 120 characters.");
    }
    currentConversation = await ensureConversation(title);
    clearRecentChatTurns(currentConversation);
    appendActivity(activityLedgerPath, "conversation", "Named conversation opened", {
      titleLength: title.length
    });
    return {
      current: currentConversation,
      conversations: parseConversations(await blue(["conversations"]))
    };
  });
  trustedHandle("blue:conversation-select", async (_event, value) => {
    const id = String(value || "").trim();
    const rows = parseConversations(await blue(["conversations"]));
    const selected = rows.find(row => row.id === id);
    if (!selected) throw new Error("Conversation was not found.");
    currentConversation = selected.id;
    clearRecentChatTurns(currentConversation);
    return {
      current: currentConversation,
      title: selected.title,
      history: await blue(["conversation-show", selected.id])
    };
  });
  trustedHandle("blue:conversation-delete", async (_event, value) => {
    const id = String(value || "").trim();
    const rows = parseConversations(await blue(["conversations"]));
    const selected = rows.find(row => row.id === id);
    if (!selected) throw new Error("Conversation was not found.");
    await blue(["conversation-delete", selected.id, "--confirm"]);
    clearRecentChatTurns(selected.id);
    if (currentConversation === selected.id) {
      currentConversation = await ensureConversation("Blue Desktop Pet");
      clearRecentChatTurns(currentConversation);
    }
    const updatedRows = parseConversations(await blue(["conversations"]));
    const current = updatedRows.find(row => row.id === currentConversation)
      || updatedRows[0]
      || { id: currentConversation, title: "Blue Desktop Pet" };
    currentConversation = current.id;
    appendActivity(activityLedgerPath, "conversation", "Named conversation deleted", {
      title: selected.title
    });
    return {
      current: currentConversation,
      title: current.title,
      deletedTitle: selected.title,
      conversations: updatedRows,
      history: await blue(["conversation-show", currentConversation])
    };
  });
  trustedHandle("blue:doctor", async () => blue(["doctor"]));
  trustedHandle("blue:provider-status", async () => blue(["provider-check"]));
  trustedHandle("blue:model-setup", async () => blue(["model-setup"]));
  trustedHandle("blue:setup-state", async () => {
    let providerStatus = {};
    try { providerStatus = JSON.parse(await blue(["provider-check"])); }
    catch {}
    return { ...setupState, providerStatus };
  });
  trustedHandle("blue:setup-ollama-choice", async (_event, value) => {
    const choice = String(value || "").trim();
    if (!["accepted", "installed", "skipped", "later"].includes(choice)) {
      throw new Error("Choose a valid Ollama setup option.");
    }
    setupState = {
      ollamaPrompt: choice,
      ollamaPromptedAt: new Date().toISOString()
    };
    saveJsonAtomic(setupStatePath, setupState);
    appendActivity(activityLedgerPath, "settings", "Ollama setup prompt answered", {
      choice
    });
    if (choice === "accepted") {
      await shell.openExternal("https://ollama.com/download/windows");
      return "Opened the official Ollama for Windows download page.";
    }
    if (choice === "installed") return blue(["model-setup"]);
    if (choice === "later") return "Okay. Blue will ask about Ollama again later.";
    return "Okay. Blue will keep using the configured provider.";
  });
  trustedHandle("blue:local-compute-save", async (_event, value) => {
    const preferLocal = Boolean(value?.preferLocalProvider);
    const localRamGb = Math.max(1, Math.min(Number(value?.localRamGb || 8), 256));
    const contextTokens = Math.max(1024, Math.min(Number(value?.ollamaContextTokens || 4096), 32768));
    const gpuLayers = Math.max(-1, Math.min(Number(value?.ollamaGpuLayers ?? -1), 999));
    await blue(["config", "prefer_local_provider", preferLocal ? "true" : "false"]);
    await blue(["config", "local_ram_gb", String(Math.round(localRamGb))]);
    await blue(["config", "ollama_context_tokens", String(Math.round(contextTokens))]);
    await blue(["config", "ollama_gpu_layers", String(Math.round(gpuLayers))]);
    appendActivity(activityLedgerPath, "settings", "Local compute settings saved", {
      preferLocalProvider: preferLocal,
      localRamGb: Math.round(localRamGb),
      ollamaContextTokens: Math.round(contextTokens),
      ollamaGpuLayers: Math.round(gpuLayers)
    });
    return blue(["provider-check"]);
  });
  trustedHandle("blue:model-list", async () => ({
    current: currentVtuberModel().id,
    models: vtuberModelRegistry()
  }));
  trustedHandle("blue:model-current", async () => currentVtuberModel());
  trustedHandle("blue:model-select", async (_event, value) => {
    const requested = String(value || "").trim();
    const models = vtuberModelRegistry();
    const selected = models.find(model => model.id === requested);
    if (!selected) throw new Error("That VTuber model was not found.");
    vtuberModelConfig = { selectedModelId: selected.id };
    saveJsonAtomic(vtuberModelConfigPath, vtuberModelConfig);
    appendActivity(activityLedgerPath, "settings", "VTuber model selected", {
      model: selected.id,
      type: selected.type
    });
    broadcastVtuberModel();
    return selected;
  });
  trustedHandle("blue:conversation-history", async () =>
    blue(["conversation-show", currentConversation])
  );
  trustedHandle("blue:discord-status", async () => discordAddon.status());
  trustedHandle("blue:discord-config", async () => discordConfig);
  trustedHandle("blue:discord-save", async (_event, value) => {
    discordConfig = normalizeDiscordConfig(value);
    saveJsonAtomic(discordConfigPath, discordConfig);
    discordAddon.configure(discordConfig);
    appendActivity(activityLedgerPath, "settings", "Discord nonsecret settings saved");
    return discordAddon.status();
  });
  trustedHandle("blue:discord-test", async (_event, token) =>
    discordAddon.testToken(token)
  );
  trustedHandle("blue:discord-register", async (_event, token) =>
    discordAddon.registerCommands(token)
  );
  trustedHandle("blue:discord-connect", async (_event, token) =>
    discordAddon.connect(token)
  );
  trustedHandle("blue:discord-disconnect", async () => discordAddon.disconnect());
  trustedHandle("blue:capabilities", async () => blue(["capabilities"]));
  trustedHandle("blue:feature-catalog", async () => blueFeatureService.catalog());
  trustedHandle("blue:feature-action", async (_event, value) => blueFeatureService.execute(value));
  trustedHandle("blue:research-catalog", async () => blue(["research-catalog"]));
  trustedHandle("blue:learning-records", async () => formatLearningRecords());
  trustedHandle("blue:learning-capture", async (_event, value) => {
    const record = appendLearningRecord(value?.topic, "manual", value?.notes || "");
    return `Saved learning request: ${record.topic}`;
  });
  trustedHandle("blue:learning-research", async (_event, value) => {
    const record = await researchLearningTopic(value?.topic);
    return [
      `Research saved for: ${record.topic}`,
      `Sources: ${record.sources.length}`,
      `Readable webpages summarized: ${record.pagesRead || 0}`,
      "",
      formatLearningRecords([record])
    ].join("\n");
  });
  trustedHandle("blue:agent-status", async () => formatAgentState());
  trustedHandle("blue:agent-start", async (_event, value) => {
    const goal = String(value?.goal || value || "").trim();
    if (!goal) throw new Error("Give the agent a goal first.");
    const state = createAgentPlan(goal, "control_panel");
    return formatAgentState(state);
  });
  trustedHandle("blue:agent-minimax", async () => {
    const state = runMiniMaxAgentDecision();
    return formatAgentState(state);
  });
  trustedHandle("blue:expansion-status", async () => expansion(["status"]));
  trustedHandle("blue:expansion-list", async (_event, value) => {
    const domain = String(value || "").trim();
    const args = ["list", "--limit", "50"];
    if (domain) args.push("--domain", domain);
    return expansion(args);
  });
  trustedHandle("blue:expansion-create", async (_event, value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Expansion record input is required.");
    }
    const payload = {
      domain: String(value.domain || "").trim(),
      kind: String(value.kind || "").trim(),
      title: String(value.title || "").replace(/\s+/g, " ").trim(),
      content: String(value.content || "").trim(),
      source: String(value.source || "").trim()
    };
    if (!/^[a-z_]{2,40}$/.test(payload.domain)) {
      throw new Error("Choose a valid expansion domain.");
    }
    if (!/^[a-z_]{2,50}$/.test(payload.kind)) {
      throw new Error("Choose a valid record type.");
    }
    if (!payload.title || payload.title.length > 200) {
      throw new Error("Title must contain 1 to 200 characters.");
    }
    if (!payload.content || payload.content.length > 20000) {
      throw new Error("Content must contain 1 to 20,000 characters.");
    }
    if (payload.source.length > 2000) {
      throw new Error("Source is limited to 2,000 characters.");
    }
    const record = await expansion(["create-json"], JSON.stringify(payload));
    appendActivity(activityLedgerPath, "expansion", "Safe expansion record created", {
      domain: record.domain,
      kind: record.kind,
      executionEnabled: false,
      approvalRequired: record.approval_required
    });
    return record;
  });
  trustedHandle("blue:pending-approvals", async () =>
    blue(["approvals", "--status", "pending", "--limit", "20"])
  );
  trustedHandle("blue:audit-events", async () => blue(["audit", "--limit", "30"]));
  trustedHandle("blue:lab-capture", async (_event, value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Laboratory input is required.");
    }
    const title = String(value.title || "").trim();
    const kind = String(value.kind || "").trim();
    const content = String(value.content || "").trim();
    const confidence = Number(value.confidence || 0);
    if (!title || title.length > 200) {
      throw new Error("Idea title must be between 1 and 200 characters.");
    }
    if (!["idea", "hypothesis", "experiment", "finding"].includes(kind)) {
      throw new Error("Choose a valid Laboratory record type.");
    }
    if (!content || content.length > 20000) {
      throw new Error("Idea content must be between 1 and 20,000 characters.");
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("Confidence must be between 0 and 1.");
    }
    return blue([
      "lab-capture", title, kind, content,
      "--confidence", String(confidence)
    ]);
  });
  trustedHandle("blue:system-info", async () => JSON.stringify({
    computer: os.hostname(),
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu_threads: os.cpus().length,
    memory_gb: Math.round(os.totalmem() / 1073741824),
    displays: screen.getAllDisplays().map(display => ({
      id: display.id,
      bounds: display.bounds,
      scale_factor: display.scaleFactor
    }))
  }, null, 2));
  trustedHandle("blue:pc-action-guidelines", async () =>
    JSON.stringify(pcActionGuidelines(), null, 2)
  );
  trustedHandle("blue:pc-action-run", async (_event, value) => runPcAction(value));
  trustedHandle("blue:autonomy-status", async () => autonomyStatusPayload());
  trustedHandle("blue:autonomy-save", async (_event, value) => saveAutonomySettings(value));
  trustedHandle("blue:full-control-grant", async (_event, value) => grantFullControlSession(value, "control_panel"));
  trustedHandle("blue:full-control-revoke", async () => revokeFullControlSession("control_panel"));
  trustedHandle("blue:phone-bridge-starter", async () => createPhoneBridgeStarter());
  trustedHandle("blue:phone-approval-queue", async () => formatPhoneApprovalQueue());
  trustedHandle("blue:phone-bridge-status", async () => phoneBridgeStatus());
  trustedHandle("blue:phone-bridge-start", async () => startPhoneBridge());
  trustedHandle("blue:phone-bridge-stop", async () => stopPhoneBridge());
  trustedHandle("blue:artifact-current", async () => artifactPreviewPayload());
  trustedHandle("blue:artifact-open", async () => openLatestArtifact());
  trustedHandle("blue:artifact-reveal", async () => revealLatestArtifact());
  trustedHandle("blue:outfit-reference-status", async () => outfitReferenceStatus());
  trustedHandle("blue:outfit-reference-clear", async () => clearOutfitReference());
  trustedHandle("blue:outfit-style-reference-clear", async () => clearOutfitStyleReference());
  trustedHandle("blue:outfit-reference-use-latest", async () => useLatestArtifactAsOutfitReference());
  trustedHandle("blue:outfit-style-reference-use-latest", async () => useLatestArtifactAsOutfitStyleReference());
  trustedHandle("blue:presence-status", async () => presenceSnapshot());
  trustedHandle("blue:set-proactivity", async (_event, value) => {
    const requested = String(value || "").toLowerCase();
    presenceSettings = saveSettings(presenceSettingsPath, {
      ...presenceSettings,
      proactivity: requested
    });
    locomotion = "idle";
    roamTarget = null;
    roamVelocity = { x: 0, y: 0 };
    requestedLocomotion = null;
    signalLocomotion("idle");
    appendActivity(activityLedgerPath, "settings", "Proactivity changed", {
      proactivity: presenceSettings.proactivity
    });
    broadcastPresence();
    return presenceSnapshot();
  });
  trustedHandle("blue:observation-history", async () =>
    readObservations(observationLedgerPath, 25)
  );
  trustedHandle("blue:clear-observation-history", async () => {
    clearObservations(observationLedgerPath);
    appendActivity(activityLedgerPath, "privacy", "Observation metadata cleared");
    return "Observation metadata cleared. Shared inbox files were preserved.";
  });
  trustedHandle("blue:delete-observation", async (_event, value) => {
    const id = String(value || "").trim();
    if (!id || id.length > 100) throw new Error("Choose a valid observation.");
    const deleted = deleteObservation(observationLedgerPath, id);
    if (!deleted) throw new Error("Observation was not found.");
    appendActivity(activityLedgerPath, "privacy", "One observation record deleted");
    return "Observation metadata deleted. The deliberately shared inbox file was preserved.";
  });
  trustedHandle("blue:activity-history", async () =>
    readActivity(activityLedgerPath, 75)
  );
  trustedHandle("blue:clear-activity-history", async () => {
    clearActivity(activityLedgerPath);
    appendActivity(activityLedgerPath, "system", "Activity timeline cleared");
    return "Activity timeline cleared. A new local clearing event was recorded.";
  });
  trustedHandle("blue:voice-input", async () => {
    if (microphoneListening) throw new Error("Blue is already listening.");
    microphoneListening = true;
    voiceAbortController = new AbortController();
    appendActivity(activityLedgerPath, "privacy", "Local listen-once started", {
      seconds: 8,
      provider: "Windows offline speech recognizer"
    });
    broadcastPresence();
    try {
      const transcript = await runBoundedProcess(
        "powershell.exe",
        [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", path.join(__dirname, "voice-input.ps1"),
          "-Seconds", "8"
        ],
        { cwd: __dirname, windowsHide: true, shell: false },
        {
          timeoutMs: 12000,
          maxOutputBytes: 65536,
          signal: voiceAbortController.signal
        }
      );
      const validated = validateVoiceTranscript(transcript);
      appendActivity(activityLedgerPath, "privacy", "Local listen-once completed", {
        characters: validated.length,
        transcriptStoredInTimeline: false
      });
      return validated;
    } catch (error) {
      appendActivity(activityLedgerPath, "privacy", "Local listen-once ended without transcript", {
        reason: String(error.message || "recognition failed").slice(0, 160)
      });
      throw error;
    } finally {
      voiceAbortController = null;
      microphoneListening = false;
      broadcastPresence();
    }
  });
  trustedHandle("blue:voice-input-cancel", async () => {
    if (!microphoneListening || !voiceAbortController) {
      return "Blue is not currently listening.";
    }
    voiceAbortController.abort();
    return "Listening stopped.";
  });
  trustedHandle("blue:voice-settings", async () => voiceSettings);
  trustedHandle("blue:voice-settings-save", async (_event, value) => {
    voiceSettings = normalizeVoiceSettings(value);
    saveJsonAtomic(voiceSettingsPath, voiceSettings);
    appendActivity(activityLedgerPath, "settings", "Voice activation settings saved", {
      wakeWordCount: voiceSettings.wakeWords.length,
      ownerPhraseLock: voiceSettings.ownerPhraseLock,
      biometricSpeakerRecognition: false
    });
    return voiceSettings;
  });
  trustedHandle("blue:microphones", async () => {
    const output = await runBoundedProcess(
      "powershell.exe",
      [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", path.join(__dirname, "voice-input.ps1"),
        "-ListMicrophones"
      ],
      { cwd: __dirname, windowsHide: true, shell: false },
      { timeoutMs: 8000, maxOutputBytes: 65536 }
    );
    return output.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [id, ...nameParts] = line.split("|");
        return { id, name: nameParts.join("|") || id };
      });
  });
  trustedHandle("blue:open-microphone-settings", async () => {
    await shell.openExternal("ms-settings:sound");
    return "Opened Windows Sound settings. Set your Input device there, then try Wake Listen again.";
  });
  trustedHandle("blue:wake-listen", async () => {
    if (microphoneListening) throw new Error("Blue is already listening.");
    microphoneListening = true;
    voiceAbortController = new AbortController();
    const assistantName = assistantNameForModel();
    const assistantDisplayName = displayAssistantName(assistantName);
    const wakeWords = activeWakeWords();
    appendActivity(activityLedgerPath, "privacy", "Wake listen started", {
      seconds: voiceSettings.listenSeconds,
      assistantName,
      wakeWordCount: wakeWords.length,
      ownerPhraseLock: voiceSettings.ownerPhraseLock,
      biometricSpeakerRecognition: false
    });
    broadcastPresence();
    try {
      const transcript = await runBoundedProcess(
        "powershell.exe",
        [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", path.join(__dirname, "voice-input.ps1"),
          "-Seconds", String(voiceSettings.listenSeconds)
        ],
        { cwd: __dirname, windowsHide: true, shell: false },
        {
          timeoutMs: (voiceSettings.listenSeconds + 4) * 1000,
          maxOutputBytes: 65536,
          signal: voiceAbortController.signal
        }
      );
      const validated = validateVoiceTranscript(transcript);
      const lower = validated.toLowerCase();
      if (voiceSettings.ownerPhraseLock) {
        if (!voiceSettings.ownerPhrase) {
          throw new Error("Owner phrase lock is enabled, but no owner phrase is saved.");
        }
        if (!lower.includes(voiceSettings.ownerPhrase)) {
          return {
            activated: false,
            reason: "Owner phrase was not heard.",
            transcript: validated
          };
        }
      }
      const wake = stripWakeWords(validated, wakeWords);
      if (!wake.matched) {
        return {
          activated: false,
          reason: `No ${assistantDisplayName} wake word heard. Wake words: ${wakeWords.join(", ")}`,
          transcript: validated
        };
      }
      const reply = wake.command
        ? `Yes, ${assistantDisplayName}.`
        : `Yes, ${assistantDisplayName}. What can I help you with?`;
      sendPetBubble(reply);
      appendActivity(activityLedgerPath, "privacy", "Wake listen activated", {
        wakeWord: wake.matched,
        assistantName,
        commandCharacters: wake.command.length,
        ownerPhraseLock: voiceSettings.ownerPhraseLock
      });
      return {
        activated: true,
        wakeWord: wake.matched,
        assistantName,
        assistantDisplayName,
        reply,
        transcript: validated,
        command: wake.command
      };
    } finally {
      voiceAbortController = null;
      microphoneListening = false;
      broadcastPresence();
    }
  });
  trustedHandle("blue:read-clipboard", async () => {
    const content = clipboard.readText();
    if (!content) return "";
    if (content.length > 100000) {
      throw new Error("Clipboard text is limited to 100,000 characters.");
    }
    appendActivity(activityLedgerPath, "sharing", "Clipboard text read by user request", {
      characters: content.length,
      storedInTimeline: false
    });
    return content;
  });
  trustedHandle("blue:scan-image", async () => {
    if (imageScanning) throw new Error("Blue is already scanning an image.");
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "Scan an image for text with local Windows OCR",
      filters: [{
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
      }],
      properties: ["openFile"]
    });
    if (result.canceled) return null;
    const imagePath = normalizeSharedPaths(result.filePaths)[0];
    const stat = await fs.promises.stat(imagePath);
    if (stat.size > 104857600) {
      throw new Error(`Images are limited to 100 MB: ${path.basename(imagePath)}`);
    }
    imageScanning = true;
    broadcastPresence();
    appendActivity(activityLedgerPath, "privacy", "Local image text scan started", {
      provider: "Windows.Media.Ocr",
      automaticCapture: false
    });
    try {
      const output = await runBoundedProcess(
        "powershell.exe",
        [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", path.join(__dirname, "image-ocr.ps1"),
          "-ImagePath", imagePath
        ],
        { cwd: __dirname, windowsHide: true, shell: false },
        { timeoutMs: 30000, maxOutputBytes: 262144 }
      );
      const ocr = parseOcrPayload(output);
      const preserved = await preserveSharedFile(imagePath);
      const metadata = await recordSharedImage(imagePath, preserved, {
        interpretation: ocr.text ? "ocr-complete" : "ocr-no-text",
        provider: ocr.provider,
        extractedText: ocr.text
      });
      appendActivity(activityLedgerPath, "privacy", "Local image text scan completed", {
        characters: ocr.text.length,
        lines: ocr.lines,
        language: ocr.language,
        contentStoredInTimeline: false
      });
      return {
        name: path.basename(imagePath),
        text: ocr.text,
        language: ocr.language,
        lines: ocr.lines,
        width: ocr.width || metadata.size?.width || 0,
        height: ocr.height || metadata.size?.height || 0,
        sha256: metadata.digest,
        provider: ocr.provider
      };
    } catch (error) {
      appendActivity(activityLedgerPath, "privacy", "Local image text scan failed", {
        reason: String(error.message || "OCR failed").slice(0, 160)
      });
      throw error;
    } finally {
      imageScanning = false;
      broadcastPresence();
    }
  });
  trustedHandle("blue:health", async () => ({
    petWindow: Boolean(petWindow && !petWindow.isDestroyed()),
    controlPanel: Boolean(controlWindow && !controlWindow.isDestroyed()),
    database: fs.existsSync(path.join(blueDataDirectory, "blue.db")),
    observationLedger: fs.existsSync(observationLedgerPath),
    activityLedger: fs.existsSync(activityLedgerPath),
    petRecoveriesInLastMinute: petRecoveryAttempts.filter(
      value => Date.now() - value < 60000
    ).length,
    controlRecoveriesInLastMinute: controlRecoveryAttempts.filter(
      value => Date.now() - value < 60000
    ).length,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMegabytes: Math.round(process.memoryUsage().rss / 1048576),
    vision: "off",
    microphone: microphoneListening ? "listening" : "off",
    localOcr: fs.existsSync(path.join(__dirname, "image-ocr.ps1"))
      ? (imageScanning ? "scanning" : "ready")
      : "unavailable",
    automaticCapture: false
  }));
  trustedHandle("blue:security-snapshot", async () => {
    if (securityScanning) {
      throw new Error("Blue is already reading Windows security status.");
    }
    securityScanning = true;
    appendActivity(activityLedgerPath, "security", "Manual read-only security snapshot started", {
      automatic: false,
      changesAllowed: false
    });
    try {
      const output = await runBoundedProcess(
        "powershell.exe",
        [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", path.join(__dirname, "security-snapshot.ps1")
        ],
        { cwd: __dirname, windowsHide: true, shell: false },
        { timeoutMs: 45000, maxOutputBytes: 1048576 }
      );
      const snapshot = parseSecuritySnapshot(output);
      appendActivity(activityLedgerPath, "security", "Manual read-only security snapshot completed", {
        state: snapshot.state,
        threatDetectionCount: snapshot.threatDetections.length,
        startupCommandCount: snapshot.startupCommands.length,
        contentStoredInTimeline: false
      });
      return snapshot;
    } catch (error) {
      appendActivity(activityLedgerPath, "security", "Manual security snapshot failed", {
        reason: String(error.message || "Security status unavailable").slice(0, 160)
      });
      throw error;
    } finally {
      securityScanning = false;
    }
  });
  trustedHandle("blue:workspace-agent", async (_event, command) => workspaceAgent.runSlash(String(command || "/workspace")));
  trustedHandle("blue:workspace-agent-action", async (_event, action) => workspaceAgent.execute(action));
  trustedHandle("blue:workbench-context", async (_event, uiContext) => workbenchContextService.snapshot(uiContext));
  trustedHandle("blue:workbench-activity", async (_event, limit) => workbenchContextService.activity(limit));
  trustedHandle("blue:workbench-observe", async (_event, value) => proactiveBlueService.observe(value?.type || "workbench.event", value?.details || {}, value?.uiContext || null));
  trustedHandle("blue:workbench-suggestions", async (_event, limit) => proactiveBlueService.suggestions(limit));
  trustedHandle("blue:workbench-suggestion-dismiss", async (_event, id) => proactiveBlueService.dismiss(String(id || "")));
  trustedHandle("blue:workspace-context", async () => workspaceAgent.runSlash("/workspace"));
  trustedHandle("blue:workspace-search", async (_event, query) => workspaceAgent.runSlash(`/search ${String(query || "")}`));
  trustedHandle("blue:workspace-symbols", async (_event, query) => workspaceAgent.runSlash(`/symbols ${String(query || "")}`));
  trustedHandle("blue:workspace-git", async () => gitService.status());
  trustedHandle("blue:git-diff", async (_event, value) => gitService.diff(value?.path, value?.staged));
  trustedHandle("blue:git-stage", async (_event, files) => gitService.stage(files));
  trustedHandle("blue:git-unstage", async (_event, files) => gitService.unstage(files));
  trustedHandle("blue:git-branches", async () => gitService.branches());
  trustedHandle("blue:git-switch", async (_event, value) => gitService.switchBranch(value?.name, value?.approved));
  trustedHandle("blue:git-commit", async (_event, value) => gitService.commit(value?.message, value?.approved));
  trustedHandle("blue:git-pull", async (_event, value) => {
    const result = await gitService.pull(value?.approved);
    await observeWorkbench("git.pulled", { output: result.output, branch: result.status?.branch });
    return result;
  });
  trustedHandle("blue:git-push", async (_event, value) => gitService.push(value?.approved));
  trustedHandle("blue:git-history", async (_event, limit) => gitService.history(limit));
  trustedHandle("blue:git-attribution", async (_event, value) => gitService.attribution(value?.path, value?.limit));
  trustedHandle("blue:lsp-status", async () => languageService.status());
  trustedHandle("blue:lsp-open", async (_event, value) => languageService.open(value));
  trustedHandle("blue:lsp-completion", async (_event, value) => languageService.completion(value));
  trustedHandle("blue:lsp-hover", async (_event, value) => languageService.hover(value));
  trustedHandle("blue:lsp-signature", async (_event, value) => languageService.signature(value));
  trustedHandle("blue:lsp-definition", async (_event, value) => languageService.definition(value));
  trustedHandle("blue:lsp-references", async (_event, value) => languageService.references(value));
  trustedHandle("blue:lsp-rename", async (_event, value) => languageService.rename(value));
  trustedHandle("blue:lsp-formatting", async (_event, value) => languageService.formatting(value));
  trustedHandle("blue:lsp-code-actions", async (_event, value) => languageService.codeActions(value));
  trustedHandle("blue:lsp-semantic-tokens", async (_event, value) => languageService.semanticTokens(value));
  trustedHandle("blue:lsp-document-symbols", async (_event, value) => languageService.documentSymbols(value));
  trustedHandle("blue:lsp-workspace-symbols", async (_event, query) => languageService.workspaceSymbols(query));
  trustedHandle("blue:lsp-apply-edit", async (_event, value) => languageService.applyWorkspaceEdit(value?.edit, value?.approved));
  trustedHandle("blue:debug-status", async () => debugService.status());
  trustedHandle("blue:debug-profiles", async () => debugService.profiles());
  trustedHandle("blue:debug-profile-save", async (_event, value) => debugService.saveProfile(value));
  trustedHandle("blue:debug-start", async (_event, value) => debugService.start(value));
  trustedHandle("blue:debug-list", async () => debugService.list());
  trustedHandle("blue:debug-breakpoints", async (_event, value) => debugService.setBreakpoints(value?.sessionId, value));
  trustedHandle("blue:debug-command", async (_event, value) => debugService.command(value?.sessionId, value?.command, value?.args));
  trustedHandle("blue:debug-stop", async (_event, sessionId) => debugService.stop(sessionId));
  trustedHandle("blue:test-discover", async () => testService.discover());
  trustedHandle("blue:test-run", async (_event, value) => testService.run(value));
  trustedHandle("blue:test-history", async () => testService.history());
  trustedHandle("blue:test-debug", async (_event, testId) => debugService.start(testService.debugConfiguration(testId)));
  trustedHandle("blue:extension-list", async () => extensionService.list());
  trustedHandle("blue:extension-install", async (_event, value) => extensionService.install(value?.source === "$bundled-sample" ? path.join(__dirname, "sample-extension") : value?.source, value?.approved === true));
  trustedHandle("blue:extension-uninstall", async (_event, value) => extensionService.uninstall(value?.id, value?.approved === true));
  trustedHandle("blue:extension-enable", async (_event, value) => extensionService.setEnabled(value?.id, value?.enabled === true));
  trustedHandle("blue:extension-activate", async (_event, value) => extensionService.activate(value?.id, value?.event || "onStartup"));
  trustedHandle("blue:extension-deactivate", async (_event, id) => extensionService.deactivate(id));
  trustedHandle("blue:extension-command", async (_event, value) => extensionService.executeCommand(value?.command, value?.args));
  trustedHandle("blue:editor-open", async (_event, filePath) => editorService.open(String(filePath || "")));
  trustedHandle("blue:editor-update", async (_event, value) => editorService.update(value?.sessionId, value?.content));
  trustedHandle("blue:editor-undo", async (_event, sessionId) => editorService.undo(sessionId));
  trustedHandle("blue:editor-redo", async (_event, sessionId) => editorService.redo(sessionId));
  trustedHandle("blue:editor-save", async (_event, value) => editorService.save(value?.sessionId, {
    overwriteExternal: value?.overwriteExternal === true
  }));
  trustedHandle("blue:editor-find", async (_event, value) => editorService.find(value?.sessionId, value?.query, value?.options));
  trustedHandle("blue:editor-replace", async (_event, value) => editorService.replace(
    value?.sessionId, value?.query, value?.replacement, value?.options
  ));
  trustedHandle("blue:editor-diff", async (_event, sessionId) => editorService.compareWithDisk(sessionId));
  trustedHandle("blue:editor-recovery", async () => editorService.recoverable());
  trustedHandle("blue:editor-restore", async (_event, filePath) => editorService.restoreRecovery(filePath));
  trustedHandle("blue:editor-files", async (_event, options) => editorService.listWorkspaceFiles(options));
  trustedHandle("blue:editor-recent", async () => editorService.recentFiles());
  trustedHandle("blue:editor-settings", async () => editorService.workspaceSettings());
  trustedHandle("blue:editor-settings-update", async (_event, value) => editorService.updateWorkspaceSettings(value));
  trustedHandle("blue:editor-roots", async () => editorService.workspaceRoots().map(root => ({ ...root, path: root.primary ? root.path : undefined })));
  trustedHandle("blue:editor-root-add", async () => {
    const result = await dialog.showOpenDialog({ title: "Add Project Blue workspace root", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, roots: editorService.workspaceRoots() };
    return { canceled: false, roots: editorService.addWorkspaceRoot(result.filePaths[0]) };
  });
  trustedHandle("blue:editor-root-remove", async (_event, rootId) => editorService.removeWorkspaceRoot(String(rootId || "")));
  trustedHandle("blue:editor-references", async (_event, value) => editorService.findReferences(value?.query, value?.options));
  trustedHandle("blue:editor-symbols", async (_event, options) => editorService.symbolIndex(options));
  trustedHandle("blue:editor-workspace-changes", async (_event, previous) => editorService.workspaceChanges(previous));
  trustedHandle("blue:editor-workspace-search", async (_event, value) => editorService.searchWorkspace(value?.query, value?.options));
  trustedHandle("blue:editor-replace-preview", async (_event, value) => editorService.previewWorkspaceReplace(value?.query, value?.replacement, value?.options));
  trustedHandle("blue:editor-status", async (_event, value) => editorService.checkExternal(value?.sessionId, {
    reloadClean: value?.reloadClean !== false
  }));
  trustedHandle("blue:editor-close", async (_event, value) => editorService.close(value?.sessionId, {
    discard: value?.discard === true
  }));
  trustedHandle("blue:terminal-profiles", async () => terminalService.profiles().map(({ executable, args, ...profile }) => profile));
  trustedHandle("blue:terminal-list", async () => terminalService.list());
  trustedHandle("blue:terminal-create", async (_event, value) => terminalService.create(value));
  trustedHandle("blue:terminal-write", async (_event, value) => terminalService.write(value?.sessionId, value?.data));
  trustedHandle("blue:terminal-resize", async (_event, value) => terminalService.resize(value?.sessionId, value?.cols, value?.rows));
  trustedHandle("blue:terminal-close", async (_event, sessionId) => terminalService.close(sessionId));
  trustedHandle("blue:task-list", async () => terminalService.listTasks());
  trustedHandle("blue:task-save", async (_event, value) => terminalService.saveTask(value));
  trustedHandle("blue:task-delete", async (_event, taskId) => terminalService.deleteTask(taskId));
  trustedHandle("blue:task-run", async (_event, taskId) => terminalService.runTask(taskId));
  trustedHandle("blue:control-audit", async () => auditControlCenter(__dirname));
  trustedHandle("blue:bluemesh-status", async () => blueMeshStatusSummary());
  trustedHandle("blue:bluemesh-token", async () => blueMesh(["token"], 10000));
  trustedHandle("blue:bluemesh-preflight", async (_event, value) => blueMesh([
    "preflight",
    "--node-id", String(value?.nodeId || "adahn_pc"),
    "--creator-id", String(value?.creatorId || "creator_adahn"),
    "--peer", String(value?.peerUrl || "")
  ], 10000));
  trustedHandle("blue:bluemesh-smoke", async () => runBoundedProcess(
    "python",
    ["-m", "unittest", "discover", "-s", path.join(repoRoot, "tests"), "-p", "test_blue_mesh_lan.py"],
    {
      cwd: repoRoot,
      windowsHide: true,
      shell: false,
      env: blueMeshEnvironment()
    },
    { timeoutMs: 60000, maxOutputBytes: 2097152 }
  ));
  trustedHandle("blue:bluemesh-open-docs", async () => {
    const docsPath = path.join(repoRoot, "docs", "BlueMeshLAN.md");
    const error = await shell.openPath(docsPath);
    if (error) throw new Error(error);
    return "Opened BlueMesh LAN docs.";
  });
  trustedHandle("blue:streaming-status", async () => ({
    config: sanitizeStreamingConfig(streamingConfig),
    platforms: streamingPlatformCatalog(),
    showFormats: streamShowCatalog(),
    autonomyLevels: streamingAutonomyCatalog(),
    policy: streamingPolicySummary(streamingConfig),
    preflight: buildStreamingPreflight(streamingConfig),
    chatGuide: streamingChatGuide(streamingConfig),
    obs: {
      websocketUrl: streamingConfig.obsUrl,
      passwordStored: false,
      sceneChangesRequireApproval: true
    },
    chat: {
      twitch: "planned official EventSub/chat reader",
      youtube: "planned official liveChatMessages reader",
      discord: "existing approved bot channel",
      tokensStored: false
    }
  }));
  trustedHandle("blue:streaming-config-save", async (_event, value) => {
    streamingConfig = sanitizeStreamingConfig({
      ...streamingConfig,
      ...(value || {}),
      updatedAt: new Date().toISOString()
    });
    saveJsonAtomic(streamingConfigPath, streamingConfig);
    appendActivity(activityLedgerPath, "settings", "Streaming Studio nonsecret settings saved", {
      platform: streamingConfig.platform,
      streamMode: streamingConfig.streamMode,
      avatarBackend: streamingConfig.avatarBackend
    });
    return {
      config: streamingConfig,
      message: "Streaming settings saved. OBS passwords, stream keys, and platform tokens are session-only and were not written to disk."
    };
  });
  trustedHandle("blue:streaming-obs-check", async (_event, value) => {
    const config = normalizeStreamingConfig({ ...streamingConfig, ...(value || {}) });
    const result = await obsRequest({
      url: config.obsUrl,
      password: value?.password,
      requestType: "GetVersion"
    });
    appendActivity(activityLedgerPath, "streaming", "OBS websocket connection checked", {
      obsUrl: config.obsUrl,
      obsVersion: result.obsVersion,
      obsWebSocketVersion: result.obsWebSocketVersion
    });
    return result;
  });
  trustedHandle("blue:streaming-obs-scenes", async (_event, value) => {
    const config = normalizeStreamingConfig({ ...streamingConfig, ...(value || {}) });
    const result = await obsRequest({
      url: config.obsUrl,
      password: value?.password,
      requestType: "GetSceneList"
    });
    return {
      currentProgramSceneName: result.currentProgramSceneName,
      scenes: Array.isArray(result.scenes) ? result.scenes.map(scene => scene.sceneName).filter(Boolean) : []
    };
  });
  trustedHandle("blue:streaming-obs-switch-scene", async (_event, value) => {
    if (!value?.approved) throw new Error("Scene changes require approval in the Streaming panel.");
    const sceneName = String(value?.sceneName || "").trim();
    if (!sceneName) throw new Error("Choose a scene first.");
    const config = normalizeStreamingConfig({ ...streamingConfig, ...(value || {}) });
    const result = await obsRequest({
      url: config.obsUrl,
      password: value?.password,
      requestType: "SetCurrentProgramScene",
      requestData: { sceneName }
    });
    appendActivity(activityLedgerPath, "streaming", "Approved OBS scene switch", { sceneName });
    return { ...result, message: `Switched OBS Program scene to "${sceneName}".` };
  });
  trustedHandle("blue:streaming-plan", async (_event, value) => {
    const kind = String(value?.kind || "obs").trim();
    const config = normalizeStreamingConfig({ ...streamingConfig, ...(value?.config || {}) });
    if (kind === "preflight") {
      return JSON.stringify(buildStreamingPreflight(config), null, 2);
    }
    if (kind === "showrunner") {
      return [
        buildStreamerRunOfShow({
          config,
          showFormat: value?.showFormat || "neuro_chat",
          autonomyLevel: value?.autonomyLevel || (config.independentMode ? "independent_guarded" : "assistant")
        }),
        "",
        "Show plan:",
        JSON.stringify(buildStreamerShowPlan({
          config,
          showFormat: value?.showFormat || "neuro_chat",
          autonomyLevel: value?.autonomyLevel || (config.independentMode ? "independent_guarded" : "assistant")
        }), null, 2)
      ].join("\n");
    }
    if (kind === "moderation") {
      const sample = value?.message || "Sample chat message for Blue's stream moderation guard.";
      return [
        streamingChatGuide(config),
        "",
        "Sample moderation decision:",
        JSON.stringify(moderateChatMessage(sample, config), null, 2)
      ].join("\n");
    }
    if (kind === "adult") {
      return [
        buildStreamingPlan("adult", config),
        "",
        "Adult-platform readiness:",
        JSON.stringify(adultPlatformReadiness(config), null, 2),
        "",
        streamingPolicySummary(config)
      ].join("\n");
    }
    return [
      buildStreamingPlan(kind, config),
      "",
      streamingPolicySummary(config)
    ].join("\n");
  });
  trustedHandle("blue:open-project", async () => {
    const error = await shell.openPath(appRoot);
    if (error) throw new Error(error);
    return "Opened Project Blue App.";
  });
  trustedHandle("blue:share-files", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "Share files with Blue",
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) return "Sharing cancelled.";
    return handleSharedPaths(result.filePaths);
  });
  trustedHandle("blue:share-paths", async (_event, paths) => {
    return handleSharedPaths(paths);
  });
  trustedHandle("blue:share-images", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "Share images with Blue",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) return "Sharing cancelled.";
    const imagePaths = normalizeSharedPaths(result.filePaths);
    const notes = [];
    for (const filePath of imagePaths) {
      const preserved = await preserveSharedFile(filePath);
      const { size, digest } = await recordSharedImage(filePath, preserved);
      rememberSharedItem({
        path: preserved,
        originalPath: filePath,
        name: path.basename(filePath),
        kind: "image",
        note: "Shared image available as chat context. It is not a base or outfit/style reference unless explicitly selected."
      });
      rememberArtifact({
        title: path.basename(filePath),
        path: preserved,
        kind: "image",
        source: "shared_image",
        note: "Shared image. Use it as a base or outfit/style reference only if explicitly chosen."
      });
      notes.push(await shareNote(
        `[Shared image] ${path.basename(filePath)} preserved locally at ${preserved}. `
        + `${size ? `Dimensions: ${size.width}x${size.height}. ` : ""}`
        + `SHA-256: ${digest}. `
        + "Say 'use the dropped image as the base reference' for the character/model base, or 'use the dropped image as the outfit reference' for a second clothing/style photo. "
        + "Blue recorded this user-selected share in Observation History. "
        + "No automatic screen capture occurred. "
        + "Image interpretation requires a configured vision-capable model."
      ));
    }
    appendActivity(activityLedgerPath, "sharing", `Shared ${imagePaths.length} image(s)`, {
      count: imagePaths.length,
      automaticCapture: false
    });
    return notes.join("\n");
  });
  trustedHandle("blue:share-folder", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "Share a folder with Blue",
      properties: ["openDirectory"]
    });
    if (result.canceled) return "Sharing cancelled.";
    const folder = normalizeSharedPaths(result.filePaths)[0];
    if (!fs.statSync(folder).isDirectory()) throw new Error("Choose a folder to share.");
    const name = `Shared ${path.basename(folder)} ${Date.now()}`;
    await blue(["workspace-add", name, folder]);
    appendActivity(activityLedgerPath, "sharing", "Shared one read-only folder", {
      mode: "read-only"
    });
    return `Folder shared read-only as '${name}'.\n${await blue(["workspace-index", name])}`;
  });
  trustedHandle("blue:share-link", async (_event, value) => {
    const parsed = parseHttpUrl(value);
    appendActivity(activityLedgerPath, "sharing", "Shared one web link", {
      protocol: parsed.protocol
    });
    return shareNote(`[Shared link] ${parsed.href}`);
  });
  trustedHandle("blue:paste-content", async (_event, value) => {
    const content = String(value || "").trim();
    if (!content) throw new Error("Paste some text or a link first.");
    if (content.length > 100000) throw new Error("Pasted content is limited to 100,000 characters.");
    const lines = content.split(/\s+/).filter(Boolean);
    if (lines.length === 1) {
      try {
        const parsed = parseHttpUrl(lines[0]);
        appendActivity(activityLedgerPath, "sharing", "Pasted one web link", {
          protocol: parsed.protocol
        });
        return shareNote(`[Shared link] ${parsed.href}`);
      } catch {}
    }
    appendActivity(activityLedgerPath, "sharing", "Pasted text content", {
      characters: content.length
    });
    return shareNote(`[Pasted content]\n${content}`);
  });
  trustedOn("pet:show-control", showControl);
  trustedOn("pet:toggle-wander", event => {
    wandering = !wandering;
    if (wandering) {
      phaseUntil = Date.now() + 400;
      requestedLocomotion = "walk";
    } else {
      roamTarget = null;
      roamVelocity = { x: 0, y: 0 };
      locomotion = "idle";
    }
    broadcastWanderState();
    broadcastPresence();
  });
  trustedOn("pet:hover", () => {});
  trustedOn("pet:show", () => {
    if (!petWindow || petWindow.isDestroyed()) createPetWindow();
    else petWindow.show();
  });
  trustedOn("pet:action", (_event, name) => {
    if (name === "walk" || name === "run") {
      wandering = true;
      roamTarget = null;
      requestedLocomotion = name;
      phaseUntil = Date.now();
    } else if ([
      "wave", "smile", "look", "nod", "cheer", "lean", "stretch", "dance",
      "outfit", "chair", "sad"
    ].includes(name)) {
      petWindow?.webContents.send("pet:action", name);
      setPresenceOverride(name, name === "dance" ? 4000 : 2800);
      appendActivity(activityLedgerPath, "movement", `Blue performed ${name}`, {
        action: name,
        requestedBy: "user"
      });
    }
  });
  trustedOn("pet:speaking", (_event, value) => {
    speakingActive = Boolean(value);
    petWindow?.webContents.send("pet:speaking", speakingActive);
    broadcastPresence();
  });
  trustedOn("control:hide", () => controlWindow?.hide());
  trustedOn("app:quit", () => {
    quitting = true;
    clearTimeout(petRecoveryTimer);
    clearTimeout(controlRecoveryTimer);
    voiceAbortController?.abort();
    discordAddon.disconnect();
    app.quit();
  });
}

if (singleInstanceLock) {
  app.on("second-instance", () => {
    appendActivity(activityLedgerPath, "system", "Duplicate Blue launch redirected");
    if (!petWindow || petWindow.isDestroyed()) createPetWindow();
    else petWindow.show();
    showControl();
  });
}

app.whenReady().then(() => {
  if (!singleInstanceLock) return;
  observeWorkbench("project.opened", { version: desktopVersion, workspace: path.basename(repoRoot) });
  appendActivity(activityLedgerPath, "system", "Blue desktop presence started", {
    version: "3.3.0",
    desktopVersion,
    automaticCapture: false
  });
  createApplicationMenu();
  registerHandlers();
  createPetWindow();
  createControlWindow();
  createTray();
  if (process.env.BLUE_MOTION_SMOKE) startWandering();
  if (process.env.BLUE_CAPTURE_DIR) {
    setTimeout(() => {
      if (process.env.BLUE_CONTROL_SMOKE === "1") {
        const smokeWidth = Math.max(900, Number(process.env.BLUE_CONTROL_SMOKE_WIDTH) || 1920);
        const smokeHeight = Math.max(640, Number(process.env.BLUE_CONTROL_SMOKE_HEIGHT) || 1080);
        controlWindow.setContentSize(smokeWidth, smokeHeight);
        controlWindow.webContents.executeJavaScript(
          'document.querySelector("#startupModelKeep")?.click(); selectTab("workspace", "workspace-home");'
        ).catch(error => console.error("Control smoke setup failed:", error));
      }
      if (process.env.BLUE_STREAMING_SMOKE === "1") {
        controlWindow.setContentSize(1920, 1080);
        controlWindow.webContents.executeJavaScript(
          'document.querySelector("#startupModelKeep")?.click(); selectTab("streaming", "streaming-studio"); document.querySelector("#streamingStatusRefresh")?.click();'
        ).catch(error => console.error("Streaming smoke setup failed:", error));
      }
      if (process.env.BLUE_SECURITY_SMOKE === "1") {
        controlWindow.webContents.executeJavaScript(
          'selectTab("security"); document.querySelector("#securityScan").click();'
        ).catch(error => console.error("Security smoke setup failed:", error));
      } else if (process.env.BLUE_EXPANSION_SMOKE === "1") {
        controlWindow.webContents.executeJavaScript(
          'selectTab("expansion"); document.querySelector("#expansionRefresh").click();'
        ).catch(error => console.error("Expansion smoke setup failed:", error));
      }
      if (process.env.BLUE_MOTION_SMOKE === "right") {
        petWindow.webContents.send("pet:walking", true);
        petWindow.webContents.send("pet:motion", {
          x: 1, y: 0, speed: 82, mode: "walk"
        });
      } else if (process.env.BLUE_MOTION_SMOKE === "left") {
        petWindow.webContents.send("pet:walking", true);
        petWindow.webContents.send("pet:motion", {
          x: -1, y: 0, speed: 82, mode: "walk"
        });
      } else {
        petWindow.webContents.send("pet:action", "dance");
        petWindow.webContents.send("pet:speaking", true);
      }
    }, 1200);
    setTimeout(async () => {
      fs.mkdirSync(process.env.BLUE_CAPTURE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(process.env.BLUE_CAPTURE_DIR, "blue-pet-smoke.png"),
        (await petWindow.webContents.capturePage()).toPNG()
      );
      fs.writeFileSync(
        path.join(process.env.BLUE_CAPTURE_DIR, "blue-control-smoke.png"),
        (await controlWindow.webContents.capturePage()).toPNG()
      );
      quitting = true;
      app.quit();
    }, 8000);
  }
});

app.on("before-quit", () => {
  quitting = true;
  clearInterval(wanderTimer);
  clearTimeout(petRecoveryTimer);
  clearTimeout(controlRecoveryTimer);
  voiceAbortController?.abort();
  terminalService.closeAll();
  languageService.stopAll().catch(() => {});
  debugService.stopAll().catch(() => {});
  extensionService.stop().catch(() => {});
  if (phoneBridgeServer) phoneBridgeServer.close();
  discordAddon.disconnect();
});
app.on("window-all-closed", () => {});
