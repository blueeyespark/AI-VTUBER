$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\main.cjs"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

if ($text -notmatch 'petManuallyHidden') {
  $text = $text.Replace(
    "let voiceHotkeyRegistered = false;",
    "let voiceHotkeyRegistered = false;`r`nlet petManuallyHidden = false;`r`nlet controlManuallyHidden = false;"
  )
}

$text = $text.Replace(
  "if (quitting || petRecoveryTimer) return;",
  "if (quitting || petRecoveryTimer || petManuallyHidden) return;"
)
$text = $text.Replace(
  "if (quitting || controlRecoveryTimer) return;",
  "if (quitting || controlRecoveryTimer || controlManuallyHidden) return;"
)

if ($text -notmatch 'function createPetWindow\(\) \{\s*petManuallyHidden = false;') {
  $text = $text.Replace(
    "function createPetWindow() {",
    "function createPetWindow() {`r`n  petManuallyHidden = false;"
  )
}

if ($text -notmatch 'petWindow\.on\("close", event =>') {
  $text = $text.Replace(
    "  petWindow.on(`"closed`", () => {`r`n    petWindow = null;`r`n  });",
    "  petWindow.on(`"closed`", () => {`r`n    petWindow = null;`r`n  });`r`n  petWindow.on(`"close`", event => {`r`n    if (quitting) return;`r`n    event.preventDefault();`r`n    petManuallyHidden = true;`r`n    petWindow.hide();`r`n  });"
  )
}

if ($text -notmatch 'function createControlWindow\(\) \{\s*controlManuallyHidden = false;') {
  $text = $text.Replace(
    "function createControlWindow() {",
    "function createControlWindow() {`r`n  controlManuallyHidden = false;"
  )
}

$oldControlClose = @'
  controlWindow.on("close", event => {
    if (!quitting) {
      quitting = true;
      app.quit();
    }
  });
'@
$newControlClose = @'
  controlWindow.on("close", event => {
    if (quitting) return;
    event.preventDefault();
    controlManuallyHidden = true;
    controlWindow.hide();
  });
  controlWindow.on("closed", () => {
    controlWindow = null;
  });
'@
$text = $text.Replace($oldControlClose, $newControlClose)

if ($text -notmatch 'function showControl\(\) \{\s*controlManuallyHidden = false;') {
  $text = $text.Replace(
    "function showControl() {",
    "function showControl() {`r`n  controlManuallyHidden = false;"
  )
}

if ($text -notmatch 'function showPetWindow\(\)') {
  $text = $text.Replace(
    "function createTray() {",
    "function showPetWindow() {`r`n  petManuallyHidden = false;`r`n  if (!petWindow || petWindow.isDestroyed()) createPetWindow();`r`n  else petWindow.show();`r`n}`r`n`r`nfunction createTray() {"
  )
}

$text = $text.Replace(
  "        if (!petWindow || petWindow.isDestroyed()) createPetWindow();`r`n        else petWindow.show();",
  "        showPetWindow();"
)
$text = $text.Replace(
  "  trustedOn(`"pet:show`", () => {`r`n    if (!petWindow || petWindow.isDestroyed()) createPetWindow();`r`n    else petWindow.show();`r`n  });",
  "  trustedOn(`"pet:show`", () => {`r`n    showPetWindow();`r`n  });"
)
$text = $text.Replace(
  "  trustedOn(`"control:hide`", () => controlWindow?.hide());",
  "  trustedOn(`"control:hide`", () => {`r`n    controlManuallyHidden = true;`r`n    controlWindow?.hide();`r`n  });"
)

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Output "Sticky close/minimize behavior patched."
