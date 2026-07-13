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

$controlPath = Join-Path $desktop "control.js"
$control = Read-Text $controlPath
if ($control -notmatch 'syncStatus\(\)\.then\(renderSyncStatus\)') {
  $needle = "window.bluePet.ensureSession()`r`n  .then(refreshConversations)`r`n  .catch(error => append(`"blue`", error.message));"
  if ($control.Contains($needle)) {
    $control = $control.Replace(
      $needle,
      "$needle`r`nwindow.bluePet.syncStatus().then(renderSyncStatus)`r`n  .catch(error => { syncDetails.textContent = error.message; });"
    )
  } else {
    $control = $control.Replace(
      'window.bluePet.discordConfig().then(fillDiscordConfig)',
      "window.bluePet.syncStatus().then(renderSyncStatus)`r`n  .catch(error => { syncDetails.textContent = error.message; });`r`nwindow.bluePet.discordConfig().then(fillDiscordConfig)"
    )
  }
  Write-Text $controlPath $control
}

$readmePath = Join-Path $repo "README.md"
$readme = Read-Text $readmePath
if ($readme -notmatch 'Shared upgrade sync') {
  $section = @'
# Project Blue

## Shared upgrade sync

Blue includes a safe GitHub-backed sync path for two PCs working on different versions. Open **Control Center -> Sync** to check whether this PC is ahead, behind, synced, or diverged from `origin/main`. Pulls create a local Blue data backup first and use fast-forward-only Git pulls so roommate conflicts stop for review instead of overwriting files.

Use the shared repository as the source of truth: when one person commits and pushes an upgrade, the other person clicks **Check GitHub** and **Pull Roommate Upgrades**. Direct Wi-Fi file overwrites are disabled until a paired, signed LAN protocol is built. In this build, "one Blue" means one shared repo identity/version state, not live unsupervised memory merging.

'@
  $readme = [regex]::Replace($readme, '^# Project Blue\s*', $section, 1)
  Write-Text $readmePath $readme
}

Write-Output "Shared sync startup load and README docs finished."
