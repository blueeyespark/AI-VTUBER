$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\main.cjs"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

if ($text -notmatch 'let petManuallyHidden = false;') {
  $text = $text.Replace(
    "let controlRecoveryAttempts = [];",
    "let controlRecoveryAttempts = [];`r`nlet petManuallyHidden = false;`r`nlet controlManuallyHidden = false;"
  )
}

$old = @'
  controlWindow.on("close", event => {
    if (!quitting) {
      quitting = true;
      app.quit();
    }
  });
'@
$new = @'
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
if ($text.Contains($old)) {
  $text = $text.Replace($old, $new)
}

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Output "Sticky close/minimize missing pieces added."
