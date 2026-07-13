$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\index.html"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$text = $text.Replace('data-tab="system" data-icon="âš™"', 'data-tab="system" data-icon="*"')
[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Output "Sync/System icon encoding fixed."
