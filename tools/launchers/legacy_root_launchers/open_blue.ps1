$desktopPet = Join-Path $PSScriptRoot "Project Blue App\desktop_pet"
if (-not (Test-Path -LiteralPath (Join-Path $desktopPet "package.json") -PathType Leaf)) {
    Write-Error "Project Blue desktop app not found at '$desktopPet'."
    exit 2
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Push-Location $desktopPet
try {
    npm.cmd start
    $blueExit = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $blueExit
