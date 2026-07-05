const {
  app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell,
  Tray, Menu, nativeImage
} = require("electron");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
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
const { DiscordAddon, normalizeDiscordConfig } = require("./discord-addon.cjs");
const { advanceLocomotion } = require("./locomotion-core.cjs");
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
const blueDataDirectory = path.join(appRoot, ".blue");
const presenceSettingsPath = path.join(blueDataDirectory, "presence.json");
const observationLedgerPath = path.join(blueDataDirectory, "observations.jsonl");
const activityLedgerPath = path.join(blueDataDirectory, "presence-activity.jsonl");
const discordConfigPath = path.join(blueDataDirectory, "discord-config.json");
const expansionDatabasePath = path.join(blueDataDirectory, "expansion.db");
const desktopStateDirectory = path.join(blueDataDirectory, "desktop_state");
const sessionDataDirectory = path.join(desktopStateDirectory, "session");
fs.mkdirSync(sessionDataDirectory, { recursive: true });
app.setPath("userData", desktopStateDirectory);
app.setPath("sessionData", sessionDataDirectory);
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  quitting = true;
  app.quit();
}
let presenceSettings = loadSettings(presenceSettingsPath);
let currentConversation = "Blue Desktop Pet";
let discordConfig = loadJson(discordConfigPath, normalizeDiscordConfig());
let presenceBaseState = "idle";
let presenceOverride = null;
let presenceOverrideUntil = 0;
let speakingActive = false;
let microphoneListening = false;
let voiceAbortController = null;
let imageScanning = false;
let securityScanning = false;
wandering = presenceSettings.proactivity !== "off";

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
      env: {
        ...process.env,
        PYTHONPATH: path.join(appRoot, "src"),
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    },
    { timeoutMs, maxOutputBytes: 2097152 }
  );
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
    if (stat.isDirectory()) {
      const name = `Shared ${path.basename(filePath)} ${Date.now()}`;
      await blue(["workspace-add", name, filePath]);
      notes.push(`Folder shared read-only as '${name}'.\n${await blue(["workspace-index", name])}`);
    } else if (textTypes.has(path.extname(filePath).toLowerCase())) {
      try { notes.push(await blue(["source-add", filePath])); }
      catch (error) {
        notes.push(`Could not index ${path.basename(filePath)}: ${error.message}`);
      }
    } else if (imageTypes.has(path.extname(filePath).toLowerCase())) {
      const preserved = await preserveSharedFile(filePath);
      const { size, digest } = await recordSharedImage(filePath, preserved);
      notes.push(await shareNote(
        `[Shared image] ${path.basename(filePath)} preserved locally at ${preserved}. `
        + `${size ? `Dimensions: ${size.width}x${size.height}. ` : ""}`
        + `SHA-256: ${digest}. `
        + "Blue recorded this user-selected share in Observation History. "
        + "No automatic screen capture occurred and no vision model analyzed it."
      ));
    } else {
      const preserved = await preserveSharedFile(filePath);
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
      backgroundThrottling: false
    }
  });
  secureWebContents(petWindow.webContents);
  petWindow.setContentProtection(false);
  petWindow.loadFile("pet.html");
  petWindow.webContents.on("did-finish-load", broadcastPresence);
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
    schedulePetRecovery("window-closed");
  });
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    title: "Project Blue Control Center",
    width: 1040,
    height: 780,
    minWidth: 520,
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
      sandbox: true
    }
  });
  secureWebContents(controlWindow.webContents);
  controlWindow.loadFile("index.html");
  controlWindow.webContents.on("did-finish-load", broadcastPresence);
  controlWindow.webContents.on("render-process-gone", (_event, details) => {
    appendActivity(activityLedgerPath, "system", "Control panel renderer restarted", {
      reason: details.reason || "gone"
    });
    scheduleControlRecovery(`renderer-${details.reason || "gone"}`);
  });
  controlWindow.on("unresponsive", () => scheduleControlRecovery("unresponsive"));
  controlWindow.on("close", event => {
    if (!quitting) {
      event.preventDefault();
      controlWindow.hide();
    }
  });
}

function showControl() {
  if (!controlWindow || controlWindow.isDestroyed()) createControlWindow();
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

function registerHandlers() {
  trustedHandle("blue:chat", async (_event, message) => {
    const validatedMessage = validateChatMessage(message);
    const reply = cleanChat(
      await blue(["conversation-chat", currentConversation, validatedMessage])
    );
    appendActivity(activityLedgerPath, "conversation", "Conversation turn completed", {
      inputCharacters: validatedMessage.length,
      outputCharacters: reply.length
    });
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
    return {
      current: currentConversation,
      title: selected.title,
      history: await blue(["conversation-show", selected.id])
    };
  });
  trustedHandle("blue:doctor", async () => blue(["doctor"]));
  trustedHandle("blue:provider-status", async () => blue(["provider-check"]));
  trustedHandle("blue:model-setup", async () => blue(["model-setup"]));
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
  trustedHandle("blue:research-catalog", async () => blue(["research-catalog"]));
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
  trustedHandle("blue:presence-status", async () => presenceSnapshot());
  trustedHandle("blue:set-proactivity", async (_event, value) => {
    const requested = String(value || "").toLowerCase();
    presenceSettings = saveSettings(presenceSettingsPath, {
      ...presenceSettings,
      proactivity: requested
    });
    wandering = presenceSettings.proactivity !== "off";
    if (!wandering) {
      locomotion = "idle";
      roamTarget = null;
      roamVelocity = { x: 0, y: 0 };
      requestedLocomotion = null;
      signalLocomotion("idle");
    } else {
      phaseUntil = Date.now() + 300;
    }
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
      notes.push(await shareNote(
        `[Shared image] ${path.basename(filePath)} preserved locally at ${preserved}. `
        + `${size ? `Dimensions: ${size.width}x${size.height}. ` : ""}`
        + `SHA-256: ${digest}. `
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
    event.reply("pet:wander-state", wandering);
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
      "wave", "smile", "look", "nod", "cheer", "lean", "stretch", "dance"
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
  appendActivity(activityLedgerPath, "system", "Blue desktop presence started", {
    version: "3.3.0",
    desktopVersion,
    automaticCapture: false
  });
  registerHandlers();
  createPetWindow();
  createControlWindow();
  createTray();
  if (!process.env.BLUE_MOTION_SMOKE) startWandering();
  if (process.env.BLUE_CAPTURE_DIR) {
    setTimeout(() => {
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
  discordAddon.disconnect();
});
app.on("window-all-closed", () => {});
