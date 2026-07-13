[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PeerUrl,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$NodeId = "local_blue_node"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$db = Join-Path $repoRoot "Project Blue App\.blue\bluemesh.db"
$env:PYTHONPATH = Join-Path $repoRoot "src"
python -m blue_mesh.lan push --db $db --token $Token --node-id $NodeId --peer $PeerUrl
