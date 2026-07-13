$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\main.cjs"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$replacement = @'
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
$pattern = '  controlWindow\.on\("close", event => \{\s*if \(!quitting\) \{\s*quitting = true;\s*app\.quit\(\);\s*\}\s*\}\);'
$text = [regex]::Replace($text, $pattern, $replacement, 1)
[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Output "Control close handler replaced with sticky hide."
