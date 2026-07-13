[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$NodeId = "local_blue_node",
    [string]$Output = "bluemesh_bundle.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$db = Join-Path $repoRoot "Project Blue App\.blue\bluemesh.db"
$env:PYTHONPATH = Join-Path $repoRoot "src"
python -m blue_mesh.lan export --db $db --token $Token --node-id $NodeId --output $Output
