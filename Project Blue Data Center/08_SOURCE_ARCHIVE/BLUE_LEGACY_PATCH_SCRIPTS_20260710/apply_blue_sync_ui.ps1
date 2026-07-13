$ErrorActionPreference = "Stop"

$repo = "C:\Users\adahn\Downloads\ai blue project"
$desktop = Join-Path $repo "Project Blue App\desktop_pet"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-Text($path) {
  [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Text($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

$indexPath = Join-Path $desktop "index.html"
$index = Read-Text $indexPath
if ($index -notmatch 'Shared upgrade sync') {
  $index = $index.Replace(
    '        <option value="System health"></option>',
    "        <option value=`"System health`"></option>`r`n        <option value=`"Shared upgrade sync`"></option>"
  )
}
if ($index -notmatch 'data-tab="sync"') {
  $index = [regex]::Replace(
    $index,
    '(?m)^(\s*)<button data-tab="system" data-icon="[^"]+">System</button>',
    '$1<button data-tab="sync" data-icon="S">Sync</button>' + "`r`n" + '$1<button data-tab="system" data-icon="⚙">System</button>',
    1
  )
}
$index = [regex]::Replace($index, 'Ctrl\+1.{0,8}8 switches views', 'Ctrl+1-9 switches views', 1)
if ($index -notmatch 'data-panel="sync"') {
  $syncSection = @'
    <section data-panel="sync" hidden>
      <h2>Shared Upgrade Sync</h2>
      <p class="hint">For two PCs on the same project, Blue uses the shared GitHub repository as the source of truth. If your roommate pushes a committed upgrade, you can check, back up, and pull it. If you push a committed upgrade, they can pull it. Direct Wi-Fi file overwrites stay disabled.</p>
      <p class="hint">One Blue mode in this build means both installs share one repo identity and version state. Live LAN memory merging needs a paired, signed protocol before Blue treats two running apps as one mind.</p>
      <div class="security-summary">
        <span id="syncState" class="status-chip">Sync: not checked</span>
        <span id="syncBranch" class="status-chip">Branch: unknown</span>
        <span id="syncAheadBehind" class="status-chip">Ahead/behind: unknown</span>
      </div>
      <div class="grid">
        <button id="syncStatus">Local Status</button>
        <button id="syncCheck">Check GitHub</button>
        <button id="syncBackup">Backup Blue Data</button>
        <button id="syncPull">Pull Roommate Upgrades</button>
        <button id="syncPush">Publish My Commits</button>
      </div>
      <pre id="syncDetails">Choose Check GitHub to see whether this PC, your roommate's PC, and origin/main match.</pre>
      <p class="hint">Pull uses fast-forward only. If both PCs changed Blue differently, Blue will stop and tell you to merge manually instead of corrupting either version.</p>
      <p class="hint">Publish only pushes commits you already made; Blue will not auto-commit secrets, tokens, databases, or unfinished work.</p>
    </section>
'@
  $index = $index.Replace('    <section data-panel="system" hidden>', $syncSection + "`r`n    <section data-panel=`"system`" hidden>")
}
if ($index -notmatch 'id="footerSync"') {
  $index = $index.Replace(
    '    <span id="footerSecurity">Security: not scanned</span>',
    "    <span id=`"footerSecurity`">Security: not scanned</span>`r`n    <span id=`"footerSync`">Sync: not checked</span>"
  )
}
Write-Text $indexPath $index

$controlPath = Join-Path $desktop "control.js"
$control = Read-Text $controlPath
if ($control -notmatch 'footerSync') {
  $control = $control.Replace(
    'const footerSecurity = document.querySelector("#footerSecurity");',
    "const footerSecurity = document.querySelector(`"#footerSecurity`");`r`nconst footerSync = document.querySelector(`"#footerSync`");"
  )
}
$control = $control.Replace(
  '"chat", "presence", "create", "expansion", "motion", "discord", "security", "system"',
  '"chat", "presence", "create", "expansion", "motion", "discord", "security", "sync", "system"'
)
if ($control -notmatch 'roommate", "pull", "push"') {
  $control = $control.Replace(
    '  { terms: ["security", "defender", "firewall", "virus"], run: () => selectTab("security") },',
    "  { terms: [`"security`", `"defender`", `"firewall`", `"virus`"], run: () => selectTab(`"security`") },`r`n  { terms: [`"sync`", `"upgrade`", `"github`", `"roommate`", `"pull`", `"push`"], run: () => selectTab(`"sync`") },"
  )
}
$control = $control.Replace('Try Chat, Motion, Security, or System.', 'Try Chat, Motion, Sync, Security, or System.')
$control = $control.Replace('^[1-8]$', '^[1-9]$')
if ($control -notmatch 'function renderSyncStatus') {
  $syncJs = @'
const syncDetails = document.querySelector("#syncDetails");
const syncState = document.querySelector("#syncState");
const syncBranch = document.querySelector("#syncBranch");
const syncAheadBehind = document.querySelector("#syncAheadBehind");
function syncChipClass(state) {
  if (["synced", "already-current", "published", "pulled"].includes(state)) return "status-chip safe";
  if (["behind-roommate", "ahead-of-roommate"].includes(state)) return "status-chip attention";
  return "status-chip";
}
function statusFromSyncResult(value) {
  return value?.after?.status || value?.before?.status || value?.status || {};
}
function formatSyncStatus(value) {
  if (!value || typeof value !== "object") return String(value || "Sync status unavailable.");
  const status = statusFromSyncResult(value);
  const state = value.state || value?.after?.state || value?.before?.state || "unknown";
  const backup = value.backup;
  return [
    `State: ${state}`,
    `Summary: ${value.summary || value?.after?.summary || value?.before?.summary || ""}`,
    `This PC: ${value.host || value?.after?.host || value?.before?.host || "unknown"}`,
    `Desktop version: ${value.desktopVersion || value?.after?.desktopVersion || value?.before?.desktopVersion || "unknown"}`,
    `Shared source: ${value.sharedSource || value?.after?.sharedSource || value?.before?.sharedSource || "GitHub origin"}`,
    `One Blue mode: shared repo identity first; paired LAN memory merge is not enabled yet`,
    `Wi-Fi mode: ${value.sameWifiMode || value?.after?.sameWifiMode || value?.before?.sameWifiMode || "repo sync"}`,
    `Branch: ${status.branch || "unknown"} -> ${status.upstream || "no upstream"}`,
    `Ahead: ${status.ahead ?? "?"}; Behind: ${status.behind ?? "?"}`,
    `Working tree: ${status.clean ? "clean" : "has local uncommitted edits"}`,
    `Local commit: ${status.headShort || status.head || "unknown"}`,
    `Remote commit: ${status.upstreamHeadShort || status.upstreamHead || "unknown"}`,
    `Latest local commit: ${status.latestCommit || "unknown"}`,
    `Remote URL: ${status.remoteUrl || "unknown"}`,
    backup ? "" : null,
    backup ? `Backup: ${backup.backupRoot}` : null,
    value.output ? "" : null,
    value.output ? `Git output:\n${value.output}` : null,
    value.restartRequired ? "" : null,
    value.restartRequired ? "Restart Blue after this pull so the upgraded files are loaded." : null,
    "",
    "Rules:",
    ...(value.safeRules || value?.after?.safeRules || value?.before?.safeRules || [])
      .map(rule => `- ${rule}`)
  ].filter(line => line !== null && line !== undefined).join("\n");
}
function renderSyncStatus(value) {
  const status = statusFromSyncResult(value);
  const state = value?.state || value?.after?.state || value?.before?.state || "unknown";
  syncState.textContent = `Sync: ${state}`;
  syncState.className = syncChipClass(state);
  syncBranch.textContent = `Branch: ${status.branch || "unknown"}`;
  syncAheadBehind.textContent = `Ahead ${status.ahead ?? "?"} / behind ${status.behind ?? "?"}`;
  syncDetails.textContent = formatSyncStatus(value);
  footerSync.textContent = `Sync: ${state}`;
}
async function syncAction(buttonId, label, action, confirmText = "") {
  const button = document.querySelector(buttonId);
  if (confirmText && !confirm(confirmText)) return;
  button.disabled = true;
  button.textContent = `${label}...`;
  try {
    renderSyncStatus(await action());
  } catch (error) {
    syncDetails.textContent = `Shared sync failed: ${error.message}`;
    footerSync.textContent = "Sync: needs review";
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
document.querySelector("#syncStatus").onclick = () =>
  syncAction("#syncStatus", "Local Status", window.bluePet.syncStatus);
document.querySelector("#syncCheck").onclick = () =>
  syncAction("#syncCheck", "Check GitHub", window.bluePet.syncCheck);
document.querySelector("#syncBackup").onclick = () =>
  syncAction("#syncBackup", "Backup Blue Data", window.bluePet.syncBackup);
document.querySelector("#syncPull").onclick = () =>
  syncAction("#syncPull", "Pull Roommate Upgrades", window.bluePet.syncPull,
    "Back up local Blue data and pull your roommate's committed upgrades from GitHub?");
document.querySelector("#syncPush").onclick = () =>
  syncAction("#syncPush", "Publish My Commits", window.bluePet.syncPush,
    "Publish this PC's committed Blue upgrades to GitHub so your roommate can pull them?");
'@
  $control = $control.Replace(
    'document.querySelector("#openProject").onclick = () => perform(window.bluePet.openProject, false);',
    'document.querySelector("#openProject").onclick = () => perform(window.bluePet.openProject, false);' + "`r`n" + $syncJs
  )
}
if ($control -notmatch 'window.bluePet.syncStatus') {
  $control = $control.Replace(
    "window.bluePet.ensureSession()`r`n  .then(refreshConversations)`r`n  .catch(error => append(`"blue`", error.message));",
    "window.bluePet.ensureSession()`r`n  .then(refreshConversations)`r`n  .catch(error => append(`"blue`", error.message));`r`nwindow.bluePet.syncStatus().then(renderSyncStatus)`r`n  .catch(error => { syncDetails.textContent = error.message; });"
  )
}
Write-Text $controlPath $control

$readmePath = Join-Path $repo "README.md"
$readme = Read-Text $readmePath
if ($readme -notmatch 'Shared upgrade sync') {
  $readme = $readme.Replace("# Project Blue`r`n`r`n", @"
# Project Blue

## Shared upgrade sync

Blue includes a safe GitHub-backed sync path for two PCs working on different versions. Open **Control Center -> Sync** to check whether this PC is ahead, behind, synced, or diverged from `origin/main`. Pulls create a local Blue data backup first and use fast-forward-only Git pulls so roommate conflicts stop for review instead of overwriting files.

Use the shared repository as the source of truth: when one person commits and pushes an upgrade, the other person clicks **Check GitHub** and **Pull Roommate Upgrades**. Direct Wi-Fi file overwrites are disabled until a paired, signed LAN protocol is built. In this build, "one Blue" means one shared repo identity/version state, not live unsupervised memory merging.

"@)
}
Write-Text $readmePath $readme

Write-Output "Shared sync UI patch applied."
