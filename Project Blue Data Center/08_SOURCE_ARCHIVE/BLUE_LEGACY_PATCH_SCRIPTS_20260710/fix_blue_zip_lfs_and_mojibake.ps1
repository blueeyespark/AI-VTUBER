$ErrorActionPreference = "Stop"

$root = "C:\Users\adahn\Downloads\AI-VTUBER-main\AI-VTUBER-main"
$desktop = Join-Path $root "Project Blue App\desktop_pet"
$appRoot = Join-Path $root "Project Blue App"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-Text($path) {
  [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Text($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

$indexPath = Join-Path $desktop "index.html"
$index = Read-Text $indexPath
$index = [regex]::Replace($index, '<span aria-hidden="true">.*?</span>', '<span aria-hidden="true">Search</span>', 1)
$index = [regex]::Replace($index, 'placeholder="Search controls or type a command[^"]* \(Ctrl\+K\)"', 'placeholder="Search controls or type a command... (Ctrl+K)"', 1)
$index = [regex]::Replace($index, '(<button data-tab="chat" data-icon=")[^"]*(" aria-selected="true">Chat</button>)', '$1C$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="presence" data-icon=")[^"]*(">Presence</button>)', '$1P$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="create" data-icon=")[^"]*(">Create</button>)', '$1Create$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="expansion" data-icon=")[^"]*(">Expansion</button>)', '$1E$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="motion" data-icon=")[^"]*(">Motion</button>)', '$1M$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="discord" data-icon=")[^"]*(">Discord</button>)', '$1D$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="security" data-icon=")[^"]*(">Security</button>)', '$1S$2', 1)
$index = [regex]::Replace($index, '(<button data-tab="system" data-icon=")[^"]*(">System</button>)', '$1Sys$2', 1)
$index = [regex]::Replace($index, 'Loading expansion foundations[^<]*</pre>', 'Loading expansion foundations...</pre>', 1)
Write-Text $indexPath $index

$mainPath = Join-Path $desktop "main.cjs"
$main = Read-Text $mainPath
if ($main -notmatch 'function isMissingGitLfsPointer') {
  $insert = @'

function isMissingGitLfsPointer(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024) return false;
    const marker = fs.readFileSync(filePath, "utf8");
    return marker.startsWith("version https://git-lfs.github.com/spec");
  } catch {
    return true;
  }
}

function isUsableVtuberModelAsset(model) {
  if (String(model?.format || "").toLowerCase() !== "vrm") return true;
  return !isMissingGitLfsPointer(path.resolve(__dirname, model.path || ""));
}
'@
  $main = $main.Replace("function vtuberModelRegistry() {", $insert + "`r`nfunction vtuberModelRegistry() {")
}
$main = $main.Replace("  return [...builtIn, ...custom];", "  return [...builtIn, ...custom].filter(isUsableVtuberModelAsset);")
Write-Text $mainPath $main

$configDir = Join-Path $appRoot ".blue"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$modelConfigPath = Join-Path $configDir "vtuber-model.json"
Write-Text $modelConfigPath "{`r`n  `"selectedModelId`": `"custom-Bleachreborn`"`r`n}`r`n"

Write-Output "Fixed mojibake UI labels and configured Blue to use the valid Live2D model while LFS VRMs are unavailable."
