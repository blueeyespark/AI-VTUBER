param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BlueArgs
)

$env:PYTHONPATH = Join-Path $PSScriptRoot "src"
python -m project_blue @BlueArgs
exit $LASTEXITCODE
