const prompt = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const pasteBox = document.querySelector("#pasteBox");
const dropZone = document.querySelector("#dropZone");
const voiceSelect = document.querySelector("#voiceSelect");
let voiceEnabled = localStorage.getItem("blueVoiceEnabled") !== "false";
let voices = [];
let listening = false;
const presenceState = document.querySelector("#presenceState");
const visionState = document.querySelector("#visionState");
const microphoneState = document.querySelector("#microphoneState");
const captureState = document.querySelector("#captureState");
const presenceDetails = document.querySelector("#presenceDetails");
const proactivity = document.querySelector("#proactivity");
const observationSelect = document.querySelector("#observationSelect");
const ocrResult = document.querySelector("#ocrResult");
const useOcr = document.querySelector("#useOcr");
const conversationSelect = document.querySelector("#conversationSelect");
const commandSearch = document.querySelector("#commandSearch");
const footerConversation = document.querySelector("#footerConversation");
const footerDiscord = document.querySelector("#footerDiscord");
const footerSecurity = document.querySelector("#footerSecurity");
let lastOcrText = "";
const validTabs = new Set([
  "chat", "presence", "create", "expansion", "motion", "discord", "security", "system"
]);
const tabOrder = [
  "chat", "presence", "create", "expansion", "motion", "discord", "security", "system"
];

function selectTab(value) {
  const tab = validTabs.has(value) ? value : "chat";
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== tab;
  }
  for (const button of document.querySelectorAll("[data-tab]")) {
    const selected = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(selected));
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  localStorage.setItem("blueControlTab", tab);
  document.querySelector("main")?.scrollTo({ top: 0, behavior: "auto" });
}

for (const button of document.querySelectorAll("[data-tab]")) {
  button.onclick = () => selectTab(button.dataset.tab);
}
selectTab(localStorage.getItem("blueControlTab") || "chat");

const commandActions = [
  { terms: ["new conversation", "new chat"], run: () => {
    selectTab("chat");
    document.querySelector("#newConversationName").focus();
  } },
  { terms: ["chat", "talk"], run: () => selectTab("chat") },
  { terms: ["presence", "privacy"], run: () => selectTab("presence") },
  { terms: ["create", "idea", "lab"], run: () => selectTab("create") },
  { terms: ["expansion", "finance", "robotics", "mobile", "network", "world model"], run: () => selectTab("expansion") },
  { terms: ["movement", "motion", "expressions"], run: () => selectTab("motion") },
  { terms: ["discord"], run: () => selectTab("discord") },
  { terms: ["security", "defender", "firewall", "virus"], run: () => selectTab("security") },
  { terms: ["system", "health", "doctor"], run: () => selectTab("system") },
  { terms: ["share files", "files"], run: () => {
    selectTab("chat");
    document.querySelector("#files").click();
  } },
  { terms: ["scan image", "ocr", "image text"], run: () => {
    selectTab("chat");
    document.querySelector("#scanImage").click();
  } }
];

function runCommand(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return;
  const command = commandActions.find(item =>
    item.terms.some(term => term === query || term.includes(query) || query.includes(term))
  );
  if (command) {
    command.run();
    commandSearch.value = "";
  } else {
    append("blue", `No control matched “${value}”. Try Chat, Motion, Security, or System.`);
  }
}

commandSearch.onkeydown = event => {
  if (event.key === "Enter") runCommand(commandSearch.value);
  if (event.key === "Escape") {
    commandSearch.value = "";
    commandSearch.blur();
  }
};
window.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    commandSearch.focus();
    commandSearch.select();
    return;
  }
  if (event.ctrlKey && !event.altKey && !event.shiftKey && /^[1-8]$/.test(event.key)) {
    event.preventDefault();
    selectTab(tabOrder[Number(event.key) - 1]);
  }
});

function renderPresence(value) {
  if (!value || typeof value !== "object") return;
  presenceState.textContent = `Presence: ${value.state || "idle"}`;
  visionState.textContent = `Vision: ${value.privacy?.vision || "off"}`;
  microphoneState.textContent = `Microphone: ${value.privacy?.microphone || "off"}`;
  captureState.textContent = `Auto capture: ${value.privacy?.automaticCapture ? "On" : "Off"}`;
  if (value.proactivity) proactivity.value = value.proactivity;
  presenceDetails.textContent = [
    `State: ${value.state || "unknown"}`,
    `Proactivity: ${value.proactivity || "unknown"}`,
    `Wandering: ${value.wandering ? "active" : "paused"}`,
    "Screen observation: off",
    "Microphone capture: off",
    "Sharing mode: user-selected files and images only"
  ].join("\n");
}

function formatObservations(records) {
  if (!Array.isArray(records) || !records.length) {
    return "No image observations recorded.";
  }
  return records.map(record => [
    `${record.timestamp || "unknown time"} - ${record.name || "image"}`,
    `  Permission: ${record.permission || "unknown"}`,
    `  Size: ${record.width || "?"}x${record.height || "?"}`,
    `  Interpretation: ${record.interpretation || "not-analyzed"}`,
    `  Provider: ${record.provider || "none"}`,
    `  Extracted text: ${record.extractedText ? `${record.extractedText.length} characters` : "none"}`,
    `  SHA-256: ${record.sha256 || "unavailable"}`
  ].join("\n")).join("\n\n");
}

function loadObservationChoices(records) {
  observationSelect.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = records.length
    ? "Choose an observation"
    : "No observations available";
  observationSelect.append(empty);
  for (const record of records) {
    const option = document.createElement("option");
    option.value = record.id;
    option.textContent = `${record.timestamp || "unknown"} - ${record.name || "image"}`;
    observationSelect.append(option);
  }
}

function formatActivity(records) {
  if (!Array.isArray(records) || !records.length) {
    return "No local presence activity recorded.";
  }
  return records.map(record =>
    `${record.timestamp || "unknown time"} [${record.category || "system"}] ${record.summary || "Activity"}`
  ).join("\n");
}

function append(who, text) {
  const p = document.createElement("p");
  const b = document.createElement("b");
  b.textContent = `${who}> `;
  p.append(b, document.createTextNode(text));
  messages.append(p);
  messages.scrollTop = messages.scrollHeight;
}

function renderConversationHistory(text) {
  messages.replaceChildren();
  const value = String(text || "").trim();
  append(value ? "history" : "blue", value || "This conversation is ready.");
}

function renderConversationList(value) {
  const seen = new Set();
  const rows = (Array.isArray(value?.conversations) ? value.conversations : [])
    .filter(row => {
      const key = String(row?.title || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const current = String(value?.current || "");
  conversationSelect.replaceChildren();
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = row.title;
    option.selected = row.id === current || row.title === current;
    conversationSelect.append(option);
  }
  if (!rows.length) {
    const option = document.createElement("option");
    option.textContent = "Blue Desktop Pet";
    option.value = current;
    conversationSelect.append(option);
  }
  const selected = conversationSelect.selectedOptions[0]?.textContent || "Blue Desktop Pet";
  footerConversation.textContent = `Conversation: ${selected}`;
}

async function refreshConversations() {
  renderConversationList(await window.bluePet.conversations());
}

function speak(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  window.bluePet.setSpeaking(false);
  const utterance = new SpeechSynthesisUtterance(
    String(text).replace(/\s+/g, " ").slice(0, 900)
  );
  const selected = voices.find(voice => voice.name === voiceSelect.value);
  if (selected) utterance.voice = selected;
  utterance.rate = 1.03;
  utterance.pitch = 1.12;
  utterance.volume = 0.9;
  utterance.onstart = () => window.bluePet.setSpeaking(true);
  utterance.onend = () => window.bluePet.setSpeaking(false);
  utterance.onerror = () => window.bluePet.setSpeaking(false);
  speechSynthesis.speak(utterance);
}

function loadVoices() {
  voices = speechSynthesis.getVoices();
  const prior = localStorage.getItem("blueVoiceName");
  voiceSelect.replaceChildren();
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.append(option);
  }
  const preferred = voices.find(voice => voice.name === prior)
    || voices.find(voice => /^en/i.test(voice.lang) && /female|zira|aria|jenny/i.test(voice.name))
    || voices.find(voice => /^en/i.test(voice.lang))
    || voices[0];
  if (preferred) voiceSelect.value = preferred.name;
}

async function perform(action, useVoice = true) {
  try {
    const result = await action();
    append("blue", result);
    if (useVoice) speak(result);
    return result;
  } catch (error) {
    append("blue", `I could not complete that: ${error.message}`);
    return null;
  }
}

async function send() {
  const text = prompt.value.trim();
  if (!text) return;
  prompt.value = "";
  append("you", text);
  await perform(() => window.bluePet.chat(text));
}

async function listenOnce() {
  const button = document.querySelector("#listen");
  if (listening) {
    try { await window.bluePet.cancelListening(); }
    catch (error) { append("blue", `Could not stop listening: ${error.message}`); }
    return;
  }
  listening = true;
  button.textContent = "Stop Listening";
  button.classList.add("listening");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  window.bluePet.setSpeaking(false);
  try {
    const transcript = await window.bluePet.listenOnce();
    prompt.value = transcript;
    prompt.focus();
    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    append("blue", "I placed the local voice transcript in the message box for review.");
  } catch (error) {
    append("blue", `Voice input did not complete: ${error.message}`);
  } finally {
    listening = false;
    button.textContent = "Listen Once";
    button.classList.remove("listening");
  }
}

async function sendPasted() {
  const content = pasteBox.value.trim();
  if (!content) return;
  pasteBox.value = "";
  append("you", `[pasted]\n${content}`);
  await perform(() => window.bluePet.pasteContent(content));
}

document.querySelector("#send").onclick = send;
document.querySelector("#listen").onclick = listenOnce;
prompt.onkeydown = event => { if (event.key === "Enter") send(); };
document.querySelector("#pasteSend").onclick = sendPasted;
pasteBox.onkeydown = event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) sendPasted();
};
document.querySelector("#newConversation").onclick = async () => {
  const input = document.querySelector("#newConversationName");
  const title = input.value.trim();
  if (!title) return;
  try {
    const result = await window.bluePet.createConversation(title);
    input.value = "";
    renderConversationList(result);
    renderConversationHistory("");
    prompt.focus();
  } catch (error) {
    append("blue", `I could not create that conversation: ${error.message}`);
  }
};
document.querySelector("#newConversationName").onkeydown = event => {
  if (event.key === "Enter") document.querySelector("#newConversation").click();
};
conversationSelect.onchange = async () => {
  try {
    const result = await window.bluePet.selectConversation(conversationSelect.value);
    renderConversationHistory(result.history);
    footerConversation.textContent = `Conversation: ${result.title || "Blue Desktop Pet"}`;
  } catch (error) {
    append("blue", `I could not switch conversations: ${error.message}`);
  }
};
document.querySelector("#files").onclick = () => perform(window.bluePet.shareFiles);
document.querySelector("#images").onclick = () => perform(window.bluePet.shareImages);
document.querySelector("#folder").onclick = () => perform(window.bluePet.shareFolder);
document.querySelector("#clipboard").onclick = async () => {
  try {
    pasteBox.value = await window.bluePet.readClipboard();
    if (!pasteBox.value) append("blue", "The text clipboard is empty.");
    pasteBox.focus();
  } catch (error) {
    pasteBox.focus();
    append("blue", `I could not read the clipboard: ${error.message}`);
  }
};
document.querySelector("#scanImage").onclick = async () => {
  const button = document.querySelector("#scanImage");
  button.disabled = true;
  button.textContent = "Scanning Locally...";
  ocrResult.value = "";
  useOcr.disabled = true;
  lastOcrText = "";
  try {
    const result = await window.bluePet.scanImage();
    if (!result) {
      append("blue", "Image scan cancelled.");
      return;
    }
    lastOcrText = result.text || "";
    ocrResult.value = lastOcrText || "No text was detected in this image.";
    useOcr.disabled = !lastOcrText;
    append(
      "blue",
      `Local OCR scanned ${result.name} (${result.width}x${result.height}, ${result.language}) and found ${lastOcrText.length} text characters.`
    );
  } catch (error) {
    ocrResult.value = `OCR failed: ${error.message}`;
    append("blue", `I could not scan that image locally: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Scan Image Text Locally";
  }
};
useOcr.onclick = () => {
  if (!lastOcrText) return;
  pasteBox.value = lastOcrText;
  pasteBox.focus();
  pasteBox.scrollIntoView({ block: "center" });
};

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.add("active");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove("active");
  });
}
dropZone.addEventListener("drop", async event => {
  const files = Array.from(event.dataTransfer.files);
  if (files.length) {
    const paths = files.map(file => window.bluePet.pathForFile(file)).filter(Boolean);
    if (paths.length) await perform(() => window.bluePet.sharePaths(paths));
    return;
  }
  const content = event.dataTransfer.getData("text/plain");
  if (content) {
    pasteBox.value = content;
    await sendPasted();
  }
});

document.querySelector("#showPet").onclick = window.bluePet.showPet;
for (const button of document.querySelectorAll("[data-action]")) {
  button.onclick = () => window.bluePet.triggerAction(button.dataset.action);
}
document.querySelector("#wander").onclick = window.bluePet.toggleWander;
window.bluePet.onWanderState(value => {
  document.querySelector("#wander").textContent = value ? "Pause Wandering" : "Resume Wandering";
});
proactivity.onchange = async () => {
  try {
    renderPresence(await window.bluePet.setProactivity(proactivity.value));
  } catch (error) {
    presenceDetails.textContent = `Could not update presence: ${error.message}`;
  }
};
document.querySelector("#observationHistory").onclick = async () => {
  try {
    const records = await window.bluePet.observationHistory();
    loadObservationChoices(records);
    presenceDetails.textContent = formatObservations(records);
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
document.querySelector("#clearObservations").onclick = async () => {
  if (!confirm("Clear all observation metadata? Shared inbox files will be preserved.")) return;
  try {
    presenceDetails.textContent = await window.bluePet.clearObservationHistory();
    loadObservationChoices([]);
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
document.querySelector("#deleteObservation").onclick = async () => {
  const id = observationSelect.value;
  if (!id) {
    presenceDetails.textContent = "Load Observation History and choose a record first.";
    return;
  }
  if (!confirm("Delete this observation metadata record? The shared inbox file will be preserved.")) return;
  try {
    presenceDetails.textContent = await window.bluePet.deleteObservation(id);
    const records = await window.bluePet.observationHistory();
    loadObservationChoices(records);
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
document.querySelector("#activityHistory").onclick = async () => {
  try {
    presenceDetails.textContent = formatActivity(await window.bluePet.activityHistory());
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
document.querySelector("#clearActivity").onclick = async () => {
  if (!confirm("Clear Blue's local desktop activity timeline?")) return;
  try {
    presenceDetails.textContent = await window.bluePet.clearActivityHistory();
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
document.querySelector("#health").onclick = async () => {
  try {
    presenceDetails.textContent = JSON.stringify(await window.bluePet.health(), null, 2);
  } catch (error) {
    presenceDetails.textContent = error.message;
  }
};
window.bluePet.onPresence(renderPresence);
document.querySelector("#doctor").onclick = async () => {
  try { document.querySelector("#status").textContent = await window.bluePet.doctor(); }
  catch (error) { document.querySelector("#status").textContent = error.message; }
};
document.querySelector("#systemInfo").onclick = async () => {
  try { document.querySelector("#status").textContent = await window.bluePet.systemInfo(); }
  catch (error) { document.querySelector("#status").textContent = error.message; }
};
document.querySelector("#pendingApprovals").onclick = async () => {
  try { document.querySelector("#status").textContent = await window.bluePet.pendingApprovals(); }
  catch (error) { document.querySelector("#status").textContent = error.message; }
};
document.querySelector("#auditEvents").onclick = async () => {
  try { document.querySelector("#status").textContent = await window.bluePet.auditEvents(); }
  catch (error) { document.querySelector("#status").textContent = error.message; }
};
document.querySelector("#openProject").onclick = () => perform(window.bluePet.openProject, false);
document.querySelector("#providerStatus").onclick = () =>
  perform(window.bluePet.providerStatus, false);
document.querySelector("#connectModel").onclick = () =>
  perform(window.bluePet.connectLocalModel, false);
document.querySelector("#loadHistory").onclick = () =>
  perform(window.bluePet.conversationHistory, false);
document.querySelector("#capabilities").onclick = () =>
  perform(window.bluePet.capabilities, false);
document.querySelector("#researchCatalog").onclick = () =>
  perform(window.bluePet.researchCatalog, false);
document.querySelector("#captureIdea").onclick = async () => {
  const title = document.querySelector("#labTitle");
  const kind = document.querySelector("#labKind");
  const content = document.querySelector("#labContent");
  const confidence = document.querySelector("#labConfidence");
  const result = await perform(
    () => window.bluePet.captureIdea({
      title: title.value,
      kind: kind.value,
      content: content.value,
      confidence: Number(confidence.value)
    }),
    false
  );
  if (result) {
    title.value = "";
    content.value = "";
    confidence.value = "0";
  }
};

const expansionKinds = {
  automation: ["action_proposal", "workflow_plan", "permission_profile"],
  network: ["host_candidate", "trust_policy", "sync_plan", "revocation_plan"],
  mobile: ["invitation_plan", "notification_plan", "approval_flow"],
  community: ["content_draft", "moderation_case", "community_rule", "event_plan"],
  enterprise: ["team", "calendar_event", "inventory_item", "operation_plan"],
  finance: ["budget", "account_record", "reconciliation_note", "treasury_policy"],
  medical: ["education_note", "source_summary", "care_question", "emergency_plan"],
  robotics: ["simulation_plan", "telemetry_sample", "safety_case", "emergency_stop_plan"],
  explorer: ["mission_simulation", "science_goal", "environment_model", "risk_assessment"],
  continuity: ["seed_manifest", "migration_plan", "succession_record", "hibernation_plan"],
  world_model: ["entity", "event", "relation", "claim"],
  research: ["research_question", "source_candidate", "claim_review", "contradiction"]
};
const expansionDomain = document.querySelector("#expansionDomain");
const expansionKind = document.querySelector("#expansionKind");
const expansionDetails = document.querySelector("#expansionDetails");
function loadExpansionKinds() {
  expansionKind.replaceChildren();
  for (const kind of expansionKinds[expansionDomain.value] || []) {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = kind.replaceAll("_", " ");
    expansionKind.append(option);
  }
}
function renderExpansionStatus(value) {
  const domains = Array.isArray(value?.domains) ? value.domains : [];
  expansionDetails.textContent = [
    `Safe expansion database: ${value?.record_count ?? 0} record(s)`,
    `Audit chain: ${value?.audit_valid ? "valid" : "needs attention"}`,
    "External execution: disabled in every domain",
    "",
    ...domains.map(domain => [
      `${domain.name} [${domain.risk}] — ${domain.record_count} record(s)`,
      `  ${domain.boundary}`
    ].join("\n"))
  ].join("\n");
}
async function refreshExpansion() {
  try {
    renderExpansionStatus(await window.bluePet.expansionStatus());
  } catch (error) {
    expansionDetails.textContent = `Expansion status unavailable: ${error.message}`;
  }
}
expansionDomain.onchange = async () => {
  loadExpansionKinds();
  try {
    const records = await window.bluePet.expansionList(expansionDomain.value);
    expansionDetails.textContent = records.length
      ? records.map(record =>
        `${record.updated_at} — ${record.kind}: ${record.title}\n  ${record.boundary}`
      ).join("\n\n")
      : "No records in this domain yet.";
  } catch (error) {
    expansionDetails.textContent = error.message;
  }
};
document.querySelector("#expansionRefresh").onclick = refreshExpansion;
document.querySelector("#expansionSave").onclick = async () => {
  const title = document.querySelector("#expansionTitle");
  const content = document.querySelector("#expansionContent");
  const source = document.querySelector("#expansionSource");
  try {
    const record = await window.bluePet.expansionCreate({
      domain: expansionDomain.value,
      kind: expansionKind.value,
      title: title.value,
      content: content.value,
      source: source.value
    });
    expansionDetails.textContent = [
      `Saved ${record.domain}/${record.kind}`,
      `ID: ${record.id}`,
      `Risk: ${record.risk}`,
      `Approval required: ${record.approval_required ? "yes" : "no"}`,
      "Execution enabled: no",
      `Boundary: ${record.boundary}`
    ].join("\n");
    title.value = "";
    content.value = "";
    source.value = "";
  } catch (error) {
    expansionDetails.textContent = `Record not saved: ${error.message}`;
  }
};
loadExpansionKinds();
document.querySelector("#hide").onclick = window.bluePet.hideControl;

const discordStatus = document.querySelector("#discordStatus");
const discordToken = document.querySelector("#discordToken");
function formatDiscordStatus(value) {
  if (!value || typeof value !== "object") {
    return String(value || "Discord add-on is disconnected.");
  }
  return [
    `State: ${value.state || "disconnected"}`,
    `Configured: ${value.configured ? "yes" : "no"}`,
    `Token in memory: ${value.tokenInMemory ? "yes" : "no"}`,
    `Bot: ${value.botUser?.username || "not connected"}`,
    `Application: ${value.applicationId || "not set"}`,
    `Guild: ${value.guildId || "not set"}`,
    `Channel: ${value.channelId || "not set"}`,
    `Allowed users: ${value.allowedUserIds?.length
      ? value.allowedUserIds.join(", ")
      : "all members in the allowed channel"}`
  ].join("\n");
}
function showDiscordStatus(value) {
  discordStatus.textContent = formatDiscordStatus(value);
  footerDiscord.textContent = `Discord: ${value?.state || "disconnected"}`;
}
function readDiscordConfig() {
  return {
    applicationId: document.querySelector("#discordApplicationId").value.trim(),
    guildId: document.querySelector("#discordGuildId").value.trim(),
    channelId: document.querySelector("#discordChannelId").value.trim(),
    allowedUserIds: document.querySelector("#discordAllowedUsers").value
      .split(",").map(value => value.trim()).filter(Boolean)
  };
}
function fillDiscordConfig(value) {
  document.querySelector("#discordApplicationId").value = value?.applicationId || "";
  document.querySelector("#discordGuildId").value = value?.guildId || "";
  document.querySelector("#discordChannelId").value = value?.channelId || "";
  document.querySelector("#discordAllowedUsers").value =
    Array.isArray(value?.allowedUserIds) ? value.allowedUserIds.join(", ") : "";
}
async function discordAction(action, clearToken = false) {
  try {
    showDiscordStatus(await action());
    if (clearToken) discordToken.value = "";
  } catch (error) {
    discordStatus.textContent = `Discord action failed: ${error.message}`;
  }
}
document.querySelector("#discordSave").onclick = () =>
  discordAction(() => window.bluePet.saveDiscord(readDiscordConfig()));
document.querySelector("#discordTest").onclick = () =>
  discordAction(() => window.bluePet.testDiscord(discordToken.value));
document.querySelector("#discordRegister").onclick = () =>
  discordAction(() => window.bluePet.registerDiscord(discordToken.value));
document.querySelector("#discordConnect").onclick = () =>
  discordAction(() => window.bluePet.connectDiscord(discordToken.value), true);
document.querySelector("#discordDisconnect").onclick = () =>
  discordAction(window.bluePet.disconnectDiscord, true);
window.bluePet.onDiscordStatus(showDiscordStatus);

function boolLabel(value) {
  return ["true", "1"].includes(String(value).toLowerCase()) ? "On" : "Off";
}
function renderSecuritySnapshot(value) {
  const state = value?.state || "unavailable";
  const defender = value?.defender;
  const firewalls = Array.isArray(value?.firewallProfiles) ? value.firewallProfiles : [];
  const threats = Array.isArray(value?.threatDetections) ? value.threatDetections : [];
  const products = Array.isArray(value?.antivirusProducts) ? value.antivirusProducts : [];
  const startup = Array.isArray(value?.startupCommands) ? value.startupCommands : [];
  const stateChip = document.querySelector("#securityState");
  stateChip.textContent = `State: ${state}`;
  stateChip.className = `status-chip ${state === "healthy" ? "safe" : "attention"}`;
  document.querySelector("#securityDefender").textContent = defender
    ? `Defender real-time: ${defender.realTimeProtectionEnabled ? "On" : "Off"}`
    : "Defender: unavailable";
  document.querySelector("#securityFirewall").textContent =
    `Firewall: ${firewalls.length
      ? `${firewalls.filter(item =>
        ["true", "1"].includes(String(item.Enabled).toLowerCase())
      ).length}/${firewalls.length} on`
      : "unavailable"}`;
  document.querySelector("#securityThreats").textContent =
    `Threat records: ${threats.length}`;
  footerSecurity.textContent = `Security: ${state}`;
  document.querySelector("#securityDetails").textContent = [
    `Scanned: ${value?.scannedAt || "unknown"}`,
    "Mode: manual and read-only",
    "",
    "Microsoft Defender",
    defender ? [
      `  Running mode: ${defender.runningMode || "unknown"}`,
      `  Antivirus: ${defender.antivirusEnabled ? "On" : "Off"}`,
      `  Real-time protection: ${defender.realTimeProtectionEnabled ? "On" : "Off"}`,
      `  Behavior monitoring: ${defender.behaviorMonitorEnabled ? "On" : "Off"}`,
      `  Network inspection: ${defender.networkInspectionEnabled ? "On" : "Off"}`,
      `  Signature age: ${defender.antivirusSignatureAgeDays ?? "unknown"} day(s)`,
      `  Quick scan age: ${defender.quickScanAgeDays ?? "unknown"} day(s)`,
      `  Full scan age: ${defender.fullScanAgeDays ?? "never or unknown"} day(s)`,
      `  Reboot required: ${defender.rebootRequired ? "Yes" : "No"}`
    ].join("\n") : "  Status provider unavailable.",
    "",
    "Firewall profiles",
    ...(firewalls.length ? firewalls.map(item =>
      `  ${item.Name}: ${boolLabel(item.Enabled)}; inbound ${item.DefaultInboundAction || "unknown"}`
    ) : ["  Firewall provider unavailable."]),
    "",
    `Registered antivirus products: ${products.length}`,
    ...products.map(item => `  ${item.displayName || "Unnamed product"}`),
    "",
    `Recent Defender threat records: ${threats.length}`,
    ...threats.map(item =>
      `  Threat ${item.ThreatID || "unknown"} at ${item.InitialDetectionTime || "unknown"}`
    ),
    "",
    `Startup entries visible: ${startup.length}`,
    ...startup.slice(0, 40).map(item =>
      `  ${item.Name || "Unnamed"} — ${item.Location || "unknown location"}`
    ),
    ...(startup.length > 40 ? [`  …and ${startup.length - 40} more`] : []),
    "",
    ...(value?.providerErrors?.length
      ? ["Unavailable providers", ...value.providerErrors.map(item => `  ${item}`), ""]
      : []),
    ...(value?.limitations || [])
  ].join("\n");
}
document.querySelector("#securityScan").onclick = async () => {
  const button = document.querySelector("#securityScan");
  button.disabled = true;
  button.textContent = "Reading Status…";
  try {
    renderSecuritySnapshot(await window.bluePet.securitySnapshot());
  } catch (error) {
    document.querySelector("#securityDetails").textContent =
      `Security status could not be read: ${error.message}`;
    footerSecurity.textContent = "Security: unavailable";
  } finally {
    button.disabled = false;
    button.textContent = "Read Security Status";
  }
};

const voiceToggle = document.querySelector("#voiceToggle");
function refreshVoiceButton() {
  voiceToggle.textContent = `Voice: ${voiceEnabled ? "On" : "Off"}`;
}
voiceToggle.onclick = () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem("blueVoiceEnabled", String(voiceEnabled));
  if (!voiceEnabled) speechSynthesis.cancel();
  if (!voiceEnabled) window.bluePet.setSpeaking(false);
  refreshVoiceButton();
};
document.querySelector("#voiceTest").onclick = () =>
  speak("Hello. I am Blue. My local voice is active.");
voiceSelect.onchange = () => localStorage.setItem("blueVoiceName", voiceSelect.value);
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
refreshVoiceButton();
window.bluePet.presenceStatus().then(renderPresence)
  .catch(error => { presenceDetails.textContent = error.message; });
window.bluePet.ensureSession()
  .then(refreshConversations)
  .catch(error => append("blue", error.message));
window.bluePet.discordConfig().then(fillDiscordConfig)
  .catch(error => { discordStatus.textContent = error.message; });
window.bluePet.discordStatus().then(showDiscordStatus)
  .catch(error => { discordStatus.textContent = error.message; });
refreshExpansion();
