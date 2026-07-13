param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BlueArgs
)

$launcher = Join-Path $PSScriptRoot "Project Blue App\run_blue.ps1"
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    Write-Error "Project Blue launcher not found at '$launcher'."
    exit 2
}

Push-Location (Split-Path -Parent $launcher)
try {
    & $launcher @BlueArgs
    $blueExit = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $blueExit
