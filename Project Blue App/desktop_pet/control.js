const prompt = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const pasteBox = document.querySelector("#pasteBox");
const dropZone = document.querySelector("#dropZone");
const voiceSelect = document.querySelector("#voiceSelect");
const microphoneSelect = document.querySelector("#microphoneSelect");
const voiceRate = document.querySelector("#voiceRate");
const voicePitch = document.querySelector("#voicePitch");
const voiceVolume = document.querySelector("#voiceVolume");
const wakeWords = document.querySelector("#wakeWords");
const wakeListenSeconds = document.querySelector("#wakeListenSeconds");
const ownerPhraseLock = document.querySelector("#ownerPhraseLock");
const ownerPhrase = document.querySelector("#ownerPhrase");
const customVoiceNote = document.querySelector("#customVoiceNote");
let voiceEnabled = localStorage.getItem("blueVoiceEnabled") !== "false";
let voices = [];
let microphones = [];
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
const modelPickerOverlay = document.querySelector("#modelPickerOverlay");
const startupModelChoices = document.querySelector("#startupModelChoices");
const ollamaSetupOverlay = document.querySelector("#ollamaSetupOverlay");
const ollamaSetupDetails = document.querySelector("#ollamaSetupDetails");
const deepResearchPrompt = document.querySelector("#deepResearchPrompt");
const deepResearchPromptDetails = document.querySelector("#deepResearchPromptDetails");
const vtuberModelSelect = document.querySelector("#vtuberModelSelect");
const vtuberModelDetails = document.querySelector("#vtuberModelDetails");
const artifactSummary = document.querySelector("#artifactSummary");
const artifactImage = document.querySelector("#artifactImage");
const referenceSummary = document.querySelector("#referenceSummary");
const styleReferenceUseLatest = document.querySelector("#styleReferenceUseLatest");
const styleReferenceClear = document.querySelector("#styleReferenceClear");
const autonomyDetails = document.querySelector("#autonomyDetails");
const phoneBridgeDetails = document.querySelector("#phoneBridgeDetails");
let lastOcrText = "";
let vtuberModels = [];
let selectedStartupModel = "";
let pendingDeepResearchTopic = "";
const shell = window.ProjectBlueShell;
const activityBar = document.querySelector("#activityBar");
const contextSidebar = document.querySelector("#contextSidebar");
const sidebarContent = contextSidebar?.querySelector(".sidebar-content");
const sidebarTitle = contextSidebar?.querySelector(".sidebar-title");
const editorTabs = document.querySelector("#editorTabs");
const bottomPanel = document.querySelector("#bottomPanel");
const bottomPanelOutput = document.querySelector("#bottomPanelOutput");
const blueContextPanel = document.querySelector("#blueContextPanel");
const blueContextCollapse = document.querySelector("#blueContextCollapse");
const chatMoreActions = document.querySelector("#chatMoreActions");
const chatMoreMenu = document.querySelector("#chatMoreMenu");
const attachmentChips = document.querySelector("#attachmentChips");
if (localStorage.getItem("blueFinalUiPassTabsInitialized") !== "true") {
  localStorage.setItem("blueOpenEditors:workspace", "blue-chat");
  localStorage.setItem("blueEditor:workspace", "blue-chat");
  localStorage.setItem("blueFinalUiPassTabsInitialized", "true");
}
const layoutState = {
  activeActivity: shell?.normalizeActivity(localStorage.getItem("blueControlActivity") || localStorage.getItem("blueControlTab") || "workspace") || "workspace",
  activeEditors: {},
  openEditors: {},
  bottomOpen: localStorage.getItem("blueBottomPanelOpen") === "true",
  bottomTab: localStorage.getItem("blueBottomPanelTab") || "output",
  contextCollapsed: localStorage.getItem("blueContextCollapsed") === "true"
};

function allActivityEditors(activityId) {
  return shell?.editors?.[activityId] || [];
}

function readOpenEditorIds(activityId) {
  const saved = localStorage.getItem(`blueOpenEditors:${activityId}`);
  const allowed = new Set(allActivityEditors(activityId).map(editor => editor.id));
  const fallback = [shell?.defaultEditor(activityId) || "blue-chat"];
  const ids = saved ? saved.split(",").filter(id => allowed.has(id)) : [];
  return ids.length ? ids : fallback;
}

function getOpenEditorIds(activityId = layoutState.activeActivity) {
  if (!layoutState.openEditors[activityId]) layoutState.openEditors[activityId] = readOpenEditorIds(activityId);
  return layoutState.openEditors[activityId];
}

function persistOpenEditors(activityId) {
  localStorage.setItem(`blueOpenEditors:${activityId}`, getOpenEditorIds(activityId).join(","));
}

function ensureEditorOpen(activityId, editorId) {
  const allowed = new Set(allActivityEditors(activityId).map(editor => editor.id));
  const normalized = allowed.has(editorId) ? editorId : shell?.defaultEditor(activityId) || "blue-chat";
  const openIds = getOpenEditorIds(activityId);
  if (!openIds.includes(normalized)) {
    openIds.push(normalized);
    persistOpenEditors(activityId);
  }
  return normalized;
}

function getActivityEditors(activityId) {
  const openIds = new Set(getOpenEditorIds(activityId));
  return allActivityEditors(activityId).filter(editor => openIds.has(editor.id));
}

function currentEditor(activityId = layoutState.activeActivity) {
  const saved = layoutState.activeEditors[activityId] || localStorage.getItem(`blueEditor:${activityId}`) || shell?.defaultEditor(activityId) || "blue-chat";
  return ensureEditorOpen(activityId, saved);
}

function renderActivityBar() {
  if (!activityBar || !shell) return;
  activityBar.replaceChildren();
  for (const activity of shell.activities) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.activity = activity.id;
    button.title = activity.label;
    button.setAttribute("aria-label", activity.label);
    button.setAttribute("aria-selected", String(activity.id === layoutState.activeActivity));
    button.innerHTML = activity.icon;
    button.onclick = () => selectTab(activity.id);
    activityBar.append(button);
  }
}

function renderSidebar() {
  if (!contextSidebar || !sidebarContent || !shell) return;
  const activity = shell.activities.find(item => item.id === layoutState.activeActivity);
  sidebarTitle.textContent = layoutState.activeActivity === "workspace" ? "Explorer" : (activity?.label || "Workspace");
  sidebarContent.replaceChildren();
  const editors = getActivityEditors(layoutState.activeActivity);
  const open = document.createElement("div");
  open.className = "tree-section";
  open.innerHTML = `<div class="tree-heading">Open Editors</div>`;
  for (const editor of editors) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `tree-row${editor.id === currentEditor() ? " active" : ""}`;
    row.textContent = editor.title;
    row.onclick = () => selectTab(layoutState.activeActivity, editor.id);
    open.append(row);
  }
  sidebarContent.append(open);
  const items = (shell.sidebarItems?.[layoutState.activeActivity] || []).filter(item => item.toLowerCase() !== "open editors");
  const section = document.createElement("div");
  section.className = "tree-section";
  section.innerHTML = `<div class="tree-heading">${activity?.label || "Tools"}</div>`;
  for (const item of items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row";
    row.textContent = item;
    row.onclick = () => openSidebarItem(item);
    section.append(row);
  }
  sidebarContent.append(section);
}

function renderEditorTabs() {
  if (!editorTabs) return;
  editorTabs.replaceChildren();
  for (const editor of getActivityEditors(layoutState.activeActivity)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `editor-tab${editor.id === currentEditor() ? " active" : ""}`;
    button.dataset.editor = editor.id;
    button.innerHTML = `<span>${editor.title}</span>${editor.closable ? '<span class="editor-close" aria-hidden="true">x</span>' : ''}`;
    button.onclick = event => {
      if (event.target.classList.contains("editor-close")) {
        closeEditor(editor.id);
      } else {
        selectTab(layoutState.activeActivity, editor.id);
      }
    };
    button.onauxclick = event => { if (event.button === 1) closeEditor(editor.id); };
    button.oncontextmenu = event => {
      event.preventDefault();
      const action = window.prompt("Tab action: close, close others, close right, pin", "close");
      handleTabAction(editor.id, action);
    };
    editorTabs.append(button);
  }
}

function closeEditor(editorId) {
  const activity = layoutState.activeActivity;
  const editor = allActivityEditors(activity).find(item => item.id === editorId);
  if (!editor?.closable) return;
  const openIds = getOpenEditorIds(activity);
  const index = openIds.indexOf(editorId);
  if (index >= 0) openIds.splice(index, 1);
  if (!openIds.length) openIds.push(shell.defaultEditor(activity));
  if (currentEditor(activity) === editorId) layoutState.activeEditors[activity] = openIds[Math.max(0, index - 1)] || openIds[0];
  persistOpenEditors(activity);
  renderShell();
  selectTab(activity, layoutState.activeEditors[activity]);
}

function handleTabAction(editorId, action) {
  const activity = layoutState.activeActivity;
  const normalized = String(action || "").toLowerCase();
  const openIds = getOpenEditorIds(activity);
  const index = openIds.indexOf(editorId);
  if (normalized.includes("other")) {
    layoutState.openEditors[activity] = openIds.filter(id => id === editorId || !allActivityEditors(activity).find(editor => editor.id === id)?.closable);
    layoutState.activeEditors[activity] = editorId;
  } else if (normalized.includes("right") && index >= 0) {
    layoutState.openEditors[activity] = openIds.filter((id, itemIndex) => itemIndex <= index || !allActivityEditors(activity).find(editor => editor.id === id)?.closable);
  } else if (normalized.includes("pin")) {
    const editor = allActivityEditors(activity).find(item => item.id === editorId);
    if (editor) editor.closable = false;
  } else if (normalized.includes("close")) {
    closeEditor(editorId);
    return;
  }
  persistOpenEditors(activity);
  renderShell();
}

function showBottomPanel(tab = layoutState.bottomTab) {
  layoutState.bottomOpen = true;
  layoutState.bottomTab = tab;
  localStorage.setItem("blueBottomPanelOpen", "true");
  localStorage.setItem("blueBottomPanelTab", tab);
  document.body.classList.add("bottom-open");
  if (bottomPanel) bottomPanel.hidden = false;
  for (const button of document.querySelectorAll("[data-bottom-tab]")) button.classList.toggle("active", button.dataset.bottomTab === tab);
  if (bottomPanelOutput) bottomPanelOutput.textContent = `${tab} panel ready.`;
}

function hideBottomPanel() {
  layoutState.bottomOpen = false;
  localStorage.setItem("blueBottomPanelOpen", "false");
  document.body.classList.remove("bottom-open");
  if (bottomPanel) bottomPanel.hidden = true;
}

function renderBottomPanel() {
  if (layoutState.bottomOpen) showBottomPanel(layoutState.bottomTab);
  else hideBottomPanel();
}

function selectTab(value, editorValue) {
  const activity = shell?.normalizeActivity(value) || "workspace";
  const editor = ensureEditorOpen(activity, shell?.normalizeEditor(activity, editorValue || value) || "blue-chat");
  layoutState.activeActivity = activity;
  layoutState.activeEditors[activity] = editor;
  localStorage.setItem("blueControlActivity", activity);
  localStorage.setItem(`blueEditor:${activity}`, editor);
  for (const panel of document.querySelectorAll("[data-panel]")) {
    const matchesActivity = panel.dataset.panel === activity;
    const panelEditor = panel.dataset.editor || editor;
    const matchesEditor = panelEditor === editor;
    const active = matchesActivity && matchesEditor;
    panel.hidden = !active;
    panel.classList.toggle("active-editor", active);
  }
  renderShell();
  updateBlueContext();
  document.querySelector(".editor-surface")?.scrollTo({ top: 0, behavior: "auto" });
}

function renderShell() {
  renderActivityBar();
  renderSidebar();
  renderEditorTabs();
  renderBottomPanel();
}

function openSidebarItem(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("conversation") || text.includes("editor") || text.includes("chat")) return selectTab("workspace", "blue-chat");
  if (text.includes("research") || text.includes("learning")) return selectTab("workspace", "research-lab");
  if (text.includes("idea")) return selectTab("workspace", "idea-lab");
  if (text.includes("file") || text.includes("image") || text.includes("folder") || text.includes("ocr")) return selectTab("workspace", "file-preview");
  if (text.includes("voice") || text.includes("microphone")) return selectTab("ai", "voice");
  if (text.includes("avatar")) return selectTab("ai", "avatar");
  if (text.includes("movement")) return selectTab("ai", "movement");
  if (text.includes("local ai")) return selectTab("ai", "local-ai");
  if (text.includes("security")) return selectTab("systems", "security");
  if (text.includes("hardware")) return selectTab("systems", "hardware");
  if (text.includes("function")) return selectTab("systems", "function-health");
  if (text.includes("diagnostic")) return selectTab("tools", "diagnostics");
  if (text.includes("doctor")) return selectTab("tools", "blue-doctor");
  if (text.includes("pc info")) return selectTab("tools", "pc-actions");
  if (text.includes("obs") || text.includes("scene")) return selectTab("streaming", "obs");
  if (text.includes("platform")) return selectTab("streaming", "platforms");
  if (text.includes("moderation")) return selectTab("streaming", "moderation");
  if (text.includes("discord") || text.includes("command") || text.includes("allowed")) return selectTab("discord", "connection");
  if (text.includes("node")) return selectTab("mesh", "nodes");
  if (text.includes("sync") || text.includes("pairing")) return selectTab("mesh", "sync");
  if (text.includes("conflict")) return selectTab("mesh", "conflicts");
  if (text.includes("ledger")) return selectTab("mesh", "ledger");
}

for (const button of document.querySelectorAll("[data-open-activity]")) {
  button.onclick = () => selectTab(button.dataset.openActivity, button.dataset.openEditor);
}
for (const button of document.querySelectorAll("[data-open-editor]")) {
  button.onclick = () => selectTab(layoutState.activeActivity, button.dataset.openEditor);
}
for (const button of document.querySelectorAll("[data-bottom-tab]")) {
  button.onclick = () => showBottomPanel(button.dataset.bottomTab);
}
selectTab(layoutState.activeActivity, localStorage.getItem(`blueEditor:${layoutState.activeActivity}`));

function updateBlueContext() {
  const set = (id, value) => { const element = document.querySelector(`#${id}`); if (element) element.textContent = value || "Not available"; };
  set("ctxGoal", layoutState.activeActivity === "workspace" ? "Work with Blue" : shell?.activities?.find(item => item.id === layoutState.activeActivity)?.label || "Idle");
  set("ctxTask", allActivityEditors(layoutState.activeActivity).find(editor => editor.id === currentEditor())?.title || "None selected");
  set("ctxProject", "Project Blue");
  set("ctxFile", currentEditor() ? `${currentEditor()}.editor` : "None selected");
  set("ctxMemory", conversationSelect?.selectedOptions?.[0]?.textContent || "Not available");
  set("ctxSuggestions", layoutState.activeActivity === "workspace" ? "Use More Actions for research, OCR, and ideas" : "Idle");
  set("ctxServices", `BlueMesh ${document.querySelector("#footerBlueMesh")?.textContent || "unknown"}; Discord ${footerDiscord?.textContent || "unknown"}; OBS ${document.querySelector("#footerObs")?.textContent || "unknown"}`);
  set("ctxConfidence", "Not available");
  set("ctxApprovals", "None");
  document.body.classList.toggle("context-collapsed", layoutState.contextCollapsed);
}

function toggleMoreMenu(force) {
  if (!chatMoreMenu || !chatMoreActions) return;
  const show = typeof force === "boolean" ? force : chatMoreMenu.hidden;
  chatMoreMenu.hidden = !show;
  chatMoreActions.setAttribute("aria-expanded", String(show));
}

chatMoreActions?.addEventListener("click", event => {
  event.stopPropagation();
  toggleMoreMenu();
});
window.addEventListener("click", event => {
  if (chatMoreMenu && !chatMoreMenu.hidden && !event.target.closest(".more-menu-wrap")) toggleMoreMenu(false);
});
chatMoreMenu?.addEventListener("click", event => { if (event.target.closest("button")) toggleMoreMenu(false); });
blueContextCollapse?.addEventListener("click", () => {
  layoutState.contextCollapsed = !layoutState.contextCollapsed;
  localStorage.setItem("blueContextCollapsed", String(layoutState.contextCollapsed));
  updateBlueContext();
});
updateBlueContext();

const commandActions = [
  { terms: ["new conversation", "new chat"], run: () => { selectTab("workspace", "blue-chat"); document.querySelector("#newConversationName").focus(); } },
  { terms: ["workspace", "chat", "talk"], run: () => selectTab("workspace", "blue-chat") },
  { terms: ["research", "learning", "deep research"], run: () => selectTab("workspace", "research-lab") },
  { terms: ["idea", "lab", "create"], run: () => selectTab("workspace", "idea-lab") },
  { terms: ["files", "images", "folder", "ocr", "scan image"], run: () => selectTab("workspace", "file-preview") },
  { terms: ["voice", "wake", "listen", "microphone"], run: () => selectTab("ai", "voice") },
  { terms: ["presence", "privacy"], run: () => selectTab("ai", "presence") },
  { terms: ["movement", "motion", "avatar", "expressions"], run: () => selectTab("ai", "avatar") },
  { terms: ["local ai", "model", "ollama"], run: () => selectTab("ai", "local-ai") },
  { terms: ["security", "defender", "firewall", "virus"], run: () => selectTab("systems", "security") },
  { terms: ["system", "health", "doctor", "diagnostics"], run: () => selectTab("tools", "diagnostics") },
  { terms: ["obs", "stream", "streaming", "scenes"], run: () => selectTab("streaming", "streaming-studio") },
  { terms: ["discord"], run: () => selectTab("discord", "connection") },
  { terms: ["bluemesh", "mesh", "sync", "nodes"], run: () => selectTab("mesh", "identity") },
  { terms: ["output", "problems", "activity log", "security log"], run: () => showBottomPanel("output") },
  { terms: ["latest result", "show result", "preview result", "artifact"], run: () => { selectTab("workspace", "generated-result"); loadCurrentArtifact(); } },
  { terms: ["share files"], run: () => { selectTab("workspace", "blue-chat"); document.querySelector("#files").click(); } },
  { terms: ["scan image", "image text"], run: () => { selectTab("workspace", "blue-chat"); document.querySelector("#scanImage").click(); } }
];

function runCommand(value) {
  const query = String(value || "").trim().replace(/^>/, "").toLowerCase();
  if (!query) return;
  const command = commandActions.find(item => item.terms.some(term => term === query || term.includes(query) || query.includes(term)));
  if (command) {
    command.run();
    commandSearch.value = "";
  } else {
    append("blue", `No control matched "${value}". Try Workspace, Research, Streaming, BlueMesh, Security, or Tools.`);
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

function renderArtifactPreview(artifact) {
  if (!artifact) {
    artifactSummary.textContent = "No generated result is ready yet.";
    artifactImage.hidden = true;
    artifactImage.removeAttribute("src");
    return;
  }
  const lines = [
    `${artifact.title || "Latest result"} (${artifact.kind || "file"})`,
    artifact.exists ? artifact.path : `Missing: ${artifact.path}`,
    artifact.note || "",
    artifact.imageSize ? `Image: ${artifact.imageSize.width} x ${artifact.imageSize.height}` : ""
  ].filter(Boolean);
  artifactSummary.textContent = lines.join("\n");
  if (artifact.canInlinePreview && artifact.imageDataUrl) {
    artifactImage.src = artifact.imageDataUrl;
    artifactImage.hidden = false;
  } else {
    artifactImage.hidden = true;
    artifactImage.removeAttribute("src");
  }
}

async function loadCurrentArtifact() {
  try {
    renderArtifactPreview(await window.bluePet.currentArtifact());
  } catch (error) {
    artifactSummary.textContent = `Could not load latest result: ${error.message}`;
    artifactImage.hidden = true;
    artifactImage.removeAttribute("src");
  }
}

function renderOutfitReference(value) {
  const lines = [
    value?.message || "No outfit reference image is set.",
    value?.ready && value?.path ? `Base: ${value.path}` : "",
    value?.note ? `Base note: ${value.note}` : "",
    value?.styleReady && value?.stylePath ? `Outfit/style: ${value.stylePath}` : "",
    value?.styleNote ? `Outfit/style note: ${value.styleNote}` : ""
  ].filter(Boolean);
  referenceSummary.textContent = lines.join("\n");
}

async function loadOutfitReference() {
  try {
    renderOutfitReference(await window.bluePet.outfitReferenceStatus());
  } catch (error) {
    referenceSummary.textContent = `Could not load outfit reference: ${error.message}`;
  }
}

function append(who, text) {
  const group = document.createElement("div");
  const normalized = String(who || "blue").toLowerCase();
  group.className = `message-group ${normalized === "you" || normalized === "user" ? "user-message" : "blue-message"}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = normalized === "you" || normalized === "user" ? "You" : normalized === "history" ? "H" : "B";
  const body = document.createElement("div");
  body.className = "message-body";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${normalized === "you" ? "You" : normalized === "history" ? "History" : "Blue"} ? ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;
  body.append(meta, content);
  group.append(avatar, body);
  messages.append(group);
  messages.scrollTop = messages.scrollHeight;
  updateBlueContext();
}

function modelKindLabel(model) {
  return `${String(model.type || "3d").toUpperCase()} ${model.format || "model"}`;
}

function renderVtuberModels(value, showStartupPicker = false) {
  vtuberModels = Array.isArray(value?.models) ? value.models : [];
  const current = String(value?.current || vtuberModels[0]?.id || "");
  selectedStartupModel = current;
  vtuberModelSelect.replaceChildren();
  startupModelChoices.replaceChildren();
  for (const model of vtuberModels) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.name} (${modelKindLabel(model)})`;
    option.selected = model.id === current;
    vtuberModelSelect.append(option);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "model-choice";
    card.dataset.modelId = model.id;
    card.setAttribute("aria-selected", String(model.id === current));
    card.innerHTML = [
      `<strong>${escapeHtml(model.name)}</strong>`,
      `<span>${escapeHtml(modelKindLabel(model))}</span>`,
      `<p>${escapeHtml(model.description || "VTuber model")}</p>`
    ].join("");
    card.onclick = () => chooseStartupModel(model.id);
    startupModelChoices.append(card);
  }
  const active = vtuberModels.find(model => model.id === current) || vtuberModels[0];
  vtuberModelDetails.textContent = active
    ? [
      `Active: ${active.name}`,
      `Type: ${modelKindLabel(active)}`,
      `Path: ${active.path}`,
      "",
      active.description || ""
    ].join("\n")
    : "No VTuber models found.";
  if (showStartupPicker) modelPickerOverlay.hidden = false;
}

function chooseStartupModel(id) {
  selectedStartupModel = id;
  for (const card of startupModelChoices.querySelectorAll(".model-choice")) {
    card.setAttribute("aria-selected", String(card.dataset.modelId === id));
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

async function loadVtuberModels(showStartupPicker = false) {
  try {
    renderVtuberModels(await window.bluePet.vtuberModels(), showStartupPicker);
  } catch (error) {
    vtuberModelDetails.textContent = `Could not load VTuber models: ${error.message}`;
  }
}

function formatOllamaSetupStatus(state) {
  const status = state?.providerStatus || {};
  const localReady = status.local_first_available || (
    status.provider === "ollama" && status.available
  );
  return [
    `Local-first: ${status.prefer_local_provider ? "on" : "off"}`,
    `Ollama ready: ${localReady ? "yes" : "not yet"}`,
    `Configured model: ${status.configured_model || "none"}`,
    "",
    "Download opens the official Ollama Windows page.",
    "After installing, come back and choose Already Installed."
  ].join("\n");
}

async function showOllamaSetupIfNeeded() {
  try {
    const state = await window.bluePet.setupState();
    const status = state?.providerStatus || {};
    const localReady = status.local_first_available || (
      status.provider === "ollama" && status.available
    );
    if (localReady || ["accepted", "installed", "skipped"].includes(state?.ollamaPrompt)) {
      return;
    }
    ollamaSetupDetails.textContent = formatOllamaSetupStatus(state);
    ollamaSetupOverlay.hidden = false;
  } catch (error) {
    append("blue", `Ollama setup check failed: ${error.message}`);
  }
}

async function answerOllamaSetup(choice) {
  try {
    const result = await window.bluePet.setupOllamaChoice(choice);
    ollamaSetupOverlay.hidden = true;
    append("blue", result);
  } catch (error) {
    ollamaSetupDetails.textContent = `Setup action failed: ${error.message}`;
  }
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

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " link omitted. ")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, " file path omitted. ")
    .replace(/\b[a-f0-9]{8}-[a-f0-9-]{20,}\b/gi, " id omitted. ")
    .replace(/\b[0-9a-f]{32,}\b/gi, " id omitted. ")
    .replace(/^\s*\[[^\]]+\]\s*/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~>#|=[\]{}]/g, " ")
    .replace(/[\\/]{2,}/g, " ")
    .replace(/[-–—]{3,}/g, ". ")
    .replace(/[.]{3,}/g, ". ")
    .replace(/[!?]{2,}/g, match => match[0])
    .replace(/\b(?:id|sha|url):\s*[a-z0-9._:/-]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function voiceNumberSetting(key, fallback, min, max) {
  const value = Number(localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(value, max));
}

function loadVoiceTuning() {
  voiceRate.value = String(voiceNumberSetting("blueVoiceRate", 0.94, 0.65, 1.35));
  voicePitch.value = String(voiceNumberSetting("blueVoicePitch", 1.02, 0.7, 1.4));
  voiceVolume.value = String(voiceNumberSetting("blueVoiceVolume", 0.95, 0.2, 1));
}

function saveVoiceTuning() {
  localStorage.setItem("blueVoiceRate", voiceRate.value);
  localStorage.setItem("blueVoicePitch", voicePitch.value);
  localStorage.setItem("blueVoiceVolume", voiceVolume.value);
}

function speak(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  const spoken = cleanTextForSpeech(text);
  if (!spoken) return;
  speechSynthesis.cancel();
  window.bluePet.setSpeaking(false);
  const utterance = new SpeechSynthesisUtterance(spoken);
  const selected = voices.find(voice => voice.name === voiceSelect.value);
  if (selected) utterance.voice = selected;
  utterance.rate = voiceNumberSetting("blueVoiceRate", 0.94, 0.65, 1.35);
  utterance.pitch = voiceNumberSetting("blueVoicePitch", 1.02, 0.7, 1.4);
  utterance.volume = voiceNumberSetting("blueVoiceVolume", 0.95, 0.2, 1);
  utterance.onstart = () => window.bluePet.setSpeaking(true);
  utterance.onend = () => window.bluePet.setSpeaking(false);
  utterance.onerror = () => window.bluePet.setSpeaking(false);
  speechSynthesis.speak(utterance);
}

function skipVoice() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  window.bluePet.setSpeaking(false);
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
    || voices.find(voice => /^en/i.test(voice.lang) && /natural|neural|online/i.test(voice.name))
    || voices.find(voice => /^en/i.test(voice.lang) && /jenny|aria|zira|female/i.test(voice.name))
    || voices.find(voice => /^en/i.test(voice.lang))
    || voices[0];
  if (preferred) voiceSelect.value = preferred.name;
  window.bluePet.voiceSettings()
    .then(renderVoiceSettings)
    .catch(error => append("blue", `Voice settings unavailable: ${error.message}`));
}

async function loadMicrophones() {
  try {
    microphones = await window.bluePet.microphones();
    const previous = microphoneSelect.value;
    microphoneSelect.replaceChildren();
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Windows default microphone";
    microphoneSelect.append(defaultOption);
    for (const mic of microphones) {
      const option = document.createElement("option");
      option.value = mic.name;
      option.textContent = mic.name;
      microphoneSelect.append(option);
    }
    if (previous && Array.from(microphoneSelect.options).some(option => option.value === previous)) {
      microphoneSelect.value = previous;
    }
  } catch (error) {
    microphoneSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `Could not list microphones: ${error.message}`;
    microphoneSelect.append(option);
  }
}

async function perform(action, useVoice = true) {
  try {
    const result = await action();
    append("blue", result);
    if (typeof result === "string" && /\b(latest result|visual .*preview|preview .*ready|result is ready)\b/i.test(result)) {
      await loadCurrentArtifact();
    }
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

function readVoiceSettingsForm() {
  return {
    wakeWords: wakeWords.value.split(",").map(value => value.trim()).filter(Boolean),
    listenSeconds: Number(wakeListenSeconds.value || 10),
    ownerPhraseLock: ownerPhraseLock.checked,
    ownerPhrase: ownerPhrase.value,
    microphoneName: microphoneSelect.value,
    outputVoiceName: voiceSelect.value,
    customVoiceNote: customVoiceNote.value
  };
}

function renderVoiceSettings(value) {
  wakeWords.value = Array.isArray(value?.wakeWords)
    ? value.wakeWords.join(", ")
    : "hey blue, hay blue, blue";
  wakeListenSeconds.value = String(value?.listenSeconds || 10);
  ownerPhraseLock.checked = Boolean(value?.ownerPhraseLock);
  ownerPhrase.value = value?.ownerPhrase || "";
  if (value?.microphoneName) {
    const exists = Array.from(microphoneSelect.options)
      .some(option => option.value === value.microphoneName);
    if (!exists) {
      const option = document.createElement("option");
      option.value = value.microphoneName;
      option.textContent = `${value.microphoneName} (saved)`;
      microphoneSelect.append(option);
    }
    microphoneSelect.value = value.microphoneName;
  }
  customVoiceNote.value = value?.customVoiceNote || "";
  if (value?.outputVoiceName && voices.some(voice => voice.name === value.outputVoiceName)) {
    voiceSelect.value = value.outputVoiceName;
  }
}

function renderLocalComputeStatus(value) {
  let status = value;
  if (typeof value === "string") {
    try { status = JSON.parse(value); }
    catch { return; }
  }
  if (!status || typeof status !== "object") return;
  document.querySelector("#preferLocalProvider").checked =
    Boolean(status.prefer_local_provider);
  const compute = status.local_compute || {};
  if (Number.isFinite(Number(compute.local_ram_gb))) {
    document.querySelector("#localRamGb").value = String(compute.local_ram_gb);
  }
  if (Number.isFinite(Number(compute.ollama_context_tokens))) {
    document.querySelector("#ollamaContextTokens").value = String(compute.ollama_context_tokens);
  }
  if (Number.isFinite(Number(compute.ollama_gpu_layers))) {
    document.querySelector("#ollamaGpuLayers").value = String(compute.ollama_gpu_layers);
  }
}

function renderAutonomyStatus(value) {
  if (!value || typeof value !== "object") return;
  document.querySelector("#awayMode").checked = Boolean(value.awayMode);
  document.querySelector("#autoLowRiskTasks").checked = Boolean(value.autoLowRiskTasks);
  document.querySelector("#askBeforeDeepResearch").checked = Boolean(value.askBeforeDeepResearch);
  document.querySelector("#phoneApprovalQueue").checked = Boolean(value.phoneApprovalQueue);
  document.querySelector("#selfLearningSuggestions").checked = Boolean(value.selfLearningSuggestions);
  document.querySelector("#selfImprovementProposals").checked = Boolean(value.selfImprovementProposals);
  document.querySelector("#phoneBridgeNoToken").checked = Boolean(value.phoneBridgeNoToken);
  document.querySelector("#prepareHighRiskWhileWaiting").checked = Boolean(value.prepareHighRiskWhileWaiting);
  document.querySelector("#autonomyNotes").value = value.notes || "";
  const until = value.fullControlUntil
    ? new Date(value.fullControlUntil).toLocaleString()
    : "off";
  autonomyDetails.textContent = [
    `Full Control: ${value.fullControlActive ? `active until ${until}` : "off"}`,
    "",
    JSON.stringify(value, null, 2)
  ].join("\n");
}

function readAutonomyForm() {
  return {
    awayMode: document.querySelector("#awayMode").checked,
    autoLowRiskTasks: document.querySelector("#autoLowRiskTasks").checked,
    askBeforeDeepResearch: document.querySelector("#askBeforeDeepResearch").checked,
    phoneApprovalQueue: document.querySelector("#phoneApprovalQueue").checked,
    selfLearningSuggestions: document.querySelector("#selfLearningSuggestions").checked,
    selfImprovementProposals: document.querySelector("#selfImprovementProposals").checked,
    phoneBridgeNoToken: document.querySelector("#phoneBridgeNoToken").checked,
    prepareHighRiskWhileWaiting: document.querySelector("#prepareHighRiskWhileWaiting").checked,
    notes: document.querySelector("#autonomyNotes").value
  };
}

function renderPhoneBridgeStatus(value) {
  if (!value || typeof value !== "object") return;
  phoneBridgeDetails.textContent = value.running
    ? [
      "Network bridge is running.",
      `Network URL: ${value.url}`,
      value.tokenRequired ? `Pairing token: ${value.token}` : "Pairing token: not required",
      "",
      value.note || "",
      "Any trusted PC on this LAN: open the URL in Chrome or Edge.",
      "Voice input: click Voice Input on that device and allow microphone permission.",
      "Xfinity modem/router: carries the LAN traffic, but Blue runs on this Project Blue PC.",
      "Devices can say No Thanks on the page; Blue will not install itself or control that device.",
      "Android: open the URL in Chrome, then tap Install or Add to Home screen.",
      "iPhone: open the URL in Safari, tap Share, then Add to Home Screen."
    ].join("\n")
    : "Network bridge is stopped.";
}

function showDeepResearchPrompt(value) {
  pendingDeepResearchTopic = String(value?.topic || "").trim();
  if (!pendingDeepResearchTopic) return;
  deepResearchPromptDetails.textContent = [
    `Topic: ${pendingDeepResearchTopic}`,
    "",
    "Blue can start a deeper internet research pass now. This may take a while and will save sources/notes to the Learning Queue."
  ].join("\n");
  deepResearchPrompt.hidden = false;
}

async function wakeListen() {
  const button = document.querySelector("#wakeListen");
  if (listening) {
    try { await window.bluePet.cancelListening(); }
    catch (error) { append("blue", `Could not stop listening: ${error.message}`); }
    return;
  }
  listening = true;
  button.textContent = "Stop Wake Listen";
  button.classList.add("listening");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  window.bluePet.setSpeaking(false);
  try {
    await window.bluePet.saveVoiceSettings(readVoiceSettingsForm());
    const result = await window.bluePet.wakeListen();
    if (!result.activated) {
      append("blue", `Wake listen ignored: ${result.reason}`);
      return;
    }
    const command = String(result.command || "").trim();
    append("you", `[${result.wakeWord}] ${command || result.transcript}`);
    if (result.reply) speak(result.reply);
    if (command) {
      await perform(() => window.bluePet.chat(command));
    } else {
      prompt.value = "";
      prompt.focus();
      append("blue", result.reply || "I heard the wake word. Tell me the command after it next time, or type it here.");
    }
  } catch (error) {
    append("blue", `Wake listen did not complete: ${error.message}`);
  } finally {
    listening = false;
    button.textContent = "Wake Listen";
    button.classList.remove("listening");
  }
}

async function enrollOwnerPhrase() {
  const button = document.querySelector("#enrollOwnerPhrase");
  if (listening) {
    append("blue", "Stop the current listening session before enrolling an owner phrase.");
    return;
  }
  listening = true;
  button.textContent = "Listening...";
  button.classList.add("listening");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  try {
    append("blue", "Say a private owner phrase now. This saves the phrase text, not a biometric voiceprint.");
    const transcript = await window.bluePet.listenOnce();
    const phrase = String(transcript || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (phrase.length < 4) throw new Error("That phrase was too short to use as a lock.");
    ownerPhrase.value = phrase;
    ownerPhraseLock.checked = true;
    const saved = await window.bluePet.saveVoiceSettings(readVoiceSettingsForm());
    renderVoiceSettings(saved);
    append("blue", "Owner phrase lock is on. For now this checks the private phrase text; true speaker voiceprint learning is still a later model add-on.");
  } catch (error) {
    append("blue", `Owner phrase enrollment did not complete: ${error.message}`);
  } finally {
    listening = false;
    button.textContent = "Enroll Owner Phrase";
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
document.querySelector("#chatVoiceSkip").onclick = skipVoice;
document.querySelector("#wakeListen").onclick = wakeListen;
document.querySelector("#enrollOwnerPhrase").onclick = enrollOwnerPhrase;
document.querySelector("#refreshMicrophones").onclick = loadMicrophones;
document.querySelector("#openMicSettings").onclick = async () => {
  try {
    append("blue", await window.bluePet.openMicrophoneSettings());
  } catch (error) {
    append("blue", `Could not open microphone settings: ${error.message}`);
  }
};
prompt.onkeydown = event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } };
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
document.querySelector("#deleteConversation").onclick = async () => {
  const button = document.querySelector("#deleteConversation");
  const id = conversationSelect.value;
  const title = conversationSelect.selectedOptions[0]?.textContent || "this conversation";
  if (!id || !confirm(`Delete "${title}" and its saved messages?\n\nLearned memories, research notes, sources, and artifacts will stay saved.`)) return;
  button.disabled = true;
  button.textContent = "Deleting...";
  try {
    const result = await window.bluePet.deleteConversation(id);
    renderConversationList(result);
    renderConversationHistory(result.history || "");
    append("blue", `Deleted chat: ${result.deletedTitle || title}. Learned memories, research notes, sources, and artifacts were kept.`);
    footerConversation.textContent = `Conversation: ${result.title || "Blue Desktop Pet"}`;
    prompt.focus();
  } catch (error) {
    append("blue", `I could not delete that conversation: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Delete Chat";
  }
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
document.querySelector("#images").onclick = () => perform(async () => {
  const result = await window.bluePet.shareImages();
  await loadOutfitReference();
  return result;
});
document.querySelector("#folder").onclick = () => perform(window.bluePet.shareFolder);
document.querySelector("#referenceStatus").onclick = loadOutfitReference;
document.querySelector("#referenceUseLatest").onclick = async () => {
  try {
    renderOutfitReference(await window.bluePet.useLatestArtifactAsReference());
  } catch (error) {
    referenceSummary.textContent = `Could not set reference: ${error.message}`;
  }
};
styleReferenceUseLatest.onclick = async () => {
  try {
    renderOutfitReference(await window.bluePet.useLatestArtifactAsOutfitStyleReference());
  } catch (error) {
    referenceSummary.textContent = `Could not set outfit/style reference: ${error.message}`;
  }
};
document.querySelector("#referenceClear").onclick = async () => {
  try {
    renderOutfitReference(await window.bluePet.clearOutfitReference());
  } catch (error) {
    referenceSummary.textContent = `Could not clear reference: ${error.message}`;
  }
};
styleReferenceClear.onclick = async () => {
  try {
    renderOutfitReference(await window.bluePet.clearOutfitStyleReference());
  } catch (error) {
    referenceSummary.textContent = `Could not clear outfit/style reference: ${error.message}`;
  }
};
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

async function handleDroppedData(event) {
  const files = Array.from(event.dataTransfer.files);
  if (files.length) {
    const paths = files.map(file => window.bluePet.pathForFile(file)).filter(Boolean);
    if (paths.length) {
      append("you", `[dropped ${paths.length} item${paths.length === 1 ? "" : "s"}]\n${paths.join("\n")}`);
      await perform(async () => {
        const result = await window.bluePet.sharePaths(paths);
        await loadCurrentArtifact();
        await loadOutfitReference();
        return result;
      });
    }
    return;
  }
  const content = event.dataTransfer.getData("text/plain");
  if (content) {
    append("you", `[dropped text]\n${content}`);
    await perform(() => window.bluePet.pasteContent(content));
  }
}

function enableDropTarget(element, activeClass) {
  for (const eventName of ["dragenter", "dragover"]) {
    element.addEventListener(eventName, event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      element.classList.add(activeClass);
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    element.addEventListener(eventName, event => {
      event.preventDefault();
      element.classList.remove(activeClass);
    });
  }
  element.addEventListener("drop", handleDroppedData);
}

enableDropTarget(dropZone, "active");
enableDropTarget(messages, "active-drop");

document.querySelector("#showPet").onclick = window.bluePet.showPet;
document.querySelector("#refreshVtuberModels").onclick = () => loadVtuberModels(false);
document.querySelector("#applyVtuberModel").onclick = async () => {
  try {
    const selected = await window.bluePet.selectVtuberModel(vtuberModelSelect.value);
    await loadVtuberModels(false);
    append("blue", `Switched VTuber model to ${selected.name}.`);
  } catch (error) {
    append("blue", `I could not switch models: ${error.message}`);
  }
};
document.querySelector("#startupModelUse").onclick = async () => {
  try {
    const selected = await window.bluePet.selectVtuberModel(selectedStartupModel || vtuberModelSelect.value);
    modelPickerOverlay.hidden = true;
    await loadVtuberModels(false);
    append("blue", `Using ${selected.name}.`);
  } catch (error) {
    append("blue", `I could not select that model: ${error.message}`);
  }
};
document.querySelector("#startupModelKeep").onclick = () => {
  modelPickerOverlay.hidden = true;
};
document.querySelector("#ollamaDownload").onclick = () => answerOllamaSetup("accepted");
document.querySelector("#ollamaInstalled").onclick = () => answerOllamaSetup("installed");
document.querySelector("#ollamaLater").onclick = () => answerOllamaSetup("later");
document.querySelector("#ollamaSkip").onclick = () => answerOllamaSetup("skipped");
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
document.querySelector("#pcActionGuidelines").onclick = async () => {
  try { document.querySelector("#status").textContent = await window.bluePet.pcActionGuidelines(); }
  catch (error) { document.querySelector("#status").textContent = error.message; }
};
document.querySelector("#pcActionRun").onclick = async () => {
  const status = document.querySelector("#status");
  try {
    status.textContent = await window.bluePet.pcActionRun({
      action: document.querySelector("#pcActionType").value,
      target: document.querySelector("#pcActionTarget").value,
      content: document.querySelector("#pcActionContent").value,
      approved: document.querySelector("#pcActionApprove").checked,
      allowTaskWithoutApprovals: document.querySelector("#pcActionNoMoreApprovals").checked
    });
    document.querySelector("#pcActionApprove").checked = false;
    await loadCurrentArtifact();
  } catch (error) {
    status.textContent = `PC action blocked: ${error.message}`;
  }
};
document.querySelector("#saveAutonomy").onclick = async () => {
  try {
    renderAutonomyStatus(await window.bluePet.saveAutonomy(readAutonomyForm()));
  } catch (error) {
    autonomyDetails.textContent = `Could not save away rules: ${error.message}`;
  }
};
document.querySelector("#fullControlGrant").onclick = async () => {
  const minutes = Number(document.querySelector("#fullControlMinutes").value || 60);
  if (!confirm("Grant Blue a timed Full Control session for allowed local tasks? High-risk actions will still be queued for approval.")) return;
  try {
    renderAutonomyStatus(await window.bluePet.grantFullControl(minutes));
  } catch (error) {
    autonomyDetails.textContent = `Could not grant Full Control: ${error.message}`;
  }
};
document.querySelector("#fullControlRevoke").onclick = async () => {
  try {
    renderAutonomyStatus(await window.bluePet.revokeFullControl());
  } catch (error) {
    autonomyDetails.textContent = `Could not revoke Full Control: ${error.message}`;
  }
};
document.querySelector("#phoneBridgeStarter").onclick = async () => {
  try {
    document.querySelector("#status").textContent = await window.bluePet.createPhoneBridgeStarter();
    await loadCurrentArtifact();
  } catch (error) {
    document.querySelector("#status").textContent = `Could not create phone bridge starter: ${error.message}`;
  }
};
document.querySelector("#phoneApprovalQueueShow").onclick = async () => {
  try {
    autonomyDetails.textContent = await window.bluePet.phoneApprovalQueue();
  } catch (error) {
    autonomyDetails.textContent = `Could not load phone approval queue: ${error.message}`;
  }
};
document.querySelector("#phoneBridgeStart").onclick = async () => {
  try {
    renderPhoneBridgeStatus(await window.bluePet.startPhoneBridge());
  } catch (error) {
    phoneBridgeDetails.textContent = `Could not start phone bridge: ${error.message}`;
  }
};
document.querySelector("#phoneBridgeStop").onclick = async () => {
  try {
    renderPhoneBridgeStatus(await window.bluePet.stopPhoneBridge());
  } catch (error) {
    phoneBridgeDetails.textContent = `Could not stop phone bridge: ${error.message}`;
  }
};
document.querySelector("#deepResearchStart").onclick = async () => {
  if (!pendingDeepResearchTopic) return;
  const topic = pendingDeepResearchTopic;
  pendingDeepResearchTopic = "";
  deepResearchPrompt.hidden = true;
  append("blue", `Starting deep search for: ${topic}`);
  const result = await perform(() => window.bluePet.learningResearch({ topic }), false);
  if (result) append("blue", "Deep search is done and saved in the Learning Queue.");
};
document.querySelector("#deepResearchLater").onclick = () => {
  pendingDeepResearchTopic = "";
  deepResearchPrompt.hidden = true;
  append("blue", "Okay. I saved the learning request and did not start deep search yet.");
};
document.querySelector("#artifactRefresh").onclick = loadCurrentArtifact;
document.querySelector("#artifactOpen").onclick = async () => {
  const status = document.querySelector("#status");
  try {
    status.textContent = await window.bluePet.openArtifact();
    await loadCurrentArtifact();
  } catch (error) {
    status.textContent = `Could not open latest result: ${error.message}`;
  }
};
document.querySelector("#artifactReveal").onclick = async () => {
  const status = document.querySelector("#status");
  try {
    status.textContent = await window.bluePet.revealArtifact();
  } catch (error) {
    status.textContent = `Could not show latest result: ${error.message}`;
  }
};
document.querySelector("#providerStatus").onclick = () =>
  perform(async () => {
    const status = await window.bluePet.providerStatus();
    renderLocalComputeStatus(status);
    return status;
  }, false);
document.querySelector("#connectModel").onclick = () =>
  perform(window.bluePet.connectLocalModel, false);
document.querySelector("#saveLocalCompute").onclick = () =>
  perform(async () => {
    const status = await window.bluePet.saveLocalCompute({
      preferLocalProvider: document.querySelector("#preferLocalProvider").checked,
      localRamGb: Number(document.querySelector("#localRamGb").value || 8),
      ollamaContextTokens: Number(document.querySelector("#ollamaContextTokens").value || 4096),
      ollamaGpuLayers: Number(document.querySelector("#ollamaGpuLayers").value ?? -1)
    });
    renderLocalComputeStatus(status);
    return status;
  }, false);
for (const button of document.querySelectorAll("[data-ram-preset]")) {
  button.onclick = () => {
    const ram = Number(button.dataset.ramPreset || 8);
    document.querySelector("#localRamGb").value = String(ram);
    const context = ram >= 64 ? 32768 : ram >= 32 ? 16384 : ram >= 16 ? 8192 : 4096;
    document.querySelector("#ollamaContextTokens").value = String(context);
    append("blue", `Local thinking budget set to ${ram} GB with ${context} context tokens. Click Save Local Compute Settings to apply it.`);
  };
}
document.querySelector("#loadHistory").onclick = () =>
  perform(window.bluePet.conversationHistory, false);
document.querySelector("#capabilities").onclick = () =>
  perform(window.bluePet.capabilities, false);
document.querySelector("#researchCatalog").onclick = () =>
  perform(window.bluePet.researchCatalog, false);
document.querySelector("#learningList").onclick = async () => {
  try {
    document.querySelector("#learningDetails").textContent = await window.bluePet.learningRecords();
  } catch (error) {
    document.querySelector("#learningDetails").textContent = error.message;
  }
};
document.querySelector("#learningSave").onclick = async () => {
  const topic = document.querySelector("#learningTopic");
  const notes = document.querySelector("#learningNotes");
  try {
    document.querySelector("#learningDetails").textContent = await window.bluePet.learningCapture({
      topic: topic.value,
      notes: notes.value
    });
    topic.value = "";
    notes.value = "";
  } catch (error) {
    document.querySelector("#learningDetails").textContent = `Learning request not saved: ${error.message}`;
  }
};
document.querySelector("#learningResearch").onclick = async () => {
  const topic = document.querySelector("#learningTopic");
  try {
    document.querySelector("#learningDetails").textContent = "Researching online...";
    document.querySelector("#learningDetails").textContent = await window.bluePet.learningResearch({
      topic: topic.value
    });
  } catch (error) {
    document.querySelector("#learningDetails").textContent = `Online research failed: ${error.message}`;
  }
};
document.querySelector("#agentStatus").onclick = async () => {
  try {
    document.querySelector("#agentDetails").textContent = await window.bluePet.agentStatus();
  } catch (error) {
    document.querySelector("#agentDetails").textContent = `Agent status unavailable: ${error.message}`;
  }
};
document.querySelector("#agentStart").onclick = async () => {
  const goal = document.querySelector("#agentGoal");
  try {
    document.querySelector("#agentDetails").textContent = "Creating agent plan...";
    document.querySelector("#agentDetails").textContent = await window.bluePet.agentStart({
      goal: goal.value
    });
    goal.value = "";
  } catch (error) {
    document.querySelector("#agentDetails").textContent = `Agent plan not created: ${error.message}`;
  }
};
document.querySelector("#agentMiniMax").onclick = async () => {
  try {
    document.querySelector("#agentDetails").textContent = "Choosing next MiniMax step...";
    document.querySelector("#agentDetails").textContent = await window.bluePet.agentMiniMax();
  } catch (error) {
    document.querySelector("#agentDetails").textContent = `MiniMax step failed: ${error.message}`;
  }
};
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
window.bluePet.onModelChanged(() => loadVtuberModels(false));

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
const chatVoiceToggle = document.querySelector("#chatVoiceToggle");
function refreshVoiceButton() {
  const label = `Voice: ${voiceEnabled ? "On" : "Off"}`;
  voiceToggle.textContent = label;
  chatVoiceToggle.textContent = label;
}
function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem("blueVoiceEnabled", String(voiceEnabled));
  if (!voiceEnabled) skipVoice();
  refreshVoiceButton();
}
voiceToggle.onclick = toggleVoice;
chatVoiceToggle.onclick = toggleVoice;
document.querySelector("#voiceSkip").onclick = skipVoice;
document.querySelector("#voiceTest").onclick = () =>
  speak("Hello. I am Blue. My cleaner voice is active. **Markdown** and file paths like C:\\test\\file.txt are skipped when I speak.");
voiceSelect.onchange = () => localStorage.setItem("blueVoiceName", voiceSelect.value);
for (const control of [voiceRate, voicePitch, voiceVolume]) {
  control.oninput = saveVoiceTuning;
}
document.querySelector("#saveVoiceSettings").onclick = async () => {
  try {
    saveVoiceTuning();
    const saved = await window.bluePet.saveVoiceSettings(readVoiceSettingsForm());
    renderVoiceSettings(saved);
    localStorage.setItem("blueVoiceName", voiceSelect.value);
    append("blue", "Voice activation and voice tuning settings saved.");
  } catch (error) {
    append("blue", `Could not save voice settings: ${error.message}`);
  }
};
speechSynthesis.onvoiceschanged = loadVoices;
loadVoiceTuning();
loadVoices();
loadMicrophones().then(() => window.bluePet.voiceSettings().then(renderVoiceSettings).catch(() => {}));
refreshVoiceButton();
window.bluePet.presenceStatus().then(renderPresence)
  .catch(error => { presenceDetails.textContent = error.message; });
window.bluePet.providerStatus().then(renderLocalComputeStatus).catch(() => {});
window.bluePet.autonomyStatus().then(renderAutonomyStatus).catch(error => {
  autonomyDetails.textContent = `Away rules unavailable: ${error.message}`;
});
window.bluePet.phoneBridgeStatus().then(renderPhoneBridgeStatus).catch(() => {});
window.bluePet.onDeepResearchPrompt(showDeepResearchPrompt);
loadCurrentArtifact();
loadOutfitReference();
window.bluePet.ensureSession()
  .then(refreshConversations)
  .catch(error => append("blue", error.message));
window.bluePet.discordConfig().then(fillDiscordConfig)
  .catch(error => { discordStatus.textContent = error.message; });
window.bluePet.discordStatus().then(showDiscordStatus)
  .catch(error => { discordStatus.textContent = error.message; });
loadVtuberModels(true);
showOllamaSetupIfNeeded();
refreshExpansion();


function setWorkbenchOutput(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const status = document.querySelector("#status");
  const bottom = document.querySelector("#bottomPanelOutput");
  if (status) status.textContent = text;
  if (bottom) bottom.textContent = text;
  return text;
}

const rebuiltButtonElements = {
  chatRunAudit: document.querySelector("#chatRunAudit"),
  chatToolPaste: document.querySelector("#chatToolPaste"),
  chatToolOcr: document.querySelector("#chatToolOcr"),
  chatAttachFiles: document.querySelector("#chatAttachFiles"),
  chatAttachImages: document.querySelector("#chatAttachImages"),
  chatAttachFolder: document.querySelector("#chatAttachFolder"),
  chatPasteClipboard: document.querySelector("#chatPasteClipboard"),
  chatScanImage: document.querySelector("#chatScanImage"),
  chatToolIdea: document.querySelector("#chatToolIdea"),
  chatToolLearn: document.querySelector("#chatToolLearn"),
  chatToolResearch: document.querySelector("#chatToolResearch"),
  chatToolAgent: document.querySelector("#chatToolAgent"),
  devRunAudit: document.querySelector("#devRunAudit"),
  devRunDoctor: document.querySelector("#devRunDoctor"),
  devSystemInfo: document.querySelector("#devSystemInfo"),
  devOpenProject: document.querySelector("#devOpenProject"),
  devFocusDiagnostics: document.querySelector("#devFocusDiagnostics"),
  devSecurityScan: document.querySelector("#devSecurityScan"),
  devBlueMeshCheck: document.querySelector("#devBlueMeshCheck"),
  streamingStatusRefresh: document.querySelector("#streamingStatusRefresh"),
  streamingObsSave: document.querySelector("#streamingObsSave"),
  streamingObsCheck: document.querySelector("#streamingObsCheck"),
  streamingObsSceneRefresh: document.querySelector("#streamingObsSceneRefresh"),
  streamingObsCaptureGuide: document.querySelector("#streamingObsCaptureGuide"),
  streamingObsSceneSwitch: document.querySelector("#streamingObsSceneSwitch"),
  streamingSavePlatform: document.querySelector("#streamingSavePlatform"),
  streamingChatReadiness: document.querySelector("#streamingChatReadiness"),
  streamingRulesCheck: document.querySelector("#streamingRulesCheck"),
  streamingModerationPlan: document.querySelector("#streamingModerationPlan"),
  streamingToggleVrm: document.querySelector("#streamingToggleVrm"),
  streamingToggleLive2d: document.querySelector("#streamingToggleLive2d"),
  streamingToggleWarudo: document.querySelector("#streamingToggleWarudo"),
  streamingVoiceSafety: document.querySelector("#streamingVoiceSafety"),
  streamingVoiceTest: document.querySelector("#streamingVoiceTest"),
  streamingIndependencePlan: document.querySelector("#streamingIndependencePlan"),
  streamingGoLiveChecklist: document.querySelector("#streamingGoLiveChecklist"),
  blueMeshCheck: document.querySelector("#blueMeshCheck"),
  blueMeshToken: document.querySelector("#blueMeshToken"),
  blueMeshSmoke: document.querySelector("#blueMeshSmoke"),
  blueMeshOpenDocs: document.querySelector("#blueMeshOpenDocs"),
  blueMeshCopyServer: document.querySelector("#blueMeshCopyServer"),
  blueMeshCopyPush: document.querySelector("#blueMeshCopyPush"),
  settingsOpenProject: document.querySelector("#settingsOpenProject"),
  settingsRunAudit: document.querySelector("#settingsRunAudit")
};

function wireRebuiltShellButtons() {
  const wire = (id, handler) => {
    const button = rebuiltButtonElements[id] || document.querySelector(`#${id}`);
    if (!button) return;
    button.onclick = async () => {
      try {
        const result = await handler();
        if (result !== undefined) setWorkbenchOutput(result);
      } catch (error) {
        setWorkbenchOutput(error.message || String(error));
      }
    };
  };
  const click = id => document.querySelector(`#${id}`)?.click();

  wire("chatRunAudit", async () => { selectTab("tools", "diagnostics"); showBottomPanel("output"); return window.bluePet.controlAudit(); });
  wire("chatToolPaste", async () => click("pasteSend"));
  wire("chatToolOcr", async () => click("useOcr"));
  wire("chatAttachFiles", async () => click("files"));
  wire("chatAttachImages", async () => click("images"));
  wire("chatAttachFolder", async () => click("folder"));
  wire("chatPasteClipboard", async () => click("clipboard"));
  wire("chatScanImage", async () => click("scanImage"));
  wire("chatToolIdea", async () => { selectTab("workspace", "idea-lab"); document.querySelector("#labTitle")?.focus(); });
  wire("chatToolLearn", async () => { selectTab("workspace", "research-lab"); document.querySelector("#learningTopic")?.focus(); });
  wire("chatToolResearch", async () => { selectTab("workspace", "research-lab"); document.querySelector("#learningTopic")?.focus(); });
  wire("chatToolAgent", async () => { selectTab("workspace", "research-lab"); document.querySelector("#agentGoal")?.focus(); });

  wire("devRunAudit", async () => window.bluePet.controlAudit());
  wire("devRunDoctor", async () => window.bluePet.doctor());
  wire("devSystemInfo", async () => window.bluePet.systemInfo());
  wire("devOpenProject", async () => window.bluePet.openProject());
  wire("devFocusDiagnostics", async () => { selectTab("tools", "diagnostics"); showBottomPanel("output"); return "Diagnostics focused."; });
  wire("devSecurityScan", async () => { selectTab("systems", "security"); click("securityScan"); });
  wire("devBlueMeshCheck", async () => window.bluePet.blueMeshStatus());

  wire("streamingStatusRefresh", async () => window.bluePet.streamingStatus());
  wire("streamingObsSave", async () => window.bluePet.saveStreamingConfig({ obs: {}, updatedFrom: "control-center" }));
  wire("streamingObsCheck", async () => window.bluePet.checkObs({}));
  wire("streamingObsSceneRefresh", async () => window.bluePet.listObsScenes({}));
  wire("streamingObsCaptureGuide", async () => window.bluePet.streamingPlan({ kind: "obs_capture_guide" }));
  wire("streamingObsSceneSwitch", async () => window.bluePet.switchObsScene({ sceneName: "" }));
  wire("streamingSavePlatform", async () => window.bluePet.saveStreamingConfig({ platforms: [], updatedFrom: "control-center" }));
  wire("streamingChatReadiness", async () => window.bluePet.streamingPlan({ kind: "chat_readiness" }));
  wire("streamingRulesCheck", async () => window.bluePet.streamingPlan({ kind: "rules_check" }));
  wire("streamingModerationPlan", async () => window.bluePet.streamingPlan({ kind: "moderation" }));
  wire("streamingToggleVrm", async () => window.bluePet.streamingPlan({ kind: "toggle_vrm" }));
  wire("streamingToggleLive2d", async () => window.bluePet.streamingPlan({ kind: "toggle_live2d" }));
  wire("streamingToggleWarudo", async () => window.bluePet.streamingPlan({ kind: "toggle_warudo" }));
  wire("streamingVoiceSafety", async () => window.bluePet.streamingPlan({ kind: "voice_safety" }));
  wire("streamingVoiceTest", async () => { click("voiceTest"); return "Streaming voice test started through Blue voice controls."; });
  wire("streamingIndependencePlan", async () => window.bluePet.streamingPlan({ kind: "independent_stream" }));
  wire("streamingGoLiveChecklist", async () => window.bluePet.streamingPlan({ kind: "go_live_checklist" }));

  wire("blueMeshCheck", async () => window.bluePet.blueMeshStatus());
  wire("blueMeshToken", async () => window.bluePet.blueMeshToken());
  wire("blueMeshSmoke", async () => window.bluePet.blueMeshSmoke());
  wire("blueMeshOpenDocs", async () => window.bluePet.blueMeshOpenDocs());
  wire("blueMeshCopyServer", async () => "Start the BlueMesh receiver from the tools/bluemesh scripts, then paste the session token on the other trusted PC.");
  wire("blueMeshCopyPush", async () => "Use the BlueMesh push command with the trusted peer URL and session-only token. Tokens are never committed.");

  wire("settingsOpenProject", async () => window.bluePet.openProject());
  wire("settingsRunAudit", async () => window.bluePet.controlAudit());
}

wireRebuiltShellButtons();
