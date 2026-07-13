$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:PYTHONPATH = Join-Path $repoRoot "src"
python -m blue_mesh.lan token
