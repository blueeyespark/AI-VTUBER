[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BlueArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$desktopPet = Join-Path $repoRoot "Project Blue App\desktop_pet"
$packageJson = Join-Path $desktopPet "package.json"

if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    Write-Error "Project Blue desktop app not found at '$desktopPet'."
    exit 2
}

Write-Host "Starting Project Blue..." -ForegroundColor Cyan
Write-Host "Root: $repoRoot"
Write-Host "App : $desktopPet"

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Push-Location $desktopPet
try {
    if ($BlueArgs.Count -gt 0) {
        & npm.cmd start -- @BlueArgs
    }
    else {
        & npm.cmd start
    }
    $blueExit = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $blueExit
