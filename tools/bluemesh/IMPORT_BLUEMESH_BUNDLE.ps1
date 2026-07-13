[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Token,

    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$NodeId = "local_blue_node",
    [string]$CreatorId = "local_creator",
    [switch]$Approve
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$db = Join-Path $repoRoot "Project Blue App\.blue\bluemesh.db"
$env:PYTHONPATH = Join-Path $repoRoot "src"
$argsList = @(
    "-m", "blue_mesh.lan", "import",
    "--db", $db,
    "--token", $Token,
    "--node-id", $NodeId,
    "--creator-id", $CreatorId,
    "--input", $InputPath
)
if ($Approve) { $argsList += "--approve" }
python @argsList
