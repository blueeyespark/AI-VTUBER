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
let activeFileEditorSession = null;
const fileEditorSessions = new Map();
const fileEditorAlerts = new Map();
const pinnedFileEditors = new Set();
let previewFileEditorId = null;
let editorUpdateTimer = null;
let workspaceFileEntries = [];
let workspaceFilesLoading = false;
let recentWorkspaceFiles = [];
let workspaceSnapshot = {};
const shell = window.ProjectBlueShell;
const activityBar = document.querySelector("#activityBar");
const contextSidebar = document.querySelector("#contextSidebar");
const sidebarContent = contextSidebar?.querySelector(".sidebar-content");
const sidebarTitle = contextSidebar?.querySelector(".sidebar-title");
const editorTabs = document.querySelector("#editorTabs");
const bottomPanel = document.querySelector("#bottomPanel");
const bottomPanelOutput = document.querySelector("#bottomPanelOutput");
const bottomPanelViews = new Map(
  [...document.querySelectorAll("[data-bottom-view]")].map(view => [view.dataset.bottomView, view])
);
const blueContextPanel = document.querySelector("#blueContextPanel");
const blueContextCollapse = document.querySelector("#blueContextCollapse");
const chatMoreActions = document.querySelector("#chatMoreActions");
const chatMoreMenu = document.querySelector("#chatMoreMenu");
const attachmentChips = document.querySelector("#attachmentChips");
const auxiliaryBar = document.querySelector("#auxiliaryBar");
const auxChatMount = document.querySelector("#auxChatMount");
const auxClose = document.querySelector("#auxClose");
const blueChatSection = document.querySelector("[data-panel='workspace'][data-editor='blue-chat']");
const AUX_COMPACT_BREAKPOINT = 1400;
if (auxChatMount && blueChatSection) {
  blueChatSection.removeAttribute("data-panel");
  blueChatSection.removeAttribute("data-editor");
  blueChatSection.classList.add("auxiliary-chat-editor", "active-editor");
  auxChatMount.append(blueChatSection);
}
function isCompactWorkbench() {
  return window.innerWidth <= AUX_COMPACT_BREAKPOINT;
}
function openAuxiliaryChat() {
  document.body.classList.remove("aux-collapsed");
  document.body.classList.toggle("aux-overlay-open", isCompactWorkbench());
  localStorage.setItem("blueAuxiliaryCollapsed", "false");
  applyLayoutPrefs();
  prompt?.focus();
}
function closeAuxiliaryChat() {
  document.body.classList.add("aux-collapsed");
  document.body.classList.remove("aux-overlay-open");
  localStorage.setItem("blueAuxiliaryCollapsed", "true");
  applyLayoutPrefs();
}
if (localStorage.getItem("blueAuxiliaryCollapsed") === "true") document.body.classList.add("aux-collapsed");
auxClose?.addEventListener("click", closeAuxiliaryChat);

function clampLayout(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function applyLayoutPrefs() {
  layoutState.sidebarWidth = clampLayout(layoutState.sidebarWidth, 180, 360);
  layoutState.auxWidth = clampLayout(layoutState.auxWidth, 300, 600);
  layoutState.bottomHeight = clampLayout(layoutState.bottomHeight, 120, Math.floor(window.innerHeight * 0.55));
  const compact = isCompactWorkbench();
  document.body.classList.toggle("aux-compact", compact);
  document.documentElement.style.setProperty("--sidebar-width", `${layoutState.sidebarWidth}px`);
  document.documentElement.style.setProperty("--aux-width", compact ? "0px" : `${layoutState.auxWidth}px`);
  document.documentElement.style.setProperty("--bottom-height", layoutState.bottomOpen ? `${layoutState.bottomHeight}px` : "0px");
}

function syncResponsiveWorkbench() {
  const wasCompact = document.body.classList.contains("aux-compact");
  const compact = isCompactWorkbench();
  if (compact && !wasCompact) document.body.classList.remove("aux-overlay-open");
  if (!compact) document.body.classList.remove("aux-overlay-open");
  applyLayoutPrefs();
}

function persistLayoutPrefs() {
  localStorage.setItem("blueSidebarWidth", String(layoutState.sidebarWidth));
  localStorage.setItem("blueAuxiliaryWidth", String(layoutState.auxWidth));
  localStorage.setItem("blueBottomPanelHeight", String(layoutState.bottomHeight));
}

function installResizeHandles() {
  const make = (className, title) => {
    let handle = document.querySelector(`.${className}`);
    if (!handle) {
      handle = document.createElement("div");
      handle.className = `resize-handle ${className}`;
      handle.title = title;
      handle.setAttribute("role", "separator");
      document.body.append(handle);
    }
    return handle;
  };
  const sidebarHandle = make("sidebar-resize", "Resize sidebar");
  const auxHandle = make("aux-resize", "Resize Blue Chat");
  const bottomHandle = make("bottom-resize", "Resize bottom panel");

  const drag = (event, onMove) => {
    event.preventDefault();
    const move = moveEvent => { onMove(moveEvent); applyLayoutPrefs(); persistLayoutPrefs(); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  sidebarHandle.onpointerdown = event => drag(event, moveEvent => { layoutState.sidebarWidth = clampLayout(moveEvent.clientX - 48, 180, 360); });
  auxHandle.onpointerdown = event => drag(event, moveEvent => { layoutState.auxWidth = clampLayout(window.innerWidth - moveEvent.clientX, 300, 600); document.body.classList.remove("aux-collapsed"); localStorage.setItem("blueAuxiliaryCollapsed", "false"); });
  bottomHandle.onpointerdown = event => drag(event, moveEvent => { layoutState.bottomOpen = true; layoutState.bottomHeight = clampLayout(window.innerHeight - moveEvent.clientY - 24, 120, Math.floor(window.innerHeight * 0.55)); localStorage.setItem("blueBottomPanelOpen", "true"); document.body.classList.add("bottom-open"); if (bottomPanel) bottomPanel.hidden = false; });
}

function resetWorkbenchLayout() {
  layoutState.sidebarWidth = 260;
  layoutState.auxWidth = 400;
  layoutState.bottomHeight = 220;
  layoutState.bottomOpen = false;
  localStorage.setItem("blueBottomPanelOpen", "false");
  localStorage.setItem("blueAuxiliaryCollapsed", "false");
  document.body.classList.remove("bottom-open", "aux-collapsed");
  persistLayoutPrefs();
  applyLayoutPrefs();
  renderShell();
}
if (localStorage.getItem("blueWorkbenchBehaviorV1") !== "true") { localStorage.setItem("blueOpenEditors:workspace", "workspace-home"); localStorage.setItem("blueEditor:workspace", "workspace-home"); localStorage.setItem("blueBottomPanelOpen", "false"); localStorage.setItem("blueWorkbenchBehaviorV1", "true"); }
const layoutState = {
  activeActivity: shell?.normalizeActivity(localStorage.getItem("blueControlActivity") || localStorage.getItem("blueControlTab") || "workspace") || "workspace",
  activeEditors: {},
  openEditors: {},
  bottomOpen: localStorage.getItem("blueBottomPanelOpen") === "true",
  bottomTab: localStorage.getItem("blueBottomPanelTab") || "output",
  contextCollapsed: localStorage.getItem("blueContextCollapsed") === "true",
  sidebarWidth: Number(localStorage.getItem("blueSidebarWidth") || 260),
  auxWidth: Number(localStorage.getItem("blueAuxiliaryWidth") || 400),
  bottomHeight: Number(localStorage.getItem("blueBottomPanelHeight") || 220)
};

function allActivityEditors(activityId) {
  const editors = [...(shell?.editors?.[activityId] || [])];
  if (activityId === "workspace") {
    for (const [id, session] of fileEditorSessions) {
      editors.push({ id, title: session.path.split("/").at(-1), closable: true, fileSession: true });
    }
  }
  return editors;
}

function fileEditorId(session) { return `file:${session.id}`; }
function isFileEditor(editorId) { return fileEditorSessions.has(editorId); }
function rememberFileSession(session) {
  const id = fileEditorId(session);
  fileEditorSessions.set(id, session);
  return id;
}

function pinFileEditor(editorId) {
  if (!isFileEditor(editorId)) return;
  pinnedFileEditors.add(editorId);
  if (previewFileEditorId === editorId) previewFileEditorId = null;
  renderEditorTabs();
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
    const label = activity.label || activity.id || "Project Blue";
    const icon = activity.svgIcon || activity.icon || shell.activities[0]?.svgIcon || "";
    button.title = activity.tooltip || label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(activity.id === layoutState.activeActivity));
    button.tabIndex = activity.id === layoutState.activeActivity ? 0 : -1;
    button.innerHTML = String(icon).includes("undefined") ? (shell.activities[0]?.svgIcon || "") : icon;
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
  const groups = shell.sidebarGroups?.[layoutState.activeActivity]
    || [{ title: activity?.label || "Tools", items: shell.sidebarItems?.[layoutState.activeActivity] || [] }];
  for (const group of groups) {
    const items = group.items.filter(item => {
      const normalized = item.toLowerCase();
      if (normalized === "open editors") return false;
      if ((layoutState.activeActivity === "workspace" || layoutState.activeActivity === "explorer") && normalized === "project files") return false;
      if (layoutState.activeActivity === "workspace" && normalized === "recent") return false;
      return true;
    });
    if (!items.length) continue;
    const section = document.createElement("div");
    section.className = "tree-section";
    section.innerHTML = `<div class="tree-heading">${group.title}</div>`;
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
  if (layoutState.activeActivity === "workspace" || layoutState.activeActivity === "explorer") {
    sidebarContent.append(renderWorkspaceFileTree());
    if (layoutState.activeActivity === "workspace") sidebarContent.append(renderRecentWorkspaceFiles());
    if (!workspaceFileEntries.length && !workspaceFilesLoading) queueMicrotask(refreshWorkspaceFileTree);
    if (!recentWorkspaceFiles.length) queueMicrotask(refreshRecentWorkspaceFiles);
  }
}

function renderRecentWorkspaceFiles() {
  const section = document.createElement("div");
  section.className = "tree-section recent-file-tree";
  const heading = document.createElement("div");
  heading.className = "tree-heading";
  heading.textContent = "Recent Files";
  section.append(heading);
  for (const item of recentWorkspaceFiles.slice(0, 12)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row project-file-row file";
    row.title = item.path;
    row.textContent = item.path.split("/").at(-1);
    row.onclick = () => openWorkspaceFile(item.path);
    row.ondblclick = event => { event.preventDefault(); openWorkspaceFile(item.path, { pinned: true }); };
    section.append(row);
  }
  if (!recentWorkspaceFiles.length) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.textContent = "No recent files yet.";
    section.append(empty);
  }
  return section;
}

async function refreshRecentWorkspaceFiles() {
  try { recentWorkspaceFiles = await window.bluePet.editorRecent(); }
  catch { recentWorkspaceFiles = []; }
  if (layoutState.activeActivity === "workspace") renderSidebar();
}

async function loadWorkspaceSettings() {
  const ignored = document.querySelector("#workspaceIgnoredPaths");
  const recentLimit = document.querySelector("#workspaceRecentLimit");
  const status = document.querySelector("#workspaceSettingsStatus");
  if (!ignored || !recentLimit || !status) return;
  try {
    const settings = await window.bluePet.editorSettings();
    ignored.value = (settings.ignoredPaths || []).join("\n");
    recentLimit.value = settings.maxRecentFiles || 24;
    status.textContent = `Loaded ${settings.ignoredPaths?.length || 0} ignored paths. Recent-file limit: ${settings.maxRecentFiles || 24}.`;
    await renderWorkspaceRoots();
  } catch (error) {
    status.textContent = `Could not load workspace settings: ${error.message}`;
  }
}

async function renderWorkspaceRoots() {
  const list = document.querySelector("#workspaceRootsList");
  if (!list) return;
  const roots = await window.bluePet.editorRoots();
  list.replaceChildren();
  for (const root of roots) {
    const row = document.createElement("div");
    row.className = "settings-list-row";
    const label = document.createElement("span");
    label.textContent = `${root.name}${root.primary ? " (primary)" : ""}`;
    row.append(label);
    if (!root.primary) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Remove";
      remove.onclick = async () => { await window.bluePet.editorRootRemove(root.id); await renderWorkspaceRoots(); await refreshWorkspaceFileTree(); };
      row.append(remove);
    }
    list.append(row);
  }
}

async function addWorkspaceRoot() {
  const result = await window.bluePet.editorRootAdd();
  if (result?.canceled) return;
  workspaceSnapshot = {};
  await Promise.all([renderWorkspaceRoots(), refreshWorkspaceFileTree()]);
  document.querySelector("#workspaceSettingsStatus").textContent = `Workspace now has ${result.roots.length} trusted roots.`;
}

async function rebuildSymbolIndex() {
  const result = await window.bluePet.editorSymbols({ limit: 5000 });
  const status = document.querySelector("#workspaceSettingsStatus");
  if (status) status.textContent = `Indexed ${result.symbols.length} JavaScript, TypeScript, and Python symbols${result.truncated ? " (limit reached)" : ""}.`;
  showBottomPanel("output");
  if (bottomPanelOutput) bottomPanelOutput.textContent = result.symbols.slice(0, 500).map(item => `${item.name}  ${item.path}:${item.line}:${item.column}`).join("\n") || "No supported symbols found.";
}

async function pollWorkspaceChanges() {
  try {
    const result = await window.bluePet.editorWorkspaceChanges(workspaceSnapshot);
    workspaceSnapshot = result.snapshot || {};
    if (!result.changes?.length) return;
    await refreshWorkspaceFileTree();
    const message = result.changes.slice(0, 20).map(item => `${item.type}: ${item.path}`).join("\n");
    writeBottomPanel("activity", `Workspace changes detected:\n${message}`, { append: true, open: false });
  } catch { /* bounded watcher retries on the next interval */ }
}

async function saveWorkspaceSettings() {
  const ignored = document.querySelector("#workspaceIgnoredPaths");
  const recentLimit = document.querySelector("#workspaceRecentLimit");
  const status = document.querySelector("#workspaceSettingsStatus");
  if (!ignored || !recentLimit || !status) return;
  const ignoredPaths = ignored.value.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean);
  const maxRecentFiles = Math.max(1, Math.min(100, Number(recentLimit.value) || 24));
  try {
    const settings = await window.bluePet.editorSettingsUpdate({ ignoredPaths, maxRecentFiles });
    workspaceFileEntries = [];
    recentWorkspaceFiles = [];
    await Promise.all([refreshWorkspaceFileTree(), refreshRecentWorkspaceFiles()]);
    ignored.value = (settings.ignoredPaths || []).join("\n");
    recentLimit.value = settings.maxRecentFiles;
    status.textContent = `Saved. The Explorer now ignores ${settings.ignoredPaths.length} paths and keeps ${settings.maxRecentFiles} recent files.`;
  } catch (error) {
    status.textContent = `Settings were not saved: ${error.message}`;
  }
}

function renderWorkspaceFileTree() {
  const section = document.createElement("div");
  section.className = "tree-section project-file-tree";
  const heading = document.createElement("div");
  heading.className = "tree-heading tree-heading-action";
  heading.innerHTML = "<span>Project Files</span>";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "tree-refresh";
  refresh.title = "Refresh project files";
  refresh.setAttribute("aria-label", "Refresh project files");
  refresh.textContent = "↻";
  refresh.onclick = refreshWorkspaceFileTree;
  heading.append(refresh);
  section.append(heading);
  if (workspaceFilesLoading) {
    const loading = document.createElement("div");
    loading.className = "tree-empty";
    loading.textContent = "Indexing workspace…";
    section.append(loading);
    return section;
  }
  if (!workspaceFileEntries.length) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.textContent = "No files indexed yet.";
    section.append(empty);
    return section;
  }
  for (const item of workspaceFileEntries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `tree-row project-file-row ${item.type}`;
    row.style.setProperty("--tree-depth", String(Math.min(item.depth || 0, 8)));
    row.title = item.path;
    const glyph = document.createElement("span");
    glyph.className = "tree-glyph";
    glyph.textContent = item.type === "folder" || item.type === "root" ? "▸" : "";
    const name = document.createElement("span");
    name.textContent = item.name;
    row.append(glyph, name);
    if (item.type === "file") {
      row.onclick = () => openWorkspaceFile(item.path);
      row.ondblclick = event => {
        event.preventDefault();
        openWorkspaceFile(item.path, { pinned: true });
      };
    }
    else row.setAttribute("aria-disabled", "true");
    section.append(row);
  }
  return section;
}

async function refreshWorkspaceFileTree() {
  if (workspaceFilesLoading) return;
  workspaceFilesLoading = true;
  renderSidebar();
  try {
    const result = await window.bluePet.editorFiles({ limit: 600 });
    workspaceFileEntries = result?.entries || [];
  } catch (error) {
    workspaceFileEntries = [];
    writeBottomPanel("problems", `Workspace file index failed: ${error.message}`);
  } finally {
    workspaceFilesLoading = false;
    renderSidebar();
  }
}

function renderEditorTabs() {
  if (!editorTabs) return;
  editorTabs.replaceChildren();
  for (const editor of getActivityEditors(layoutState.activeActivity)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `editor-tab${editor.id === currentEditor() ? " active" : ""}${editor.id === previewFileEditorId ? " preview" : ""}`;
    button.dataset.editor = editor.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(editor.id === currentEditor()));
    button.tabIndex = editor.id === currentEditor() ? 0 : -1;
    const session = fileEditorSessions.get(editor.id);
    const title = document.createElement("span");
    title.textContent = session?.path.split("/").at(-1) || editor.title;
    button.append(title);
    if (session?.dirty) {
      const dirty = document.createElement("span");
      dirty.className = "dirty-dot";
      dirty.title = "Unsaved changes";
      dirty.textContent = "*";
      button.append(dirty);
    }
    if (editor.closable) {
      const close = document.createElement("span");
      close.className = "editor-close";
      close.setAttribute("aria-hidden", "true");
      close.textContent = "x";
      button.append(close);
    }
    button.onclick = event => {
      if (event.target.classList.contains("editor-close")) {
        closeEditor(editor.id);
      } else {
        selectTab(layoutState.activeActivity, editor.id);
      }
    };
    button.onauxclick = event => { if (event.button === 1) closeEditor(editor.id); };
    button.ondblclick = () => pinFileEditor(editor.id);
    button.oncontextmenu = event => {
      event.preventDefault();
      const action = window.prompt("Tab action: close, close others, close right, pin", "close");
      handleTabAction(editor.id, action);
    };
    editorTabs.append(button);
  }
}

async function closeEditor(editorId) {
  const activity = layoutState.activeActivity;
  const editor = allActivityEditors(activity).find(item => item.id === editorId);
  if (!editor?.closable) return;
  const fileSession = fileEditorSessions.get(editorId);
  if (fileSession) {
    let discard = false;
    if (fileSession.dirty) {
      discard = window.confirm(`Discard unsaved changes to ${fileSession.path}?`);
      if (!discard) return;
    }
    const closed = await window.bluePet.editorClose({ sessionId: fileSession.id, discard });
    if (!closed?.ok) return;
    fileEditorSessions.delete(editorId);
    pinnedFileEditors.delete(editorId);
    if (previewFileEditorId === editorId) previewFileEditorId = null;
    if (activeFileEditorSession?.id === fileSession.id) activeFileEditorSession = null;
  }
  const openIds = getOpenEditorIds(activity);
  const index = openIds.indexOf(editorId);
  if (index >= 0) openIds.splice(index, 1);
  if (!openIds.length) openIds.push(shell.defaultEditor(activity));
  if (currentEditor(activity) === editorId) layoutState.activeEditors[activity] = openIds[Math.max(0, index - 1)] || openIds[0];
  persistOpenEditors(activity);
  const nextEditor = layoutState.activeEditors[activity];
  if (!isFileEditor(nextEditor)) resetFileEditorUi();
  selectTab(activity, nextEditor);
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
    if (isFileEditor(editorId)) pinFileEditor(editorId);
    else {
      const editor = allActivityEditors(activity).find(item => item.id === editorId);
      if (editor) editor.closable = false;
    }
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
  applyLayoutPrefs();
  if (bottomPanel) bottomPanel.hidden = false;
  for (const button of document.querySelectorAll("[data-bottom-tab]")) {
    const active = button.dataset.bottomTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const [name, view] of bottomPanelViews) {
    const active = name === tab;
    view.hidden = !active;
    view.classList.toggle("active", active);
  }
}

function writeBottomPanel(tab, message, { append = false, open = true } = {}) {
  const view = bottomPanelViews.get(tab) || bottomPanelOutput;
  if (!view) return;
  const text = String(message ?? "");
  view.textContent = append && view.textContent ? `${view.textContent}\n${text}` : text;
  if (open) showBottomPanel(tab);
}

function hideBottomPanel() {
  layoutState.bottomOpen = false;
  localStorage.setItem("blueBottomPanelOpen", "false");
  document.body.classList.remove("bottom-open");
  applyLayoutPrefs();
  if (bottomPanel) bottomPanel.hidden = true;
}

function renderBottomPanel() {
  if (layoutState.bottomOpen) showBottomPanel(layoutState.bottomTab);
  else hideBottomPanel();
}

function selectTab(value, editorValue) {
  const activity = shell?.normalizeActivity(value) || "workspace";
  if (editorValue === "blue-chat" || value === "blue-chat" || value === "chat") {
    openAuxiliaryChat();
    editorValue = activity === "workspace" ? (localStorage.getItem("blueEditor:workspace") || "workspace-home") : editorValue;
  }
  const requestedEditor = editorValue || value;
  const normalizedEditor = activity === "workspace" && isFileEditor(requestedEditor)
    ? requestedEditor
    : shell?.normalizeEditor(activity, requestedEditor) || "workspace-home";
  const editor = ensureEditorOpen(activity, normalizedEditor);
  if (activeFileEditorSession && (!isFileEditor(editor) || fileEditorSessions.get(editor)?.id !== activeFileEditorSession.id)) {
    clearTimeout(editorUpdateTimer);
    pushEditorUpdate();
  }
  layoutState.activeActivity = activity;
  layoutState.activeEditors[activity] = editor;
  localStorage.setItem("blueControlActivity", activity);
  localStorage.setItem(`blueEditor:${activity}`, editor);
  const visibleEditor = isFileEditor(editor) ? "file-preview" : editor;
  for (const panel of document.querySelectorAll("[data-panel]")) {
    const matchesActivity = panel.dataset.panel === activity;
    const panelEditor = panel.dataset.editor || editor;
    const matchesEditor = panelEditor === visibleEditor;
    const active = matchesActivity && matchesEditor;
    panel.hidden = !active;
    panel.classList.toggle("active-editor", active);
  }
  if (isFileEditor(editor)) applyFileEditorSession(fileEditorSessions.get(editor));
  else activeFileEditorSession = null;
  if (activity === "workspace" && editor === "workspace-settings") loadWorkspaceSettings();
  renderShell();
  updateBlueContext();
  updateAliveDashboard?.();
  if (activity === "streaming") queueMicrotask(() => refreshStreamingWorkbench().catch(error => setWorkbenchOutput(error.message || String(error))));
  document.querySelector(".editor-surface")?.scrollTo({ top: 0, behavior: "auto" });
}

function setDashboardText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value || "Not available";
}

function collectWorkbenchAwareness() {
  const activeActivity = layoutState.activeActivity || "workspace";
  const editor = currentEditor?.() || "workspace-home";
  const conversation = conversationSelect?.selectedOptions?.[0]?.textContent || "Blue Desktop Pet";
  return {
    project: "Project Blue",
    activeActivity,
    editor,
    conversation,
    blueMesh: document.querySelector("#footerBlueMesh")?.textContent || "BlueMesh: installed",
    discord: footerDiscord?.textContent || "Discord: disconnected",
    obs: document.querySelector("#footerObs")?.textContent || "OBS: disconnected",
    security: document.querySelector("#footerSecurity")?.textContent || "Security: not scanned",
    model: document.querySelector("#footerModel")?.textContent || "Model: local/foundation"
  };
}

function updateAliveDashboard(extra = {}) {
  const awareness = { ...collectWorkbenchAwareness(), ...extra };
  setDashboardText("dashSession", awareness.conversation);
  setDashboardText("dashTasks", awareness.activeActivity === "run" ? "Task view is open" : "No task selected");
  setDashboardText("dashStreaming", awareness.obs.replace(/^OBS:\s*/i, "OBS "));
  setDashboardText("dashBlueMesh", awareness.blueMesh.replace(/^BlueMesh:\s*/i, ""));
  setDashboardText("dashHealth", awareness.security.replace(/^Security:\s*/i, ""));
  setDashboardText("dashResearch", awareness.activeActivity === "research" ? "Research lab active" : "Ready for questions");
  setDashboardText("dashBackground", document.body.classList.contains("bottom-open") ? "Bottom panel active" : "Idle");
  setDashboardText("dashPet", awareness.pet || "Present, calm idle");
  setDashboardText("dashFiles", awareness.editor === "file-preview" ? "File preview open" : "Open Explorer to inspect");
  setDashboardText("dashProgress", awareness.progress || "Workbench ready");
  const suggestion = awareness.suggestion || (awareness.activeActivity === "workspace"
    ? "I can inspect recent changes, scan files, or prepare streaming."
    : `I see ${awareness.activeActivity}. Want me to summarize this area?`);
  setDashboardText("dashSuggestions", suggestion);
  setDashboardText("aliveFocus", `${awareness.activeActivity} / ${awareness.editor}`);
  setDashboardText("aliveMood", awareness.activeActivity === "streaming" ? "Showtime" : awareness.activeActivity === "diagnostics" ? "Curious" : "Attentive");
  const notice = document.querySelector("#proactiveNotice");
  if (notice) notice.textContent = suggestion;
  setDashboardText("ctxSuggestions", suggestion);
}

async function refreshAliveGitSummary() {
  setDashboardText("dashGit", "Reading Git...");
  try {
    const result = await window.bluePet.workspaceGit();
    const files = result?.data?.files || [];
    const branch = result?.data?.branch || "current branch";
    const summary = files.length ? `${files.length} changed file(s) on ${branch}` : `No changed files on ${branch}`;
    setDashboardText("dashGit", summary);
    updateAliveDashboard({ suggestion: files.length ? `${files.length} files changed. Want a summary?` : "Git is clean. Good moment to keep building." });
    return result;
  } catch (error) {
    setDashboardText("dashGit", `Git unavailable: ${error.message}`);
    return null;
  }
}

document.querySelector("#dashGitRefresh")?.addEventListener("click", refreshAliveGitSummary);
document.querySelector("#dashFunctionCheck")?.addEventListener("click", async () => {
  setDashboardText("dashProgress", "Checking functions...");
  const result = await window.bluePet.controlAudit();
  setDashboardText("dashProgress", result?.ok ? "Function audit passed" : "Function audit needs attention");
  updateAliveDashboard({ suggestion: result?.ok ? "All controls are wired. We can keep building." : "I found UI wiring issues. Open Diagnostics?" });
  showBottomPanel("output");
});
updateAliveDashboard();

function renderShell() {
  renderActivityBar();
  renderSidebar();
  renderEditorTabs();
  renderBottomPanel();
}


function renderPreIntoEditor(editorId, text) {
  const panel = document.querySelector(`[data-editor="${editorId}"]`);
  const pre = panel?.querySelector("pre");
  if (pre) pre.textContent = text || "No data.";
}

const editorElements = {
  path: document.querySelector("#editorPath"), content: document.querySelector("#editorContent"),
  status: document.querySelector("#editorStatus"), breadcrumbs: document.querySelector("#editorBreadcrumbs"),
  save: document.querySelector("#editorSave"), undo: document.querySelector("#editorUndo"),
  redo: document.querySelector("#editorRedo"), compare: document.querySelector("#editorCompare"),
  find: document.querySelector("#editorFind"), replace: document.querySelector("#editorReplace")
};
let monacoEditor = null;
let monacoSplitEditor = null;
let monacoDiffEditor = null;
let monacoModel = null;
let monacoDiffModels = [];
let suppressMonacoChange = false;
const languageButtonIds = ["lspCompletion", "lspHover", "lspSignature", "lspDefinition", "lspReferences", "lspRename", "lspFormat", "lspCodeActions", "lspSymbols", "lspWorkspaceSymbols"];
let lspVersion = 1;

function editorValue() { return monacoEditor ? monacoEditor.getValue() : (editorElements.content?.value || ""); }
function setEditorValue(value, language = "plaintext") {
  const next = String(value ?? "");
  if (monacoEditor && window.monaco) {
    suppressMonacoChange = true;
    if (!monacoModel) {
      monacoModel = window.monaco.editor.createModel(next, language);
      monacoEditor.setModel(monacoModel);
      monacoSplitEditor?.setModel(monacoModel);
    } else {
      window.monaco.editor.setModelLanguage(monacoModel, language || "plaintext");
      if (monacoModel.getValue() !== next) monacoModel.setValue(next);
    }
    suppressMonacoChange = false;
  }
  if (editorElements.content) editorElements.content.value = next;
}
function focusEditorRange(index, length = 0) {
  if (monacoEditor && monacoModel) {
    const start = monacoModel.getPositionAt(index);
    const end = monacoModel.getPositionAt(index + length);
    monacoEditor.setSelection({ startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column });
    monacoEditor.revealPositionInCenter(start);
    monacoEditor.focus();
    return;
  }
  editorElements.content?.focus();
  editorElements.content?.setSelectionRange(index, index + length);
}
function scheduleEditorUpdate() {
  clearTimeout(editorUpdateTimer);
  editorUpdateTimer = setTimeout(pushEditorUpdate, 180);
}
function lspSupported(session = activeFileEditorSession) { return ["javascript", "javascriptreact", "typescript", "typescriptreact", "python"].includes(session?.language); }
function lspCursor() {
  const cursor = monacoEditor?.getPosition();
  if (cursor) return { line: cursor.lineNumber, character: cursor.column };
  const value = editorElements.content?.value || ""; const offset = editorElements.content?.selectionStart || 0; const before = value.slice(0, offset).split("\n"); return { line: before.length, character: before.at(-1).length + 1 };
}
function lspPayload(extra = {}) { const cursor = lspCursor(); return { path: activeFileEditorSession?.path, language: activeFileEditorSession?.language, text: editorValue(), version: ++lspVersion, ...cursor, ...extra }; }
function setLspState(text, ready = false) { const state = document.querySelector("#lspServerState"); if (state) { state.textContent = text; state.dataset.ready = String(ready); } }
function setLspResult(value, title = "Language result") { const result = document.querySelector("#lspResult"); if (!result) return; result.hidden = false; result.textContent = `${title}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`; }
function applyLocalTextEdits(edits = []) {
  if (!monacoModel || !window.monaco) return false;
  monacoEditor.executeEdits("project-blue-lsp", edits.map(edit => ({ range: new window.monaco.Range(edit.range.start.line + 1, edit.range.start.character + 1, edit.range.end.line + 1, edit.range.end.character + 1), text: edit.newText || "", forceMoveMarkers: true })));
  scheduleEditorUpdate(); return true;
}
async function ensureLanguageDocument() {
  if (!activeFileEditorSession || !lspSupported()) throw new Error("Open a Python, JavaScript, or TypeScript file first.");
  setLspState("Language server: starting..."); const opened = await window.bluePet.lspOpen(lspPayload()); setLspState(`Language server: ${opened.serverId} ready`, true); return opened;
}
function normalizeLspLocations(result) { const rows = Array.isArray(result) ? result : result ? [result] : []; return rows.map(item => ({ uri: item.uri || item.targetUri, range: item.range || item.targetSelectionRange || item.targetRange })).filter(item => item.uri && item.range); }
async function openLspLocation(result) {
  const locations = normalizeLspLocations(result); if (!locations.length) throw new Error("No source location was returned.");
  const first = locations[0]; const filePath = decodeURIComponent(new URL(first.uri).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1))).replace(/\//g, "\\");
  await openWorkspaceFile(filePath, { pinned: true }); const line = first.range.start.line + 1; const column = first.range.start.character + 1; if (monacoEditor) { monacoEditor.setPosition({ lineNumber: line, column }); monacoEditor.revealPositionInCenter({ lineNumber: line, column }); }
  if (locations.length > 1) setLspResult(locations, `${locations.length} locations`);
}
async function runLsp(method, title) { try { await ensureLanguageDocument(); const result = await window.bluePet[method](lspPayload()); setLspResult(result ?? "No result.", title); return result; } catch (error) { setLspResult(error.message, `${title} failed`); throw error; } }
function initializeMonacoEditor() {
  if (!window.require?.config) return;
  window.require.config({ paths: { vs: "node_modules/monaco-editor/min/vs" } });
  window.require(["vs/editor/editor.main"], () => {
    const primary = document.querySelector("#monacoEditorPrimary");
    const secondary = document.querySelector("#monacoEditorSecondary");
    if (!primary || !secondary) return;
    const options = { theme: "vs-dark", automaticLayout: true, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 13, minimap: { enabled: true }, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true };
    monacoEditor = window.monaco.editor.create(primary, { ...options, readOnly: true, value: "" });
    monacoSplitEditor = window.monaco.editor.create(secondary, { ...options, readOnly: true, value: "" });
    monacoEditor.onDidChangeModelContent(() => { if (!suppressMonacoChange) scheduleEditorUpdate(); });
    document.querySelector("#editorGroups")?.classList.add("monaco-ready");
    if (activeFileEditorSession) applyFileEditorSession(activeFileEditorSession);
  }, error => setEditorStatus(`Monaco failed to load; fallback editor remains available: ${error.message}`, "warning"));
}
initializeMonacoEditor();

function setEditorStatus(message, kind = "") {
  if (!editorElements.status) return;
  editorElements.status.textContent = message;
  editorElements.status.dataset.kind = kind;
}

function resetFileEditorUi() {
  if (editorElements.content) editorElements.content.disabled = true;
  setEditorValue("");
  monacoEditor?.updateOptions({ readOnly: true });
  monacoSplitEditor?.updateOptions({ readOnly: true });
  if (editorElements.breadcrumbs) editorElements.breadcrumbs.textContent = "Workspace / No file open";
  for (const id of ["editorSave", "editorUndo", "editorRedo", "editorCompare", "editorSplit", "editorFindRun", "editorReplaceOne", "editorReplaceAll"])
    if (document.querySelector(`#${id}`)) document.querySelector(`#${id}`).disabled = true;
  setEditorStatus("No file open. Paths are confined to the Project Blue workspace.");
  for (const id of languageButtonIds) document.querySelector(`#${id}`)?.setAttribute("disabled", "");
  setLspState("Language server: idle");
  renderEditorTabs();
}

function applyFileEditorSession(session, message) {
  rememberFileSession(session);
  activeFileEditorSession = session;
  setEditorValue(session.content ?? editorValue(), session.language);
  editorElements.content.disabled = false;
  monacoEditor?.updateOptions({ readOnly: false });
  monacoSplitEditor?.updateOptions({ readOnly: false });
  editorElements.path.value = session.path || editorElements.path.value;
  editorElements.breadcrumbs.textContent = `Workspace / ${session.path}`;
  editorElements.save.disabled = !session.dirty;
  editorElements.undo.disabled = !session.canUndo;
  editorElements.redo.disabled = !session.canRedo;
  editorElements.compare.disabled = false;
  document.querySelector("#editorSplit").disabled = false;
  for (const id of ["editorFindRun", "editorReplaceOne", "editorReplaceAll"])
    document.querySelector(`#${id}`).disabled = false;
  for (const id of languageButtonIds) document.querySelector(`#${id}`).disabled = !lspSupported(session);
  if (lspSupported(session)) ensureLanguageDocument().catch(error => setLspState(`Language server: ${error.message}`)); else setLspState("Language server: unsupported file type");
  setEditorStatus(message || `${session.language} · version ${session.version}${session.dirty ? " · modified" : " · saved"}`);
  renderEditorTabs();
}

async function openWorkspaceFile(filePath = editorElements.path?.value, options = {}) {
  const requested = String(filePath || "").trim();
  if (!requested) return setEditorStatus("Enter a workspace-relative file path.", "warning");
  try {
    const normalizedPath = requested.replace(/\\/g, "/").toLowerCase();
    const existing = [...fileEditorSessions.entries()].find(([, session]) => session.path.toLowerCase() === normalizedPath);
    if (existing) {
      if (options.pinned) pinFileEditor(existing[0]);
      selectTab("workspace", existing[0]);
      setEditorStatus(`Already open: ${existing[1].path}`);
      return existing[1];
    }
    if (previewFileEditorId && fileEditorSessions.has(previewFileEditorId)) {
      const previewSession = fileEditorSessions.get(previewFileEditorId);
      if (previewSession.dirty) pinFileEditor(previewFileEditorId);
      else {
        await window.bluePet.editorClose({ sessionId: previewSession.id, discard: true });
        fileEditorSessions.delete(previewFileEditorId);
        fileEditorAlerts.delete(previewFileEditorId);
        const openIds = getOpenEditorIds("workspace");
        const previewIndex = openIds.indexOf(previewFileEditorId);
        if (previewIndex >= 0) openIds.splice(previewIndex, 1);
        persistOpenEditors("workspace");
        previewFileEditorId = null;
      }
    }
    const session = await window.bluePet.editorOpen(requested);
    const editorId = rememberFileSession(session);
    if (options.pinned) pinnedFileEditors.add(editorId);
    else previewFileEditorId = editorId;
    ensureEditorOpen("workspace", editorId);
    selectTab("workspace", editorId);
    applyFileEditorSession(session, `Opened ${session.path}`);
    refreshRecentWorkspaceFiles();
    return session;
  } catch (error) {
    setEditorStatus(`Open failed: ${error.message}`, "error");
  }
}

async function pushEditorUpdate() {
  if (!activeFileEditorSession) return;
  const sessionId = activeFileEditorSession.id;
  const content = editorValue();
  try {
    const session = await window.bluePet.editorUpdate({ sessionId, content });
    rememberFileSession(session);
    if (session.dirty) pinFileEditor(fileEditorId(session));
    if (activeFileEditorSession?.id === sessionId) applyFileEditorSession(session);
    else renderEditorTabs();
  } catch (error) { setEditorStatus(`Edit failed: ${error.message}`, "error"); }
}

async function pollOpenFileChanges() {
  for (const [editorId, knownSession] of [...fileEditorSessions]) {
    try {
      const result = await window.bluePet.editorStatus({ sessionId: knownSession.id, reloadClean: true });
      if (result?.session) fileEditorSessions.set(editorId, result.session);
      if (result?.reloaded) {
        fileEditorAlerts.delete(editorId);
        if (activeFileEditorSession?.id === knownSession.id) {
          applyFileEditorSession(result.session, `Reloaded ${result.session.path} after an external change.`);
        } else renderEditorTabs();
        continue;
      }
      const alertKey = result?.deleted ? "deleted" : result?.conflict ? "conflict" : "";
      if (!alertKey) {
        fileEditorAlerts.delete(editorId);
        continue;
      }
      if (fileEditorAlerts.get(editorId) === alertKey) continue;
      fileEditorAlerts.set(editorId, alertKey);
      const message = result.deleted
        ? `${knownSession.path} was deleted outside Blue. Your open tab remains available for review.`
        : `${knownSession.path} changed outside Blue while this tab has unsaved edits. Compare before saving.`;
      writeBottomPanel("problems", message);
      if (activeFileEditorSession?.id === knownSession.id) setEditorStatus(message, "warning");
    } catch (error) {
      if (!/session not found/i.test(error.message)) setEditorStatus(`File monitoring failed: ${error.message}`, "error");
    }
  }
}

async function saveWorkspaceFile(overwriteExternal = false) {
  if (!activeFileEditorSession) return;
  await pushEditorUpdate();
  const result = await window.bluePet.editorSave({ sessionId: activeFileEditorSession.id, overwriteExternal });
  if (result?.conflict) {
    writeBottomPanel("problems", `Save conflict: ${activeFileEditorSession.path} changed outside Blue. Compare before overwriting.`);
    setEditorStatus("Save blocked: the file changed outside Blue.", "warning");
    if (window.confirm("The file changed outside Blue. Overwrite the external version with this editor content?")) return saveWorkspaceFile(true);
    return;
  }
  applyFileEditorSession(result.session, `Saved ${result.session.path}`);
}

async function editorHistory(action) {
  if (!activeFileEditorSession) return;
  const session = await window.bluePet[action](activeFileEditorSession.id);
  applyFileEditorSession(session);
}

function editorFindOptions(replaceAll = true) {
  return {
    matchCase: document.querySelector("#editorMatchCase")?.checked,
    wholeWord: document.querySelector("#editorWholeWord")?.checked,
    regex: document.querySelector("#editorRegex")?.checked,
    replaceAll
  };
}

async function findInEditor() {
  if (!activeFileEditorSession) return;
  try {
    const results = await window.bluePet.editorFind({ sessionId: activeFileEditorSession.id, query: editorElements.find.value, options: editorFindOptions() });
    setEditorStatus(`${results.length} match${results.length === 1 ? "" : "es"} found.`);
    if (results[0]) focusEditorRange(results[0].index, results[0].length);
  } catch (error) { setEditorStatus(`Find failed: ${error.message}`, "error"); }
}

async function replaceInEditor(replaceAll) {
  if (!activeFileEditorSession) return;
  try {
    const result = await window.bluePet.editorReplace({
      sessionId: activeFileEditorSession.id, query: editorElements.find.value,
      replacement: editorElements.replace.value, options: editorFindOptions(replaceAll)
    });
    applyFileEditorSession(result.session, `${result.replacements} replacement${result.replacements === 1 ? "" : "s"}.`);
  } catch (error) { setEditorStatus(`Replace failed: ${error.message}`, "error"); }
}

document.querySelector("#editorOpen")?.addEventListener("click", () => openWorkspaceFile());
editorElements.path?.addEventListener("keydown", event => { if (event.key === "Enter") openWorkspaceFile(); });
editorElements.content?.addEventListener("input", scheduleEditorUpdate);
document.querySelector("#editorSave")?.addEventListener("click", () => saveWorkspaceFile());
document.querySelector("#editorUndo")?.addEventListener("click", () => editorHistory("editorUndo"));
document.querySelector("#editorRedo")?.addEventListener("click", () => editorHistory("editorRedo"));
document.querySelector("#editorFindRun")?.addEventListener("click", findInEditor);
document.querySelector("#editorReplaceOne")?.addEventListener("click", () => replaceInEditor(false));
document.querySelector("#editorReplaceAll")?.addEventListener("click", () => replaceInEditor(true));
document.querySelector("#lspCompletion")?.addEventListener("click", async () => { const result = await runLsp("lspCompletion", "Completions").catch(() => null); if (monacoEditor && result) monacoEditor.trigger("project-blue", "editor.action.triggerSuggest", {}); });
document.querySelector("#lspHover")?.addEventListener("click", () => runLsp("lspHover", "Hover").catch(() => {}));
document.querySelector("#lspSignature")?.addEventListener("click", async () => { await runLsp("lspSignature", "Signature help").catch(() => {}); monacoEditor?.trigger("project-blue", "editor.action.triggerParameterHints", {}); });
document.querySelector("#lspDefinition")?.addEventListener("click", async () => { const result = await runLsp("lspDefinition", "Definition").catch(() => null); if (result) openLspLocation(result).catch(error => setLspResult(error.message, "Definition failed")); });
document.querySelector("#lspReferences")?.addEventListener("click", () => runLsp("lspReferences", "References").catch(() => {}));
document.querySelector("#lspSymbols")?.addEventListener("click", () => runLsp("lspDocumentSymbols", "Document symbols").catch(() => {}));
document.querySelector("#lspWorkspaceSymbols")?.addEventListener("click", async () => { const query = window.prompt("Find a workspace symbol", "") ?? ""; try { setLspResult(await window.bluePet.lspWorkspaceSymbols(query), "Workspace symbols"); } catch (error) { setLspResult(error.message, "Workspace symbols failed"); } });
document.querySelector("#lspFormat")?.addEventListener("click", async () => { const edits = await runLsp("lspFormatting", "Formatting edits").catch(() => null); if (edits && applyLocalTextEdits(edits)) setEditorStatus("Language-server formatting applied locally. Save to write it to disk."); });
document.querySelector("#lspCodeActions")?.addEventListener("click", () => runLsp("lspCodeActions", "Code actions").catch(() => {}));
document.querySelector("#lspRename")?.addEventListener("click", async () => {
  const newName = window.prompt("Rename symbol to:", ""); if (!newName) return;
  try { await ensureLanguageDocument(); const edit = await window.bluePet.lspRename(lspPayload({ newName })); setLspResult(edit, "Rename preview"); if (!edit || !window.confirm("Apply this language-server rename? Project Blue will create local backups first.")) return; const applied = await window.bluePet.lspApplyEdit({ edit, approved: true }); setLspResult(applied, "Rename applied"); if (activeFileEditorSession) { await window.bluePet.editorClose({ sessionId: activeFileEditorSession.id, discard: true }); const path = activeFileEditorSession.path; activeFileEditorSession = null; await openWorkspaceFile(path, { pinned: true }); } } catch (error) { setLspResult(error.message, "Rename failed"); }
});
document.querySelector("#editorCompare")?.addEventListener("click", async () => {
  if (!activeFileEditorSession) return;
  const language = activeFileEditorSession.language;
  const diff = await window.bluePet.editorDiff(activeFileEditorSession.id);
  selectTab("git", "diff-review");
  const host = document.querySelector("#monacoDiffEditor");
  if (window.monaco && host) {
    monacoDiffEditor ||= window.monaco.editor.createDiffEditor(host, { theme: "vs-dark", automaticLayout: true, readOnly: true, renderSideBySide: true });
    monacoDiffModels.forEach(model => model.dispose());
    monacoDiffModels = [window.monaco.editor.createModel(diff.before, language), window.monaco.editor.createModel(diff.after, language)];
    monacoDiffEditor.setModel({ original: monacoDiffModels[0], modified: monacoDiffModels[1] });
    host.classList.add("monaco-ready");
  } else {
    document.querySelector("#diffEditorFallback").textContent = diff.changes.map(change => `${change.kind === "add" ? "+" : change.kind === "remove" ? "-" : " "} ${change.line}: ${change.value}`).join("\n");
  }
});
document.querySelector("#editorSplit")?.addEventListener("click", () => {
  const groups = document.querySelector("#editorGroups");
  groups?.classList.toggle("split");
  const split = groups?.classList.contains("split");
  document.querySelector("#monacoEditorSecondary").hidden = !split;
  monacoEditor?.layout();
  monacoSplitEditor?.layout();
  setEditorStatus(split ? "Split editor group opened." : "Split editor group closed.");
});
document.querySelector("#editorRecover")?.addEventListener("click", async () => {
  try {
    const records = await window.bluePet.editorRecovery();
    if (!records.length) return setEditorStatus("No unsaved recovery snapshots were found.");
    const choices = records.map((item, index) => `${index + 1}. ${item.path}`).join("\n");
    const selected = window.prompt(`Choose a recovery snapshot by number:\n${choices}`, "1");
    const record = records[Number(selected) - 1];
    if (!record) return setEditorStatus("Recovery cancelled.");
    const session = await window.bluePet.editorRestore(record.path);
    const editorId = rememberFileSession(session);
    pinnedFileEditors.add(editorId);
    if (previewFileEditorId === editorId) previewFileEditorId = null;
    ensureEditorOpen("workspace", editorId);
    selectTab("workspace", editorId);
    applyFileEditorSession(session, `Recovered unsaved work for ${session.path}`);
  } catch (error) { setEditorStatus(`Recovery failed: ${error.message}`, "error"); }
});
window.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && activeFileEditorSession) {
    event.preventDefault(); saveWorkspaceFile();
  }
});
setInterval(pollOpenFileChanges, 2000);
setInterval(pollWorkspaceChanges, 4000);
pollWorkspaceChanges();

function formatTreeResult(result) {
  const entries = result?.data?.entries || [];
  if (!entries.length) return "No workspace files returned yet.";
  return entries.slice(0, 120).map(item => `${"  ".repeat(item.depth || 0)}${item.type === "folder" ? "▸" : ""} ${item.path}${item.type === "folder" ? "/" : ""}`).join("\n");
}

async function loadWorkspaceTree() {
  selectTab("workspace", "file-preview");
  renderPreIntoEditor("file-preview", "Loading real Project Blue workspace tree...");
  try {
    const result = await window.bluePet.workspaceAgent("/files");
    renderPreIntoEditor("file-preview", formatTreeResult(result));
  } catch (error) {
    renderPreIntoEditor("file-preview", `Workspace tree unavailable: ${error.message}`);
  }
}

let gitState = null;
function selectedGitPaths() { return [...document.querySelectorAll(".git-file-select:checked")].map(input => input.value); }
function renderGitState(state) {
  gitState = state;
  document.querySelector("#gitBranch").textContent = `Branch: ${state.branch || "detached"}`;
  document.querySelector("#gitUpstream").textContent = state.upstream || "No upstream";
  document.querySelector("#gitCleanState").textContent = state.clean ? "Working tree clean" : `${state.files.length} changed | ${state.conflicts.length} conflicts`;
  const root = document.querySelector("#gitChangeList"); root.replaceChildren();
  for (const file of state.files) {
    const row = document.createElement("label"); row.className = "git-change-row";
    const check = document.createElement("input"); check.type = "checkbox"; check.className = "git-file-select"; check.value = file.path;
    const code = document.createElement("span"); code.className = "git-code"; code.textContent = file.conflict ? "UU" : file.untracked ? "??" : `${file.index}${file.worktree}`;
    const name = document.createElement("span"); name.className = "git-path"; name.textContent = file.path; name.title = file.path;
    row.append(check, code, name); row.onclick = () => { document.querySelector("#gitDetails").textContent = `${file.path}\nIndex: ${file.index}\nWorktree: ${file.worktree}\n${file.conflict ? "MERGE CONFLICT - manual review required" : file.deleted ? "Deleted" : file.untracked ? "Untracked" : "Modified"}`; }; root.append(row);
  }
  if (!state.files.length) root.textContent = "No changes.";
}
async function loadGitState() {
  selectTab("git", "source-control");
  try {
    const [state, branches] = await Promise.all([window.bluePet.workspaceGit(), window.bluePet.gitBranches()]); renderGitState(state);
    const select = document.querySelector("#gitBranchSelect"); select.replaceChildren();
    for (const branch of branches) { const option = document.createElement("option"); option.value = branch.name; option.textContent = `${branch.current ? "* " : ""}${branch.name}${branch.upstream ? ` -> ${branch.upstream}` : ""}`; option.selected = branch.current; select.append(option); }
  } catch (error) { document.querySelector("#gitDetails").textContent = `Git state unavailable: ${error.message}`; }
}

async function gitSelectedAction(action) {
  const files = selectedGitPaths(); if (!files.length) throw new Error("Select at least one changed file.");
  const result = await action(files); renderGitState(result); return result;
}
async function approvedGitAction(action) {
  const approval = document.querySelector("#gitApproval"); if (!approval?.checked) throw new Error("Check the approval box first.");
  const result = await action(); approval.checked = false; if (result?.status) renderGitState(result.status); return result;
}

async function runWorkbenchSearch(query, replacementPreview = false) {
  const searchText = String(query || document.querySelector("#workbenchSearchInput")?.value || commandSearch?.value || "").trim();
  selectTab("search", "search-results");
  const resultsRoot = document.querySelector("#workbenchSearchResults");
  if (resultsRoot) resultsRoot.textContent = searchText ? `Searching for ${searchText}...` : "Type a search query first.";
  if (!searchText) return;
  try {
    const options = {
      regex: document.querySelector("#workbenchSearchRegex")?.checked,
      matchCase: document.querySelector("#workbenchSearchCase")?.checked,
      wholeWord: document.querySelector("#workbenchSearchWord")?.checked,
      include: document.querySelector("#workbenchSearchInclude")?.value,
      exclude: document.querySelector("#workbenchSearchExclude")?.value,
      limit: 1000
    };
    const replacement = document.querySelector("#workbenchReplaceInput")?.value || "";
    const result = replacementPreview
      ? await window.bluePet.editorReplacePreview({ query: searchText, replacement, options })
      : await window.bluePet.editorWorkspaceSearch({ query: searchText, options });
    renderWorkspaceSearchResults(result, replacementPreview);
  } catch (error) {
    if (resultsRoot) resultsRoot.textContent = `Search unavailable: ${error.message}`;
  }
}

function renderWorkspaceSearchResults(result, replacementPreview = false) {
  const root = document.querySelector("#workbenchSearchResults");
  if (!root) return;
  root.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "tree-heading";
  summary.textContent = `${result.matches || 0} matches in ${result.files?.length || 0} files${result.truncated ? " (limit reached)" : ""}`;
  root.append(summary);
  for (const file of result.files || []) {
    const group = document.createElement("details");
    group.open = true;
    const heading = document.createElement("summary");
    heading.textContent = `${file.path} (${file.results.length})`;
    group.append(heading);
    for (const match of file.results) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "tree-row search-match-row";
      row.textContent = replacementPreview
        ? `${match.line}:${match.column}  ${match.before}  ->  ${match.after}`
        : `${match.line}:${match.column}  ${match.preview.trim()}`;
      row.onclick = async () => {
        const session = await openWorkspaceFile(file.path, { pinned: true });
        if (!session || !editorElements.content) return;
        const lines = editorValue().split(/\r?\n/);
        const offset = lines.slice(0, Math.max(0, match.line - 1)).reduce((total, line) => total + line.length + 1, 0) + Math.max(0, match.column - 1);
        focusEditorRange(offset, match.length || 0);
      };
      group.append(row);
    }
    root.append(group);
  }
  if (!result.files?.length) root.append(document.createTextNode("No matches found."));
}
function openSidebarItem(label) {
  const text = String(label || "").toLowerCase();
  if (layoutState.activeActivity === "streaming") {
    const streamingEditors = {
      "obs": "obs",
      "scenes": "scenes",
      "stream setup": "stream-setup",
      "platforms": "platforms",
      "chat": "stream-chat",
      "moderation": "moderation",
      "titles": "titles",
      "avatar output": "avatar-output"
    };
    if (streamingEditors[text]) return selectTab("streaming", streamingEditors[text]);
  }
  if (text.includes("conversation") || text.includes("chat")) { openAuxiliaryChat(); return selectTab("workspace", "workspace-home"); }
  if (text.includes("project files") || text === "files") return loadWorkspaceTree();
  if (text.includes("reference")) return runReferenceSearch();
  if (text.includes("workspace settings")) return selectTab("workspace", "workspace-settings");
  if (text.includes("editor")) return selectTab("workspace", "workspace-home");
  if (text.includes("research") || text.includes("learning")) return selectTab("research", "research-lab");
  if (text.includes("blueprint")) return selectTab("research", "blueprint-editor");
  if (text.includes("generated") || text.includes("generator") || text.includes("live2d") || text.includes("3d model") || text.includes("audio")) return selectTab("generator", "generated-result");
  if (text.includes("vrm animation") || text.includes("animation")) return selectTab("generator", "animation-generator");
  if (text.includes("idea")) return selectTab("research", "idea-lab");
  if (text.includes("file") || text.includes("image") || text.includes("folder") || text.includes("ocr")) return selectTab("workspace", "file-preview");
  if (text.includes("voice") || text.includes("microphone")) return selectTab("ai", "voice");
  if (text.includes("avatar")) return selectTab("ai", "avatar");
  if (text.includes("movement")) return selectTab("ai", "movement");
  if (text.includes("local ai")) return selectTab("ai", "local-ai");
  if (text.includes("security")) return selectTab("diagnostics", "security");
  if (text.includes("hardware")) return selectTab("diagnostics", "pc-actions");
  if (text.includes("function")) return selectTab("diagnostics", "function-health");
  if (text.includes("diagnostic")) { showBottomPanel("activity"); return selectTab("diagnostics", "diagnostics"); }
  if (text.includes("doctor")) return selectTab("diagnostics", "blue-doctor");
  if (text.includes("pc info")) return selectTab("diagnostics", "pc-actions");
  if (text.includes("obs")) return selectTab("streaming", "obs");
  if (text.includes("scene")) return selectTab("streaming", "scenes");
  if (text.includes("stream setup") || text.includes("show runner")) return selectTab("streaming", "stream-setup");
  if (text.includes("stream chat")) return selectTab("streaming", "stream-chat");
  if (text.includes("title")) return selectTab("streaming", "titles");
  if (text.includes("avatar output")) return selectTab("streaming", "avatar-output");
  if (text.includes("platform")) return selectTab("streaming", "platforms");
  if (text.includes("moderation")) return selectTab("streaming", "moderation");
  if (text.includes("discord") || text.includes("command") || text.includes("allowed")) return selectTab("discord", "connection");
  if (text.includes("node")) return selectTab("mesh", "nodes");
  if (text.includes("sync") || text.includes("pairing")) return selectTab("mesh", "sync");
  if (text.includes("conflict")) return selectTab("mesh", "conflicts");
  if (text.includes("ledger")) return selectTab("mesh", "ledger");
  if (text.includes("changes") || text.includes("branch") || text.includes("commit") || text.includes("repository")) return loadGitState();
  if (text.includes("search")) return runWorkbenchSearch();
}

for (const button of document.querySelectorAll("[data-open-activity]")) {
  button.onclick = () => selectTab(button.dataset.openActivity, button.dataset.openEditor);
}
for (const button of document.querySelectorAll("[data-open-editor]")) {
  button.onclick = () => selectTab(layoutState.activeActivity, button.dataset.openEditor);
}
for (const button of document.querySelectorAll("[data-bottom-tab]")) {
  button.onclick = () => showBottomPanel(button.dataset.bottomTab);
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll(".bottom-tabs [data-bottom-tab]")];
    const index = tabs.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    showBottomPanel(tabs[next]?.dataset.bottomTab);
  };
}
document.querySelector("#bottomCollapse")?.addEventListener("click", hideBottomPanel);
document.querySelector("#workbenchSearchRun")?.addEventListener("click", () => runWorkbenchSearch());
document.querySelector("#workbenchReplacePreview")?.addEventListener("click", () => runWorkbenchSearch(undefined, true));
document.querySelector("#workbenchSearchInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); runWorkbenchSearch(); }
});
document.querySelector("#sourceRefreshGit")?.addEventListener("click", () => loadGitState());
document.querySelector("#gitStageSelected")?.addEventListener("click", () => gitSelectedAction(files => window.bluePet.gitStage(files)).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#gitUnstageSelected")?.addEventListener("click", () => gitSelectedAction(files => window.bluePet.gitUnstage(files)).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#gitDiffSelected")?.addEventListener("click", async () => {
  try { const files = selectedGitPaths(); if (files.length !== 1) throw new Error("Select exactly one file for diff review."); const file = gitState.files.find(item => item.path === files[0]); const result = await window.bluePet.gitDiff({ path: files[0], staged: file?.staged && !file?.modified }); ensureEditorOpen("git", "diff-review"); selectTab("git", "diff-review"); document.querySelector("#gitDiffTitle").textContent = files[0]; document.querySelector("#gitDiffOutput").textContent = result.diff || "No textual diff (the file may be untracked, binary, or unchanged in this side)."; } catch (error) { document.querySelector("#gitDetails").textContent = error.message; }
});
document.querySelector("#gitAttribution")?.addEventListener("click", async () => { try { const files = selectedGitPaths(); if (files.length !== 1) throw new Error("Select exactly one file."); const result = await window.bluePet.gitAttribution({ path: files[0] }); document.querySelector("#gitDetails").textContent = result.changes.length ? result.changes.map(item => `${item.hash} ${item.timestamp} ${item.author}\n  ${item.subject}`).join("\n") : "No committed attribution found."; } catch (error) { document.querySelector("#gitDetails").textContent = error.message; } });
document.querySelector("#sourceHistoryGit")?.addEventListener("click", async () => { try { const history = await window.bluePet.gitHistory(60); document.querySelector("#gitDetails").textContent = history.map(item => `${item.shortHash} ${item.timestamp} ${item.author}\n  ${item.subject}`).join("\n"); } catch (error) { document.querySelector("#gitDetails").textContent = error.message; } });
document.querySelector("#gitCommit")?.addEventListener("click", () => approvedGitAction(() => window.bluePet.gitCommit({ message: document.querySelector("#gitCommitMessage")?.value, approved: true })).then(result => { document.querySelector("#gitActionStatus").textContent = result.output || "Commit complete."; document.querySelector("#gitCommitMessage").value = ""; }).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#gitSwitch")?.addEventListener("click", () => approvedGitAction(() => window.bluePet.gitSwitch({ name: document.querySelector("#gitBranchSelect")?.value, approved: true })).then(() => loadGitState()).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#gitPull")?.addEventListener("click", () => approvedGitAction(() => window.bluePet.gitPull({ approved: true })).then(result => { document.querySelector("#gitActionStatus").textContent = result.output || "Already up to date."; }).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#gitPush")?.addEventListener("click", () => approvedGitAction(() => window.bluePet.gitPush({ approved: true })).then(result => { document.querySelector("#gitActionStatus").textContent = result.output || "Push complete."; }).catch(error => { document.querySelector("#gitActionStatus").textContent = error.message; }));
document.querySelector("#resetLayout")?.addEventListener("click", resetWorkbenchLayout);
installResizeHandles();
applyLayoutPrefs();
window.addEventListener("resize", syncResponsiveWorkbench);
selectTab(layoutState.activeActivity, localStorage.getItem(`blueEditor:${layoutState.activeActivity}`));
setTimeout(() => updateAliveDashboard?.(), 0);

function updateBlueContext() {
  const set = (id, value) => { const element = document.querySelector(`#${id}`); if (element) element.textContent = value || "Not available"; };
  set("ctxGoal", layoutState.activeActivity === "workspace" ? "Work with Blue" : shell?.activities?.find(item => item.id === layoutState.activeActivity)?.label || "Idle");
  set("ctxTask", allActivityEditors(layoutState.activeActivity).find(editor => editor.id === currentEditor())?.title || "None selected");
  set("ctxProject", "Project Blue");
  set("ctxFile", currentEditor() ? `${currentEditor()}.editor` : "None selected");
  set("ctxMemory", conversationSelect?.selectedOptions?.[0]?.textContent || "Not available");
  set("ctxSuggestions", layoutState.activeActivity === "workspace" ? "I can inspect recent changes, scan files, or prepare streaming." : "I am tracking this workspace area.");
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
function setDashboardText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value || "Not available";
}

async function runReferenceSearch() {
  const query = window.prompt("Find references to symbol or text:", "");
  if (!query?.trim()) return;
  selectTab("search", "search-results");
  renderPreIntoEditor("search-results", `Finding references to ${query.trim()}...`);
  try {
    const rows = await window.bluePet.editorReferences({ query: query.trim(), options: { wholeWord: true, limit: 300 } });
    renderPreIntoEditor("search-results", rows.length
      ? rows.map(item => `${item.path}:${item.line}:${item.column}  ${item.preview}`).join("\n")
      : `No references found for ${query.trim()}.`);
  } catch (error) {
    renderPreIntoEditor("search-results", `Reference search failed: ${error.message}`);
  }
}

function collectWorkbenchAwareness() {
  const activeActivity = layoutState.activeActivity || "workspace";
  const editor = currentEditor?.() || "workspace-home";
  const conversation = conversationSelect?.selectedOptions?.[0]?.textContent || "Blue Desktop Pet";
  return {
    project: "Project Blue",
    activeActivity,
    editor,
    conversation,
    blueMesh: document.querySelector("#footerBlueMesh")?.textContent || "BlueMesh: installed",
    discord: footerDiscord?.textContent || "Discord: disconnected",
    obs: document.querySelector("#footerObs")?.textContent || "OBS: disconnected",
    security: document.querySelector("#footerSecurity")?.textContent || "Security: not scanned",
    model: document.querySelector("#footerModel")?.textContent || "Model: local/foundation"
  };
}

function updateAliveDashboard(extra = {}) {
  const awareness = { ...collectWorkbenchAwareness(), ...extra };
  setDashboardText("dashSession", awareness.conversation);
  setDashboardText("dashTasks", awareness.activeActivity === "run" ? "Task view is open" : "No task selected");
  setDashboardText("dashStreaming", awareness.obs.replace(/^OBS:\s*/i, "OBS "));
  setDashboardText("dashBlueMesh", awareness.blueMesh.replace(/^BlueMesh:\s*/i, ""));
  setDashboardText("dashHealth", awareness.security.replace(/^Security:\s*/i, ""));
  setDashboardText("dashResearch", awareness.activeActivity === "research" ? "Research lab active" : "Ready for questions");
  setDashboardText("dashBackground", document.body.classList.contains("bottom-open") ? "Bottom panel active" : "Idle");
  setDashboardText("dashPet", awareness.pet || "Present, calm idle");
  setDashboardText("dashFiles", awareness.editor === "file-preview" ? "File preview open" : "Open Explorer to inspect");
  setDashboardText("dashProgress", awareness.progress || "Workbench ready");
  const suggestion = awareness.suggestion || (awareness.activeActivity === "workspace"
    ? "I can inspect recent changes, scan files, or prepare streaming."
    : `I see ${awareness.activeActivity}. Want me to summarize this area?`);
  setDashboardText("dashSuggestions", suggestion);
  setDashboardText("aliveFocus", `${awareness.activeActivity} / ${awareness.editor}`);
  setDashboardText("aliveMood", awareness.activeActivity === "streaming" ? "Showtime" : awareness.activeActivity === "diagnostics" ? "Curious" : "Attentive");
  const notice = document.querySelector("#proactiveNotice");
  if (notice) notice.textContent = suggestion;
  setDashboardText("ctxSuggestions", suggestion);
}

async function refreshAliveGitSummary() {
  setDashboardText("dashGit", "Reading Git...");
  try {
    const result = await window.bluePet.workspaceGit();
    const files = result?.data?.files || [];
    const branch = result?.data?.branch || "current branch";
    const summary = files.length ? `${files.length} changed file(s) on ${branch}` : `No changed files on ${branch}`;
    setDashboardText("dashGit", summary);
    updateAliveDashboard({ suggestion: files.length ? `${files.length} files changed. Want a summary?` : "Git is clean. Good moment to keep building." });
    return result;
  } catch (error) {
    setDashboardText("dashGit", `Git unavailable: ${error.message}`);
    return null;
  }
}

document.querySelector("#dashGitRefresh")?.addEventListener("click", refreshAliveGitSummary);
document.querySelector("#dashFunctionCheck")?.addEventListener("click", async () => {
  setDashboardText("dashProgress", "Checking functions...");
  const result = await window.bluePet.controlAudit();
  setDashboardText("dashProgress", result?.ok ? "Function audit passed" : "Function audit needs attention");
  updateAliveDashboard({ suggestion: result?.ok ? "All controls are wired. We can keep building." : "I found UI wiring issues. Open Diagnostics?" });
  showBottomPanel("output");
});
updateAliveDashboard();
});
updateBlueContext();
function setDashboardText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value || "Not available";
}

function collectWorkbenchAwareness() {
  const activeActivity = layoutState.activeActivity || "workspace";
  const editor = currentEditor?.() || "workspace-home";
  const conversation = conversationSelect?.selectedOptions?.[0]?.textContent || "Blue Desktop Pet";
  return {
    project: "Project Blue",
    activeActivity,
    editor,
    conversation,
    blueMesh: document.querySelector("#footerBlueMesh")?.textContent || "BlueMesh: installed",
    discord: footerDiscord?.textContent || "Discord: disconnected",
    obs: document.querySelector("#footerObs")?.textContent || "OBS: disconnected",
    security: document.querySelector("#footerSecurity")?.textContent || "Security: not scanned",
    model: document.querySelector("#footerModel")?.textContent || "Model: local/foundation"
  };
}

function updateAliveDashboard(extra = {}) {
  const awareness = { ...collectWorkbenchAwareness(), ...extra };
  setDashboardText("dashSession", awareness.conversation);
  setDashboardText("dashTasks", awareness.activeActivity === "run" ? "Task view is open" : "No task selected");
  setDashboardText("dashStreaming", awareness.obs.replace(/^OBS:\s*/i, "OBS "));
  setDashboardText("dashBlueMesh", awareness.blueMesh.replace(/^BlueMesh:\s*/i, ""));
  setDashboardText("dashHealth", awareness.security.replace(/^Security:\s*/i, ""));
  setDashboardText("dashResearch", awareness.activeActivity === "research" ? "Research lab active" : "Ready for questions");
  setDashboardText("dashBackground", document.body.classList.contains("bottom-open") ? "Bottom panel active" : "Idle");
  setDashboardText("dashPet", awareness.pet || "Present, calm idle");
  setDashboardText("dashFiles", awareness.editor === "file-preview" ? "File preview open" : "Open Explorer to inspect");
  setDashboardText("dashProgress", awareness.progress || "Workbench ready");
  const suggestion = awareness.suggestion || (awareness.activeActivity === "workspace"
    ? "I can inspect recent changes, scan files, or prepare streaming."
    : `I see ${awareness.activeActivity}. Want me to summarize this area?`);
  setDashboardText("dashSuggestions", suggestion);
  setDashboardText("aliveFocus", `${awareness.activeActivity} / ${awareness.editor}`);
  setDashboardText("aliveMood", awareness.activeActivity === "streaming" ? "Showtime" : awareness.activeActivity === "diagnostics" ? "Curious" : "Attentive");
  const notice = document.querySelector("#proactiveNotice");
  if (notice) notice.textContent = suggestion;
  setDashboardText("ctxSuggestions", suggestion);
}

async function refreshAliveGitSummary() {
  setDashboardText("dashGit", "Reading Git...");
  try {
    const result = await window.bluePet.workspaceGit();
    const files = result?.data?.files || [];
    const branch = result?.data?.branch || "current branch";
    const summary = files.length ? `${files.length} changed file(s) on ${branch}` : `No changed files on ${branch}`;
    setDashboardText("dashGit", summary);
    updateAliveDashboard({ suggestion: files.length ? `${files.length} files changed. Want a summary?` : "Git is clean. Good moment to keep building." });
    return result;
  } catch (error) {
    setDashboardText("dashGit", `Git unavailable: ${error.message}`);
    return null;
  }
}

document.querySelector("#dashGitRefresh")?.addEventListener("click", refreshAliveGitSummary);
document.querySelector("#dashFunctionCheck")?.addEventListener("click", async () => {
  setDashboardText("dashProgress", "Checking functions...");
  const result = await window.bluePet.controlAudit();
  setDashboardText("dashProgress", result?.ok ? "Function audit passed" : "Function audit needs attention");
  updateAliveDashboard({ suggestion: result?.ok ? "All controls are wired. We can keep building." : "I found UI wiring issues. Open Diagnostics?" });
  showBottomPanel("output");
});
updateAliveDashboard();

const commandActions = [
  { label: "Workspace: New conversation", category: "Workspace", terms: ["new conversation", "new chat"], run: () => { selectTab("workspace", "blue-chat"); document.querySelector("#newConversationName")?.focus(); } },
  { label: "Workspace: Open Blue Chat", category: "Workspace", terms: ["workspace", "chat", "talk"], run: () => { selectTab("workspace", "workspace-home"); openAuxiliaryChat(); } },
  { label: "Workspace: Open file preview", category: "Workspace", terms: ["files", "images", "folder", "preview"], run: () => selectTab("workspace", "file-preview") },
  { label: "Workspace: Attach files", category: "Workspace", terms: ["share files", "attach"], run: () => { openAuxiliaryChat(); document.querySelector("#files")?.click(); } },
  { label: "Workspace: Scan image text", category: "Workspace", terms: ["scan image", "image text", "ocr"], run: () => { openAuxiliaryChat(); document.querySelector("#scanImage")?.click(); } },
  { label: "Search: Find in workspace", category: "Search", terms: ["search", "find", "workspace search"], run: () => selectTab("search", "search-results") },
  { label: "Research: Open Research Lab", category: "Research", terms: ["research", "learning", "deep research"], run: () => selectTab("research", "research-lab") },
  { label: "Research: Open Idea Lab", category: "Research", terms: ["idea", "lab", "create"], run: () => selectTab("research", "idea-lab") },
  { label: "Source Control: Open Git", category: "Source Control", terms: ["git", "source control", "changes", "commit"], run: () => selectTab("git", "source-control") },
  { label: "Run: Open Tasks", category: "Run", terms: ["tasks", "build", "run task"], run: () => selectTab("run", "tasks") },
  { label: "Run: Open Terminal", category: "Run", terms: ["terminal", "shell", "console"], run: () => selectTab("run", "terminal-editor") },
  { label: "Run: Open Debugger", category: "Run", terms: ["debug", "debugger", "breakpoints"], run: () => selectTab("run", "debugger") },
  { label: "Run: Open Test Explorer", category: "Run", terms: ["test", "tests", "test explorer"], run: () => selectTab("run", "tests") },
  { label: "AI: Open Voice and microphone", category: "AI & Presence", terms: ["voice", "wake", "listen", "microphone"], run: () => selectTab("ai", "voice") },
  { label: "AI: Open Presence and privacy", category: "AI & Presence", terms: ["presence", "privacy"], run: () => selectTab("ai", "presence") },
  { label: "AI: Open Avatar and movement", category: "AI & Presence", terms: ["movement", "motion", "avatar", "expressions"], run: () => selectTab("ai", "avatar") },
  { label: "AI: Check local model", category: "AI & Presence", terms: ["local ai", "model", "ollama"], run: () => selectTab("ai", "local-ai") },
  { label: "Systems: Read Windows security", category: "Systems", terms: ["security", "defender", "firewall", "virus"], run: () => selectTab("diagnostics", "security") },
  { label: "Tools: Run Blue Doctor", category: "Tools", terms: ["system", "health", "doctor", "diagnostics"], run: () => selectTab("diagnostics", "blue-doctor") },
  { label: "Tools: Open Extensions", category: "Tools", terms: ["extension", "extensions", "skills", "add-on"], run: () => selectTab("extensions", "skills") },
  { label: "Streaming: Open studio", category: "Streaming", terms: ["obs", "stream", "streaming", "scenes"], run: () => selectTab("streaming", "streaming-studio") },
  { label: "Streaming: Build AI run-of-show", category: "Streaming", terms: ["neuro", "show runner", "autonomy", "independent"], run: () => selectTab("streaming", "stream-setup") },
  { label: "Streaming: Open scenes", category: "Streaming", terms: ["obs scenes", "switch scene"], run: () => selectTab("streaming", "scenes") },
  { label: "Streaming: Platform catalog", category: "Streaming", terms: ["twitch", "youtube", "kick", "fansly", "onlyfans", "chaturbate", "adult"], run: () => selectTab("streaming", "platforms") },
  { label: "Streaming: Chat and moderation", category: "Streaming", terms: ["stream chat", "moderation", "chat reader"], run: () => selectTab("streaming", "stream-chat") },
  { label: "Streaming: Avatar output", category: "Streaming", terms: ["vrm", "live2d", "warudo", "avatar output"], run: () => selectTab("streaming", "avatar-output") },
  { label: "Discord: Open connection", category: "Discord", terms: ["discord", "bot"], run: () => selectTab("discord", "connection") },
  { label: "BlueMesh: Open identity and sync", category: "BlueMesh", terms: ["bluemesh", "mesh", "sync", "nodes"], run: () => selectTab("mesh", "identity") },
  { label: "View: Show Output panel", category: "View", terms: ["output", "problems", "activity log", "security log", "panel"], run: () => showBottomPanel("output") },
  { label: "Generator: Preview latest result", category: "Generator", terms: ["latest result", "show result", "preview result", "artifact"], run: () => { selectTab("generator", "generated-result"); loadCurrentArtifact(); } },
  { label: "Preferences: Open Settings", category: "Preferences", terms: ["settings", "preferences", "configuration"], run: () => selectTab("settings", "settings") }
];

const commandPalette = document.querySelector("#commandPalette");
const commandPaletteResults = document.querySelector("#commandPaletteResults");
let commandSelection = 0;
let visibleCommands = [];

function commandMatches(command, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [command.label, command.category, ...command.terms].join(" ").toLowerCase();
  return words.every(word => haystack.includes(word));
}

function closeCommandPalette(clear = false) {
  if (commandPalette) commandPalette.hidden = true;
  commandSearch?.setAttribute("aria-expanded", "false");
  if (clear && commandSearch) commandSearch.value = "";
}

function renderCommandPalette() {
  if (!commandPalette || !commandPaletteResults || !commandSearch) return;
  const query = commandSearch.value.trim().replace(/^>/, "");
  visibleCommands = commandActions.filter(command => commandMatches(command, query)).slice(0, 40);
  commandSelection = Math.max(0, Math.min(commandSelection, visibleCommands.length - 1));
  commandPaletteResults.replaceChildren();
  if (!visibleCommands.length) {
    const empty = document.createElement("div");
    empty.className = "command-palette-empty";
    empty.textContent = "No matching Project Blue command.";
    commandPaletteResults.append(empty);
  }
  visibleCommands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-palette-item";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === commandSelection));
    button.innerHTML = `<span aria-hidden="true">›</span><span>${escapeHtml(command.label)}</span><small>${escapeHtml(command.category)}</small>`;
    button.addEventListener("pointerenter", () => { commandSelection = index; renderCommandPalette(); });
    button.addEventListener("click", () => executeCommand(command));
    commandPaletteResults.append(button);
  });
  commandPalette.hidden = false;
  commandSearch.setAttribute("aria-expanded", "true");
  commandPaletteResults.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function executeCommand(command) {
  if (!command) return;
  closeCommandPalette(true);
  command.run();
}

function runCommand(value) {
  const query = String(value || "").trim().replace(/^>/, "").toLowerCase();
  if (!query) return;
  const command = commandActions.find(item => item.label.toLowerCase() === query || item.terms.some(term => term === query)) || commandActions.find(item => commandMatches(item, query));
  if (command) {
    executeCommand(command);
  } else {
    append("blue", `No control matched "${value}". Try Workspace, Research, Streaming, BlueMesh, Security, or Tools.`);
  }
}

commandSearch.onkeydown = event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!visibleCommands.length) renderCommandPalette();
    else {
      const offset = event.key === "ArrowDown" ? 1 : -1;
      commandSelection = (commandSelection + offset + visibleCommands.length) % visibleCommands.length;
      renderCommandPalette();
    }
  }
  if (event.key === "Enter") { event.preventDefault(); executeCommand(visibleCommands[commandSelection] || commandActions.find(item => commandMatches(item, commandSearch.value.replace(/^>/, "")))); }
  if (event.key === "Escape") {
    closeCommandPalette(true);
    commandSearch.blur();
  }
};
commandSearch.addEventListener("input", () => { commandSelection = 0; renderCommandPalette(); });
commandSearch.addEventListener("focus", renderCommandPalette);
document.addEventListener("pointerdown", event => {
  if (!commandPalette?.hidden && !commandPalette.contains(event.target) && event.target !== commandSearch) closeCommandPalette(false);
});
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
function setDashboardText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value || "Not available";
}

function collectWorkbenchAwareness() {
  const activeActivity = layoutState.activeActivity || "workspace";
  const editor = currentEditor?.() || "workspace-home";
  const conversation = conversationSelect?.selectedOptions?.[0]?.textContent || "Blue Desktop Pet";
  return {
    project: "Project Blue",
    activeActivity,
    editor,
    conversation,
    blueMesh: document.querySelector("#footerBlueMesh")?.textContent || "BlueMesh: installed",
    discord: footerDiscord?.textContent || "Discord: disconnected",
    obs: document.querySelector("#footerObs")?.textContent || "OBS: disconnected",
    security: document.querySelector("#footerSecurity")?.textContent || "Security: not scanned",
    model: document.querySelector("#footerModel")?.textContent || "Model: local/foundation"
  };
}

function updateAliveDashboard(extra = {}) {
  const awareness = { ...collectWorkbenchAwareness(), ...extra };
  setDashboardText("dashSession", awareness.conversation);
  setDashboardText("dashTasks", awareness.activeActivity === "run" ? "Task view is open" : "No task selected");
  setDashboardText("dashStreaming", awareness.obs.replace(/^OBS:\s*/i, "OBS "));
  setDashboardText("dashBlueMesh", awareness.blueMesh.replace(/^BlueMesh:\s*/i, ""));
  setDashboardText("dashHealth", awareness.security.replace(/^Security:\s*/i, ""));
  setDashboardText("dashResearch", awareness.activeActivity === "research" ? "Research lab active" : "Ready for questions");
  setDashboardText("dashBackground", document.body.classList.contains("bottom-open") ? "Bottom panel active" : "Idle");
  setDashboardText("dashPet", awareness.pet || "Present, calm idle");
  setDashboardText("dashFiles", awareness.editor === "file-preview" ? "File preview open" : "Open Explorer to inspect");
  setDashboardText("dashProgress", awareness.progress || "Workbench ready");
  const suggestion = awareness.suggestion || (awareness.activeActivity === "workspace"
    ? "I can inspect recent changes, scan files, or prepare streaming."
    : `I see ${awareness.activeActivity}. Want me to summarize this area?`);
  setDashboardText("dashSuggestions", suggestion);
  setDashboardText("aliveFocus", `${awareness.activeActivity} / ${awareness.editor}`);
  setDashboardText("aliveMood", awareness.activeActivity === "streaming" ? "Showtime" : awareness.activeActivity === "diagnostics" ? "Curious" : "Attentive");
  const notice = document.querySelector("#proactiveNotice");
  if (notice) notice.textContent = suggestion;
  setDashboardText("ctxSuggestions", suggestion);
}

async function refreshAliveGitSummary() {
  setDashboardText("dashGit", "Reading Git...");
  try {
    const result = await window.bluePet.workspaceGit();
    const files = result?.data?.files || [];
    const branch = result?.data?.branch || "current branch";
    const summary = files.length ? `${files.length} changed file(s) on ${branch}` : `No changed files on ${branch}`;
    setDashboardText("dashGit", summary);
    updateAliveDashboard({ suggestion: files.length ? `${files.length} files changed. Want a summary?` : "Git is clean. Good moment to keep building." });
    return result;
  } catch (error) {
    setDashboardText("dashGit", `Git unavailable: ${error.message}`);
    return null;
  }
}

document.querySelector("#dashGitRefresh")?.addEventListener("click", refreshAliveGitSummary);
document.querySelector("#dashFunctionCheck")?.addEventListener("click", async () => {
  setDashboardText("dashProgress", "Checking functions...");
  const result = await window.bluePet.controlAudit();
  setDashboardText("dashProgress", result?.ok ? "Function audit passed" : "Function audit needs attention");
  updateAliveDashboard({ suggestion: result?.ok ? "All controls are wired. We can keep building." : "I found UI wiring issues. Open Diagnostics?" });
  showBottomPanel("output");
});
updateAliveDashboard();
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

let streamingWorkbenchStatus = null;
let streamingWorkbenchLoading = null;

function streamingElement(id) {
  return document.querySelector(`#${id}`);
}

function streamingText(id, value) {
  const element = streamingElement(id);
  if (element) element.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function replaceSelectOptions(select, items, selectedValue) {
  if (!select) return;
  select.replaceChildren();
  for (const item of items || []) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selectedValue;
    select.append(option);
  }
}

function currentStreamingConfig() {
  const base = streamingWorkbenchStatus?.config || {};
  return {
    ...base,
    obsUrl: streamingElement("streamingObsUrl")?.value.trim() || base.obsUrl || "ws://127.0.0.1:4455",
    platform: streamingElement("streamingPlatformSelect")?.value || base.platform || "twitch",
    streamMode: streamingElement("streamingModeSelect")?.value || base.streamMode || "sfw",
    chatReadMode: streamingElement("streamingChatMode")?.value || base.chatReadMode || "read_only",
    avatarBackend: streamingElement("streamingAvatarBackend")?.value || base.avatarBackend || "vrm",
    voiceProfile: streamingElement("streamingVoiceProfile")?.value.trim() || base.voiceProfile || "blue_original",
    independentMode: Boolean(streamingElement("streamingIndependent")?.checked),
    verifiedAdultsOnly: Boolean(streamingElement("streamingVerifiedAdults")?.checked),
    platformRulesReviewed: Boolean(streamingElement("streamingRulesReviewed")?.checked),
    adultContentApproval: Boolean(streamingElement("streamingAdultApproval")?.checked)
  };
}

function renderStreamingPlatformCatalog(status) {
  const root = streamingElement("streamingPlatformCatalog");
  if (!root) return;
  root.replaceChildren();
  const groups = [
    ["SFW & community", ["sfw", "community"]],
    ["Adult verified", ["adult"]],
    ["Custom / adapter required", ["custom"]]
  ];
  for (const [title, types] of groups) {
    const details = document.createElement("details");
    details.open = title === "SFW & community";
    const summary = document.createElement("summary");
    const items = (status.platforms || []).filter(item => types.includes(item.type));
    summary.textContent = `${title} (${items.length})`;
    details.append(summary);
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Platform</th><th>Adapter</th><th>Chat</th><th>Age gate</th></tr></thead>";
    const body = document.createElement("tbody");
    for (const item of items) {
      const row = document.createElement("tr");
      for (const value of [item.label, item.adapter, item.chatSupport, item.requiresAgeVerification ? "Required" : "No"]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      row.onclick = () => {
        const select = streamingElement("streamingPlatformSelect");
        if (select) select.value = item.id;
        streamingText("streamingPlatformOutput", `${item.label}\nType: ${item.type}\nAdapter: ${item.adapter}\nChat: ${item.chatSupport}\n${item.requiresAgeVerification ? "Verified-adult gate required." : "Standard platform review required."}`);
      };
      body.append(row);
    }
    table.append(body);
    details.append(table);
    root.append(details);
  }
}

function applyStreamingStatus(status) {
  streamingWorkbenchStatus = status;
  const config = status.config || {};
  replaceSelectOptions(streamingElement("streamingPlatformSelect"), status.platforms, config.platform);
  replaceSelectOptions(streamingElement("streamingShowFormat"), status.showFormats, "neuro_chat");
  replaceSelectOptions(streamingElement("streamingAutonomyLevel"), status.autonomyLevels, config.independentMode ? "independent_guarded" : "assistant");
  const values = {
    streamingModeSelect: config.streamMode,
    streamingChatMode: config.chatReadMode,
    streamingAvatarBackend: config.avatarBackend,
    streamingObsUrl: config.obsUrl,
    streamingVoiceProfile: config.voiceProfile
  };
  for (const [id, value] of Object.entries(values)) if (streamingElement(id) && value != null) streamingElement(id).value = value;
  for (const [id, value] of Object.entries({ streamingIndependent: config.independentMode, streamingVerifiedAdults: config.verifiedAdultsOnly, streamingRulesReviewed: config.platformRulesReviewed, streamingAdultApproval: config.adultContentApproval })) {
    if (streamingElement(id)) streamingElement(id).checked = Boolean(value);
  }
  streamingText("streamingSummaryPlatform", (status.platforms || []).find(item => item.id === config.platform)?.label || config.platform || "Not selected");
  streamingText("streamingSummaryMode", config.streamMode || "Not selected");
  streamingText("streamingSummaryAvatar", config.avatarBackend || "Not selected");
  streamingText("streamingSummaryPreflight", status.preflight?.readyToPrepare ? "Ready to prepare" : `${status.preflight?.blockers?.length || 0} checks need review`);
  streamingText("streamingStatusDetails", { config, preflight: status.preflight, chat: status.chat });
  renderStreamingPlatformCatalog(status);
  const footerObs = streamingElement("footerObs");
  if (footerObs) footerObs.textContent = "OBS: not checked";
  return status;
}

async function refreshStreamingWorkbench(force = false) {
  if (streamingWorkbenchStatus && !force) return streamingWorkbenchStatus;
  if (streamingWorkbenchLoading) return streamingWorkbenchLoading;
  streamingWorkbenchLoading = window.bluePet.streamingStatus()
    .then(applyStreamingStatus)
    .finally(() => { streamingWorkbenchLoading = null; });
  return streamingWorkbenchLoading;
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
  streamingShowRunner: document.querySelector("#streamingShowRunner"),
  streamingFullPreflight: document.querySelector("#streamingFullPreflight"),
  streamingAdultReadiness: document.querySelector("#streamingAdultReadiness"),
  streamingChatGuide: document.querySelector("#streamingChatGuide"),
  streamingModerationRules: document.querySelector("#streamingModerationRules"),
  streamingMetadataPreview: document.querySelector("#streamingMetadataPreview"),
  streamingMetadataClear: document.querySelector("#streamingMetadataClear"),
  streamingAvatarSave: document.querySelector("#streamingAvatarSave"),
  blueMeshCheck: document.querySelector("#blueMeshCheck"),
  blueMeshToken: document.querySelector("#blueMeshToken"),
  blueMeshSmoke: document.querySelector("#blueMeshSmoke"),
  blueMeshOpenDocs: document.querySelector("#blueMeshOpenDocs"),
  blueMeshCopyServer: document.querySelector("#blueMeshCopyServer"),
  blueMeshCopyPush: document.querySelector("#blueMeshCopyPush"),
  settingsOpenProject: document.querySelector("#settingsOpenProject"),
  settingsRunAudit: document.querySelector("#settingsRunAudit"),
  workspaceSettingsSave: document.querySelector("#workspaceSettingsSave"),
  workspaceSettingsReload: document.querySelector("#workspaceSettingsReload"),
  workspaceRootAdd: document.querySelector("#workspaceRootAdd"),
  workspaceSymbolsRefresh: document.querySelector("#workspaceSymbolsRefresh")
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

  wire("chatRunAudit", async () => { selectTab("diagnostics", "diagnostics"); showBottomPanel("output"); return window.bluePet.controlAudit(); });
  wire("chatToolPaste", async () => click("pasteSend"));
  wire("chatToolOcr", async () => click("useOcr"));
  wire("chatAttachFiles", async () => click("files"));
  wire("chatAttachImages", async () => click("images"));
  wire("chatAttachFolder", async () => click("folder"));
  wire("chatPasteClipboard", async () => click("clipboard"));
  wire("chatScanImage", async () => click("scanImage"));
  wire("chatToolIdea", async () => { selectTab("research", "idea-lab"); document.querySelector("#labTitle")?.focus(); });
  wire("chatToolLearn", async () => { selectTab("research", "research-lab"); document.querySelector("#learningTopic")?.focus(); });
  wire("chatToolResearch", async () => { selectTab("research", "research-lab"); document.querySelector("#learningTopic")?.focus(); });
  wire("chatToolAgent", async () => { selectTab("research", "research-lab"); document.querySelector("#agentGoal")?.focus(); });

  wire("devRunAudit", async () => window.bluePet.controlAudit());
  wire("devRunDoctor", async () => window.bluePet.doctor());
  wire("devSystemInfo", async () => window.bluePet.systemInfo());
  wire("devOpenProject", async () => window.bluePet.openProject());
  wire("devFocusDiagnostics", async () => { selectTab("diagnostics", "diagnostics"); showBottomPanel("output"); return "Diagnostics focused."; });
  wire("devSecurityScan", async () => { selectTab("diagnostics", "security"); click("securityScan"); });
  wire("devBlueMeshCheck", async () => window.bluePet.blueMeshStatus());

  wire("streamingStatusRefresh", async () => applyStreamingStatus(await window.bluePet.streamingStatus()));
  wire("streamingObsSave", async () => {
    const result = await window.bluePet.saveStreamingConfig({ obsUrl: currentStreamingConfig().obsUrl });
    streamingWorkbenchStatus = null;
    streamingText("streamingObsOutput", result.message);
    return result;
  });
  wire("streamingObsCheck", async () => {
    const result = await window.bluePet.checkObs({ obsUrl: currentStreamingConfig().obsUrl, password: streamingElement("streamingObsPassword")?.value || "" });
    streamingText("streamingObsOutput", result);
    const footerObs = streamingElement("footerObs");
    if (footerObs) footerObs.textContent = `OBS: ${result.obsVersion || "connected"}`;
    return result;
  });
  wire("streamingObsSceneRefresh", async () => {
    const result = await window.bluePet.listObsScenes({ obsUrl: currentStreamingConfig().obsUrl, password: streamingElement("streamingObsPassword")?.value || "" });
    replaceSelectOptions(streamingElement("streamingSceneSelect"), (result.scenes || []).map(name => ({ id: name, label: name })), result.currentProgramSceneName);
    streamingText("streamingSceneOutput", result);
    return result;
  });
  wire("streamingObsCaptureGuide", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "obs", config: currentStreamingConfig() });
    streamingText("streamingObsOutput", result);
    return result;
  });
  wire("streamingObsSceneSwitch", async () => {
    const result = await window.bluePet.switchObsScene({
      obsUrl: currentStreamingConfig().obsUrl,
      password: streamingElement("streamingObsPassword")?.value || "",
      sceneName: streamingElement("streamingSceneSelect")?.value || "",
      approved: Boolean(streamingElement("streamingSceneApprove")?.checked)
    });
    streamingText("streamingSceneOutput", result);
    if (streamingElement("streamingSceneApprove")) streamingElement("streamingSceneApprove").checked = false;
    return result;
  });
  wire("streamingSavePlatform", async () => {
    const result = await window.bluePet.saveStreamingConfig(currentStreamingConfig());
    streamingWorkbenchStatus = null;
    applyStreamingStatus(await window.bluePet.streamingStatus());
    streamingText("streamingPlatformOutput", result.message);
    return result;
  });
  wire("streamingChatReadiness", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "chat", config: currentStreamingConfig() });
    streamingText("streamingChatOutput", result);
    return result;
  });
  wire("streamingChatGuide", async () => {
    const status = await refreshStreamingWorkbench(true);
    streamingText("streamingChatOutput", status.chatGuide);
    return status.chatGuide;
  });
  wire("streamingRulesCheck", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "preflight", config: currentStreamingConfig() });
    streamingText("streamingPlatformOutput", result);
    return result;
  });
  wire("streamingModerationRules", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "preflight", config: currentStreamingConfig() });
    streamingText("streamingModerationOutput", result);
    return result;
  });
  wire("streamingModerationPlan", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "moderation", config: currentStreamingConfig(), message: streamingElement("streamingModerationSample")?.value || "" });
    streamingText("streamingModerationOutput", result);
    return result;
  });
  wire("streamingAdultReadiness", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "adult", config: currentStreamingConfig() });
    streamingText("streamingPlatformOutput", result);
    return result;
  });
  wire("streamingShowRunner", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "showrunner", config: currentStreamingConfig(), showFormat: streamingElement("streamingShowFormat")?.value, autonomyLevel: streamingElement("streamingAutonomyLevel")?.value });
    streamingText("streamingShowOutput", result);
    return result;
  });
  wire("streamingFullPreflight", async () => {
    const result = await window.bluePet.streamingPlan({ kind: "preflight", config: currentStreamingConfig() });
    streamingText("streamingShowOutput", result);
    return result;
  });
  wire("streamingToggleVrm", async () => { if (streamingElement("streamingAvatarBackend")) streamingElement("streamingAvatarBackend").value = "vrm"; const result = await window.bluePet.streamingPlan({ kind: "avatar", config: currentStreamingConfig() }); streamingText("streamingAvatarOutput", result); return result; });
  wire("streamingToggleLive2d", async () => { if (streamingElement("streamingAvatarBackend")) streamingElement("streamingAvatarBackend").value = "live2d"; const result = await window.bluePet.streamingPlan({ kind: "avatar", config: currentStreamingConfig() }); streamingText("streamingAvatarOutput", result); return result; });
  wire("streamingToggleWarudo", async () => { if (streamingElement("streamingAvatarBackend")) streamingElement("streamingAvatarBackend").value = "warudo"; const result = await window.bluePet.streamingPlan({ kind: "avatar", config: currentStreamingConfig() }); streamingText("streamingAvatarOutput", result); return result; });
  wire("streamingAvatarSave", async () => { const result = await window.bluePet.saveStreamingConfig(currentStreamingConfig()); streamingWorkbenchStatus = null; streamingText("streamingAvatarOutput", result.message); return result; });
  wire("streamingVoiceSafety", async () => { const result = await window.bluePet.streamingPlan({ kind: "voice", config: currentStreamingConfig() }); streamingText("streamingAvatarOutput", result); return result; });
  wire("streamingVoiceTest", async () => { click("voiceTest"); return "Streaming voice test started through Blue voice controls."; });
  wire("streamingIndependencePlan", async () => { const result = await window.bluePet.streamingPlan({ kind: "independent", config: currentStreamingConfig() }); streamingText("streamingShowOutput", result); return result; });
  wire("streamingGoLiveChecklist", async () => { const result = await window.bluePet.streamingPlan({ kind: "preflight", config: currentStreamingConfig() }); streamingText("streamingShowOutput", result); return result; });
  wire("streamingMetadataPreview", async () => {
    const preview = [`Title: ${streamingElement("streamingTitleDraft")?.value.trim() || "(untitled)"}`, `Category: ${streamingElement("streamingCategoryDraft")?.value.trim() || "(not selected)"}`, `Tags: ${streamingElement("streamingTagsDraft")?.value.trim() || "(none)"}`, "", "Producer notes:", streamingElement("streamingProducerNotes")?.value.trim() || "(none)", "", "Draft only — nothing was posted or changed on a platform."].join("\n");
    streamingText("streamingMetadataOutput", preview);
    return preview;
  });
  wire("streamingMetadataClear", async () => { for (const id of ["streamingTitleDraft", "streamingCategoryDraft", "streamingTagsDraft", "streamingProducerNotes"]) if (streamingElement(id)) streamingElement(id).value = ""; streamingText("streamingMetadataOutput", "Draft cleared locally."); return "Streaming metadata draft cleared."; });

  wire("blueMeshCheck", async () => window.bluePet.blueMeshStatus());
  wire("blueMeshToken", async () => window.bluePet.blueMeshToken());
  wire("blueMeshSmoke", async () => window.bluePet.blueMeshSmoke());
  wire("blueMeshOpenDocs", async () => window.bluePet.blueMeshOpenDocs());
  wire("blueMeshCopyServer", async () => "Start the BlueMesh receiver from the tools/bluemesh scripts, then paste the session token on the other trusted PC.");
  wire("blueMeshCopyPush", async () => "Use the BlueMesh push command with the trusted peer URL and session-only token. Tokens are never committed.");

  wire("settingsOpenProject", async () => window.bluePet.openProject());
  wire("settingsRunAudit", async () => window.bluePet.controlAudit());
  wire("workspaceSettingsSave", saveWorkspaceSettings);
  wire("workspaceSettingsReload", loadWorkspaceSettings);
  wire("workspaceRootAdd", addWorkspaceRoot);
  wire("workspaceSymbolsRefresh", rebuildSymbolIndex);
}

wireRebuiltShellButtons();

// Phase 4: persistent PTY terminals and supervised task definitions.
const terminalSessions = new Map();
let activeTerminalId = null;
let splitTerminalId = null;

function cleanTerminalOutput(value) {
  return String(value || "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .slice(-1024 * 1024);
}

function terminalForPane(split = false) {
  return terminalSessions.get(split ? splitTerminalId : activeTerminalId);
}

function renderTerminalWorkbench() {
  const tabs = document.querySelector("#terminalTabs");
  if (tabs) {
    tabs.replaceChildren();
    for (const session of terminalSessions.values()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = session.id === activeTerminalId ? "active" : "";
      button.textContent = `${session.title}${session.state === "exited" ? ` (${session.exitCode})` : ""}`;
      button.onclick = () => { activeTerminalId = session.id; renderTerminalWorkbench(); };
      tabs.append(button);
    }
  }
  const primary = terminalForPane(false);
  const secondary = terminalForPane(true);
  const primaryOutput = document.querySelector("#terminalOutput");
  const secondaryOutput = document.querySelector("#terminalSplitOutput");
  if (primaryOutput) { primaryOutput.textContent = cleanTerminalOutput(primary?.output || "Create a terminal to begin."); primaryOutput.scrollTop = primaryOutput.scrollHeight; }
  if (secondaryOutput) { secondaryOutput.textContent = cleanTerminalOutput(secondary?.output || "Choose Split to create another terminal."); secondaryOutput.scrollTop = secondaryOutput.scrollHeight; }
  const splitPane = document.querySelector("#terminalSplitPane");
  const panes = document.querySelector("#terminalPanes");
  if (splitPane) splitPane.hidden = !splitTerminalId;
  panes?.classList.toggle("split", Boolean(splitTerminalId));
  const status = document.querySelector("#terminalStatus");
  if (status) status.textContent = primary
    ? `${primary.profile} | ${primary.cwd} | PID ${primary.pid} | ${primary.state}${primary.exitCode === null ? "" : ` | exit ${primary.exitCode}`}`
    : "No terminal session selected.";
}

async function refreshTerminals() {
  const sessions = await window.bluePet.terminalList();
  terminalSessions.clear();
  for (const session of sessions) terminalSessions.set(session.id, session);
  if (!terminalSessions.has(activeTerminalId)) activeTerminalId = sessions[0]?.id || null;
  if (!terminalSessions.has(splitTerminalId)) splitTerminalId = null;
  renderTerminalWorkbench();
}

async function createTerminal(asSplit = false) {
  const profile = document.querySelector("#terminalProfile")?.value || "powershell";
  const cwd = document.querySelector("#terminalCwd")?.value || ".";
  const session = await window.bluePet.terminalCreate({ profile, cwd, cols: 100, rows: 30 });
  terminalSessions.set(session.id, session);
  if (asSplit) splitTerminalId = session.id; else activeTerminalId = session.id;
  selectTab("run", "terminal-editor");
  renderTerminalWorkbench();
  return session;
}

async function initializeTerminalWorkbench() {
  const profiles = await window.bluePet.terminalProfiles();
  const select = document.querySelector("#terminalProfile");
  if (select) {
    select.replaceChildren();
    for (const profile of profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `${profile.label}${profile.available ? "" : " (not installed)"}`;
      option.disabled = !profile.available;
      select.append(option);
    }
  }
  await refreshTerminals();
  await refreshTasks();
}

async function sendTerminalInput(input, split = false) {
  const session = terminalForPane(split);
  if (!session || !input) return;
  await window.bluePet.terminalWrite({ sessionId: session.id, data: `${input}\r` });
}

async function refreshTasks() {
  const tasks = await window.bluePet.taskList();
  const root = document.querySelector("#taskList");
  if (!root) return;
  root.replaceChildren();
  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = "task-row";
    const description = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = task.label;
    const metadata = document.createElement("small"); metadata.textContent = `${task.type} | ${task.profile} | ${task.cwd}`;
    description.append(title, document.createElement("br"), metadata);
    const run = document.createElement("button"); run.type = "button"; run.textContent = "Run";
    run.onclick = async () => {
      const result = await window.bluePet.taskRun(task.id);
      terminalSessions.set(result.session.id, result.session); activeTerminalId = result.session.id;
      selectTab("run", "terminal-editor"); renderTerminalWorkbench(); showBottomPanel(task.type === "test" ? "tests" : "terminal");
    };
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary"; edit.textContent = "Edit";
    edit.onclick = () => {
      document.querySelector("#taskId").value = task.id; document.querySelector("#taskLabel").value = task.label;
      document.querySelector("#taskType").value = task.type; document.querySelector("#taskProfile").value = task.profile;
      document.querySelector("#taskCwd").value = task.cwd; document.querySelector("#taskCommand").value = task.command;
    };
    row.append(description, run, edit); root.append(row);
  }
}

document.querySelector("#terminalNew")?.addEventListener("click", () => createTerminal(false).catch(error => setWorkbenchOutput(error.message)));
document.querySelector("#terminalSplit")?.addEventListener("click", () => createTerminal(true).catch(error => setWorkbenchOutput(error.message)));
document.querySelector("#terminalKill")?.addEventListener("click", async () => {
  if (!activeTerminalId) return;
  await window.bluePet.terminalClose(activeTerminalId); terminalSessions.delete(activeTerminalId); activeTerminalId = terminalSessions.keys().next().value || null; renderTerminalWorkbench();
});
for (const [id, split] of [["terminalInput", false], ["terminalSplitInput", true]]) {
  document.querySelector(`#${id}`)?.addEventListener("keydown", async event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); const value = event.currentTarget.value; event.currentTarget.value = ""; await sendTerminalInput(value, split); }
    if (event.key.toLowerCase() === "c" && event.ctrlKey) { event.preventDefault(); const session = terminalForPane(split); if (session) await window.bluePet.terminalWrite({ sessionId: session.id, data: "\u0003" }); }
  });
}
document.querySelector("#taskRefresh")?.addEventListener("click", () => refreshTasks().catch(error => setWorkbenchOutput(error.message)));
document.querySelector("#taskClear")?.addEventListener("click", () => document.querySelector("#taskForm")?.reset());
document.querySelector("#taskForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const saveButton = document.querySelector("#taskSave");
  if (saveButton) saveButton.disabled = true;
  try {
    const task = await window.bluePet.taskSave({ id: document.querySelector("#taskId")?.value, label: document.querySelector("#taskLabel")?.value, type: document.querySelector("#taskType")?.value, profile: document.querySelector("#taskProfile")?.value, cwd: document.querySelector("#taskCwd")?.value, command: document.querySelector("#taskCommand")?.value });
    document.querySelector("#taskStatus").textContent = `Saved ${task.label}.`; await refreshTasks();
  } catch (error) { document.querySelector("#taskStatus").textContent = error.message; }
  finally { if (saveButton) saveButton.disabled = false; }
});

window.bluePet.onTerminalEvent(event => {
  if (event.type === "created") terminalSessions.set(event.session.id, event.session);
  const session = terminalSessions.get(event.sessionId);
  if (session && event.type === "data") session.output = `${session.output || ""}${event.data}`.slice(-1024 * 1024);
  if (session && event.type === "exit") { session.state = "exited"; session.exitCode = event.exitCode; }
  if (event.type === "closed") terminalSessions.delete(event.sessionId);
  renderTerminalWorkbench();
  if ((event.type === "data" || event.type === "exit") && bottomPanel && !bottomPanel.hidden && ["terminal", "tests"].includes(layoutState.bottomTab)) {
    setWorkbenchOutput(cleanTerminalOutput(session?.output || `Process exited with ${event.exitCode}.`));
  }
  if (event.key === "F6") {
    event.preventDefault();
    const activeEditor = document.querySelector('.editor-surface > section.active-editor:not([hidden])');
    const parts = [commandSearch, activityBar?.querySelector('[aria-pressed="true"]'), contextSidebar?.querySelector("button, input, select"), activeEditor?.querySelector("button, input, textarea, select, [tabindex='0']"), bottomPanel?.querySelector("button")].filter(Boolean);
    if (!parts.length) return;
    const current = parts.findIndex(part => part === document.activeElement || part.contains(document.activeElement));
    parts[(current + (event.shiftKey ? -1 : 1) + parts.length) % parts.length].focus();
  }
});

function moveRovingFocus(container, selector, event, activate) {
  if (!container || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const items = [...container.querySelectorAll(selector)];
  if (!items.length) return;
  event.preventDefault();
  const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
  const step = event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : (event.key === "ArrowLeft" || event.key === "ArrowUp") ? -1 : 1;
  const current = Math.max(0, items.indexOf(document.activeElement));
  const next = step === -Infinity ? 0 : step === Infinity ? items.length - 1 : (current + step + items.length) % items.length;
  items.forEach((item, index) => { item.tabIndex = index === next ? 0 : -1; });
  items[next].focus();
  if (activate && !vertical) items[next].click();
}
activityBar?.addEventListener("keydown", event => moveRovingFocus(activityBar, "button", event, true));
editorTabs?.addEventListener("keydown", event => moveRovingFocus(editorTabs, '[role="tab"]', event, true));

window.bluePet.onLspEvent(event => {
  if (event.type === "ready") setLspState(`Language server: ${event.serverId} ready`, true);
  if (event.type === "error") setLspState(`Language server: ${event.message}`);
  if (event.type === "log" && bottomPanel && !bottomPanel.hidden) setWorkbenchOutput(`[${event.serverId}] ${event.data}`);
  if (event.type === "diagnostics") {
    const activePath = String(activeFileEditorSession?.path || "").replace(/\\/g, "/").toLowerCase();
    const diagnosticPath = String(event.filePath || "").replace(/\\/g, "/").toLowerCase();
    if (monacoModel && activePath && diagnosticPath.endsWith(activePath)) {
      const severity = { 1: window.monaco.MarkerSeverity.Error, 2: window.monaco.MarkerSeverity.Warning, 3: window.monaco.MarkerSeverity.Info, 4: window.monaco.MarkerSeverity.Hint };
      window.monaco.editor.setModelMarkers(monacoModel, `blue-${event.serverId}`, event.diagnostics.map(item => ({ startLineNumber: item.range.start.line + 1, startColumn: item.range.start.character + 1, endLineNumber: item.range.end.line + 1, endColumn: item.range.end.character + 1, message: item.message, severity: severity[item.severity] || window.monaco.MarkerSeverity.Info, code: item.code })));
      setLspState(`Language server: ${event.serverId} | ${event.diagnostics.length} diagnostics`, true);
    }
  }
});

initializeTerminalWorkbench().catch(error => setWorkbenchOutput(`Terminal initialization failed: ${error.message}`));

// Phase 7: Debug Adapter Protocol workbench for Python and Node.
let activeDebugSessionId = null;
let activeDebugFrameId = null;
function debugArguments() { return String(document.querySelector("#debugArgs")?.value || "").match(/(?:[^\s"]+|"[^"]*")+/g)?.map(value => value.replace(/^"|"$/g, "")) || []; }
function debugBreakpointList() { return String(document.querySelector("#debugBreakpoints")?.value || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(value => { const match = value.match(/^(\d+)(?:\s*:\s*(.+))?$/); return match ? { line: Number(match[1]), condition: match[2] || "" } : null; }).filter(Boolean); }
function appendDebugConsole(value) { const output = document.querySelector("#debugConsole"); if (!output) return; output.textContent = `${output.textContent}${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`.slice(-60000); output.scrollTop = output.scrollHeight; }
function setDebugControls(active, stopped = false) { for (const id of ["debugStop", "debugPause", "debugApplyBreakpoints"]) document.querySelector(`#${id}`).disabled = !active; for (const id of ["debugContinue", "debugStepOver", "debugStepInto", "debugStepOut", "debugWatch", "debugEvaluate"]) document.querySelector(`#${id}`).disabled = !stopped; }
async function refreshDebugVariables() { if (!activeDebugSessionId || !activeDebugFrameId) return; const scopeResult = await window.bluePet.debugCommand({ sessionId: activeDebugSessionId, command: "scopes", args: { frameId: activeDebugFrameId } }); const root = document.querySelector("#debugVariables"); root.replaceChildren(); for (const scope of scopeResult.scopes || []) { const heading = document.createElement("strong"); heading.textContent = scope.name; root.append(heading); const result = await window.bluePet.debugCommand({ sessionId: activeDebugSessionId, command: "variables", args: { variablesReference: scope.variablesReference } }); for (const variable of result.variables || []) { const row = document.createElement("div"); row.className = "debug-variable-row"; row.textContent = `${variable.name}: ${variable.value}`; root.append(row); } } }
async function refreshDebugStack() { if (!activeDebugSessionId) return; const stack = await window.bluePet.debugCommand({ sessionId: activeDebugSessionId, command: "stackTrace", args: { startFrame: 0, levels: 100 } }); const root = document.querySelector("#debugCallStack"); const frames = stack.stackFrames || []; activeDebugFrameId = frames[0]?.id || null; root.replaceChildren(); for (const frame of frames) { const button = document.createElement("button"); button.className = "debug-tree-row"; button.textContent = `${frame.name} — ${frame.source?.name || "unknown"}:${frame.line}`; button.onclick = async () => { activeDebugFrameId = frame.id; if (frame.source?.path) await openWorkspaceFile(frame.source.path, { pinned: true }); await refreshDebugVariables(); }; root.append(button); } if (!frames.length) root.textContent = "No stack frames."; await refreshDebugVariables(); }
async function runDebugCommand(command) { if (!activeDebugSessionId) return; await window.bluePet.debugCommand({ sessionId: activeDebugSessionId, command }); appendDebugConsole(`${command} requested.`); }
document.querySelector("#debugRequest")?.addEventListener("change", event => { const attach = event.target.value === "attach"; document.querySelector("#debugAttachUrl").disabled = !attach; document.querySelector("#debugProgram").disabled = attach; });
document.querySelector("#debugStart")?.addEventListener("click", async () => { try { const program = document.querySelector("#debugProgram").value || activeFileEditorSession?.path || ""; const result = await window.bluePet.debugStart({ runtime: document.querySelector("#debugRuntime").value, request: document.querySelector("#debugRequest").value, program, cwd: document.querySelector("#debugCwd").value || ".", args: debugArguments(), webSocketUrl: document.querySelector("#debugAttachUrl").value, stopOnEntry: true, breakpoints: program ? { [program]: debugBreakpointList() } : {} }); activeDebugSessionId = result.id; document.querySelector("#debugStatus").textContent = `${result.runtime} session ${result.id}: ${result.state}`; setDebugControls(true, result.state === "stopped"); appendDebugConsole(`Started ${result.runtime} debug session.`); } catch (error) { appendDebugConsole(`Start failed: ${error.message}`); } });
document.querySelector("#debugStop")?.addEventListener("click", async () => { if (!activeDebugSessionId) return; await window.bluePet.debugStop(activeDebugSessionId); appendDebugConsole("Debug session stopped."); activeDebugSessionId = null; activeDebugFrameId = null; setDebugControls(false); });
document.querySelector("#debugContinue")?.addEventListener("click", () => runDebugCommand("continue").catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugPause")?.addEventListener("click", () => runDebugCommand("pause").catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugStepOver")?.addEventListener("click", () => runDebugCommand("next").catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugStepInto")?.addEventListener("click", () => runDebugCommand("stepIn").catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugStepOut")?.addEventListener("click", () => runDebugCommand("stepOut").catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugApplyBreakpoints")?.addEventListener("click", async () => { if (!activeDebugSessionId) return; const source = document.querySelector("#debugProgram").value || activeFileEditorSession?.path; appendDebugConsole({ breakpoints: await window.bluePet.debugBreakpoints({ sessionId: activeDebugSessionId, source, breakpoints: debugBreakpointList() }) }); });
async function evaluateDebug(expression) { if (!activeDebugSessionId || !activeDebugFrameId || !expression.trim()) return; const result = await window.bluePet.debugCommand({ sessionId: activeDebugSessionId, command: "evaluate", args: { expression, frameId: activeDebugFrameId, context: "repl" } }); appendDebugConsole(`${expression} = ${result.result}`); }
document.querySelector("#debugWatch")?.addEventListener("click", () => evaluateDebug(document.querySelector("#debugWatchExpression").value).catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugEvaluate")?.addEventListener("click", () => evaluateDebug(document.querySelector("#debugConsoleInput").value).catch(error => appendDebugConsole(error.message)));
document.querySelector("#debugConsoleInput")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); document.querySelector("#debugEvaluate").click(); } });
document.querySelector("#debugProfileSave")?.addEventListener("click", async () => { try { const value = await window.bluePet.debugProfileSave({ name: document.querySelector("#debugProfileName").value, runtime: document.querySelector("#debugRuntime").value, request: document.querySelector("#debugRequest").value, program: document.querySelector("#debugProgram").value || activeFileEditorSession?.path, cwd: document.querySelector("#debugCwd").value || ".", args: debugArguments(), webSocketUrl: document.querySelector("#debugAttachUrl").value }); appendDebugConsole(`Saved launch profile ${value.name}.`); } catch (error) { appendDebugConsole(error.message); } });
window.bluePet.onDebugEvent?.(event => { if (event.sessionId !== activeDebugSessionId) return; if (event.event === "output") appendDebugConsole(event.body?.output || ""); if (event.event === "stopped") { document.querySelector("#debugStatus").textContent = `Paused: ${event.body?.reason || "breakpoint"}`; setDebugControls(true, true); refreshDebugStack().catch(error => appendDebugConsole(error.message)); } if (event.event === "continued") { document.querySelector("#debugStatus").textContent = "Running"; setDebugControls(true, false); } if (["terminated", "exited", "adapterExit"].includes(event.event)) { document.querySelector("#debugStatus").textContent = "Debug session ended"; setDebugControls(false); } });

// Phase 8: Test Explorer. Tests are workbench objects with source navigation,
// history, output, and debugger handoff rather than terminal-only commands.
let discoveredTestTree = { files: [], count: 0 };
let selectedTestItem = null;
function testStateClass(status) { return ["passed", "failed"].includes(status) ? status : ""; }
function updateTestButtons() {
  document.querySelector("#testRunFile").disabled = !selectedTestItem?.file;
  document.querySelector("#testRunSelected").disabled = selectedTestItem?.type !== "test";
  document.querySelector("#testDebugSelected").disabled = selectedTestItem?.type !== "test";
}
function selectTestItem(item, button) {
  selectedTestItem = item;
  document.querySelectorAll(".test-tree-row.selected").forEach(row => row.classList.remove("selected"));
  button?.classList.add("selected");
  updateTestButtons();
}
function renderTestExplorer(tree) {
  discoveredTestTree = tree;
  const root = document.querySelector("#testExplorer");
  root.replaceChildren();
  for (const file of tree.files || []) {
    const fileButton = document.createElement("button");
    fileButton.className = "test-tree-row file";
    fileButton.innerHTML = `<span class="test-state"></span><span>${escapeHtml(file.label)}</span><small>${file.children.length}</small>`;
    fileButton.onclick = () => selectTestItem(file, fileButton);
    root.append(fileButton);
    for (const item of file.children) {
      const button = document.createElement("button");
      button.className = "test-tree-row test";
      button.innerHTML = `<span class="test-state"></span><span>${escapeHtml(item.label)}</span><small>:${item.line}</small>`;
      button.onclick = () => selectTestItem(item, button);
      button.ondblclick = () => openWorkspaceFile(item.file, { pinned: true, line: item.line });
      root.append(button);
    }
  }
  if (!tree.count) root.textContent = "No Node or Python tests discovered.";
  document.querySelector("#testSummary").textContent = `${tree.count || 0} tests in ${(tree.files || []).length} files`;
  selectedTestItem = null;
  updateTestButtons();
}
function renderTestRun(run) {
  const root = document.querySelector("#testResults");
  root.replaceChildren();
  for (const result of run.results || []) {
    const button = document.createElement("button");
    button.className = "test-result-row";
    button.innerHTML = `<span class="test-state ${testStateClass(result.status)}"></span><span>${escapeHtml(result.label)}</span><small>${result.status} · ${result.durationMs} ms</small>`;
    button.onclick = () => openWorkspaceFile(result.file, { pinned: true, line: result.line });
    root.append(button);
  }
  document.querySelector("#testOutput").textContent = run.output || `${run.state}: no output`;
  document.querySelector("#testSummary").textContent = `${run.state.toUpperCase()} · ${(run.results || []).length} tests`;
}
async function refreshTestHistory() {
  const history = await window.bluePet.testHistory();
  const root = document.querySelector("#testHistory");
  root.replaceChildren();
  for (const run of history) {
    const button = document.createElement("button");
    button.className = "test-history-row";
    button.innerHTML = `<span class="test-state ${testStateClass(run.state)}"></span><span>${escapeHtml(run.mode)} · ${new Date(run.startedAt).toLocaleString()}</span>`;
    button.onclick = () => renderTestRun(run);
    root.append(button);
  }
  if (!history.length) root.textContent = "No test runs yet.";
}
async function discoverWorkspaceTests() {
  document.querySelector("#testSummary").textContent = "Discovering tests…";
  renderTestExplorer(await window.bluePet.testDiscover());
  await refreshTestHistory();
}
async function runWorkspaceTests(value) {
  document.querySelector("#testOutput").textContent = "Running tests…";
  const run = await window.bluePet.testRun(value);
  renderTestRun(run);
  await refreshTestHistory();
}
document.querySelector("#testDiscover")?.addEventListener("click", () => discoverWorkspaceTests().catch(error => { document.querySelector("#testOutput").textContent = error.message; }));
document.querySelector("#testRunAll")?.addEventListener("click", () => runWorkspaceTests({ mode: "all" }).catch(error => { document.querySelector("#testOutput").textContent = error.message; }));
document.querySelector("#testRunFile")?.addEventListener("click", () => runWorkspaceTests({ mode: "file", file: selectedTestItem.file }).catch(error => { document.querySelector("#testOutput").textContent = error.message; }));
document.querySelector("#testRunSelected")?.addEventListener("click", () => runWorkspaceTests({ mode: "test", testId: selectedTestItem.id }).catch(error => { document.querySelector("#testOutput").textContent = error.message; }));
document.querySelector("#testDebugSelected")?.addEventListener("click", async () => { try { const result = await window.bluePet.testDebug(selectedTestItem.id); activeDebugSessionId = result.id; selectTab("run", "debugger"); document.querySelector("#debugStatus").textContent = `Debugging ${selectedTestItem.label}`; } catch (error) { document.querySelector("#testOutput").textContent = error.message; } });
window.bluePet.onTestEvent?.(event => { if (event.event === "output") { const output = document.querySelector("#testOutput"); output.textContent = `${output.textContent}${event.output}`.slice(-250000); output.scrollTop = output.scrollHeight; } });

// Phase 9: approval-gated extension registry and isolated extension host.
let extensionSnapshot = { extensions: [], contributions: {} };
let selectedExtensionId = null;
function extensionOutput(value) { const output = document.querySelector("#extensionOutput"); if (output) output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function registerRuntimeExtensionContributions(contributions) {
  const extensionEditors = shell.editors.extensions;
  const extensionSidebar = shell.sidebarItems.extensions;
  for (const view of contributions.views || []) {
    const label = view.title || view.id;
    if (!extensionSidebar.includes(label)) extensionSidebar.push(label);
  }
  for (const editor of contributions.editors || []) {
    if (!extensionEditors.some(item => item.id === editor.id)) extensionEditors.push({ id: editor.id, title: editor.title || editor.id, closable: true, extensionId: editor.extensionId });
    if (!document.querySelector(`[data-panel="extensions"][data-editor="${CSS.escape(editor.id)}"]`)) {
      const section = document.createElement("section");
      section.dataset.panel = "extensions"; section.dataset.editor = editor.id; section.hidden = true;
      section.className = "extension-custom-editor";
      section.innerHTML = `<p class="eyebrow">Extension editor</p><h2>${escapeHtml(editor.title || editor.id)}</h2><p class="hint">Contributed by ${escapeHtml(editor.extensionId)} for ${escapeHtml(editor.selector || "custom content")}.</p><pre>Extension editors run through Blue's isolated extension host and shared workbench shell.</pre>`;
      document.querySelector(".editor-surface")?.append(section);
    }
  }
  if (layoutState.activity === "extensions") { renderSidebar(); renderEditorTabs(); }
}
function renderExtensionWorkbench(snapshot) {
  extensionSnapshot = snapshot;
  registerRuntimeExtensionContributions(snapshot.contributions || {});
  const list = document.querySelector("#extensionList");
  list.replaceChildren();
  for (const item of snapshot.extensions || []) {
    const button = document.createElement("button");
    button.className = `extension-row${item.id === selectedExtensionId ? " selected" : ""}`;
    button.innerHTML = `<span><strong>${escapeHtml(item.name || item.id)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.version || "invalid")}</small></span><span class="extension-state">${item.invalid ? "Invalid" : item.active ? "Active" : item.enabled ? "Enabled" : "Disabled"}</span>`;
    button.onclick = () => { selectedExtensionId = item.id; renderExtensionWorkbench(snapshot); };
    list.append(button);
  }
  if (!snapshot.extensions?.length) list.textContent = "No extensions installed.";
  const selected = snapshot.extensions?.find(item => item.id === selectedExtensionId);
  document.querySelector("#extensionDetails").innerHTML = selected ? `<h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.id)} · ${escapeHtml(selected.version)}</p><p class="hint">${escapeHtml(selected.compatibilityMessage || selected.error || "Installed")}</p><p>Permissions: ${escapeHtml((selected.permissions || []).join(", ") || "none")}</p>` : `<h3>Select an extension</h3><p class="hint">Manifests contribute commands, sidebar views, custom editors, languages, and settings.</p>`;
  for (const id of ["extensionEnable", "extensionActivate", "extensionDeactivate", "extensionUninstall"]) document.querySelector(`#${id}`).disabled = !selected;
  const select = document.querySelector("#extensionCommandSelect"); select.replaceChildren(new Option("Choose a command", ""));
  for (const command of snapshot.contributions?.commands || []) select.append(new Option(`${command.title || command.command} — ${command.extensionId}`, command.command));
  document.querySelector("#extensionRunCommand").disabled = !select.value;
  const contributionRoot = document.querySelector("#extensionContributions"); contributionRoot.replaceChildren();
  for (const [kind, values] of Object.entries(snapshot.contributions || {})) for (const value of values) { const row = document.createElement("button"); row.className = "extension-contribution"; row.textContent = `${kind.slice(0, -1)} · ${value.title || value.id || value.command || value.key}`; row.title = `Contributed by ${value.extensionId}`; row.onclick = () => kind === "editors" ? selectTab("extensions", value.id) : extensionOutput(value); contributionRoot.append(row); }
  if (!contributionRoot.children.length) contributionRoot.textContent = "No enabled contributions.";
}
async function refreshExtensions() { const snapshot = await window.bluePet.extensionList(); if (selectedExtensionId && !snapshot.extensions.some(item => item.id === selectedExtensionId)) selectedExtensionId = null; renderExtensionWorkbench(snapshot); return snapshot; }
async function installExtension(source) { const result = await window.bluePet.extensionInstall({ source, approved: document.querySelector("#extensionApproval").checked }); selectedExtensionId = result.id; extensionOutput(`Installed ${result.name} ${result.version}.`); await refreshExtensions(); }
document.querySelector("#extensionRefresh")?.addEventListener("click", () => refreshExtensions().catch(error => extensionOutput(error.message)));
document.querySelector("#extensionInstallSample")?.addEventListener("click", () => installExtension("$bundled-sample").catch(error => extensionOutput(error.message)));
document.querySelector("#extensionInstall")?.addEventListener("click", () => installExtension(document.querySelector("#extensionSource").value).catch(error => extensionOutput(error.message)));
document.querySelector("#extensionEnable")?.addEventListener("click", async () => { const selected = extensionSnapshot.extensions.find(item => item.id === selectedExtensionId); try { await window.bluePet.extensionEnable({ id: selected.id, enabled: !selected.enabled }); await refreshExtensions(); } catch (error) { extensionOutput(error.message); } });
document.querySelector("#extensionActivate")?.addEventListener("click", async () => { try { extensionOutput(await window.bluePet.extensionActivate({ id: selectedExtensionId, event: "onManual" })); await refreshExtensions(); } catch (error) { extensionOutput(error.message); } });
document.querySelector("#extensionDeactivate")?.addEventListener("click", async () => { try { await window.bluePet.extensionDeactivate(selectedExtensionId); await refreshExtensions(); } catch (error) { extensionOutput(error.message); } });
document.querySelector("#extensionUninstall")?.addEventListener("click", async () => { try { await window.bluePet.extensionUninstall({ id: selectedExtensionId, approved: document.querySelector("#extensionApproval").checked }); selectedExtensionId = null; await refreshExtensions(); } catch (error) { extensionOutput(error.message); } });
document.querySelector("#extensionCommandSelect")?.addEventListener("change", event => { document.querySelector("#extensionRunCommand").disabled = !event.target.value; });
document.querySelector("#extensionRunCommand")?.addEventListener("click", async () => { try { const raw = document.querySelector("#extensionCommandArgs").value.trim(); extensionOutput(await window.bluePet.extensionCommand({ command: document.querySelector("#extensionCommandSelect").value, args: raw ? JSON.parse(raw) : {} })); await refreshExtensions(); } catch (error) { extensionOutput(error.message); } });
window.bluePet.onExtensionEvent?.(event => extensionOutput(event));
