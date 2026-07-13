[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$NodeId = "local_blue_node",
    [string]$CreatorId = "local_creator",
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8765,
    [switch]$ApproveImports
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$db = Join-Path $repoRoot "Project Blue App\.blue\bluemesh.db"
$env:PYTHONPATH = Join-Path $repoRoot "src"
$argsList = @(
    "-m", "blue_mesh.lan", "serve",
    "--db", $db,
    "--token", $Token,
    "--node-id", $NodeId,
    "--creator-id", $CreatorId,
    "--host", $HostAddress,
    "--port", $Port
)
if ($ApproveImports) { $argsList += "--approve-imports" }
python @argsList
