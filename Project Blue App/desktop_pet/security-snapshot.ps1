param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Normalize-Age {
    param($Value)
    $Number = [long]$Value
    if ($Number -ge 4294967295) { return $null }
    return [int]$Number
}

$ProviderErrors = [System.Collections.Generic.List[string]]::new()
$Defender = $null
$Firewall = @()
$Threats = @()
$Startup = @()
$Products = @()
try {
    $Defender = Get-MpComputerStatus -ErrorAction Stop
}
catch {
    $ProviderErrors.Add("Microsoft Defender status: $($_.Exception.Message)")
}
try {
    $Firewall = @(
        Get-NetFirewallProfile -ErrorAction Stop |
            Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction
    )
}
catch {
    $ProviderErrors.Add("Windows Firewall status: $($_.Exception.Message)")
}
try {
    $Threats = @(
        Get-MpThreatDetection -ErrorAction Stop |
            Sort-Object InitialDetectionTime -Descending |
            Select-Object -First 20 ThreatID, InitialDetectionTime, ActionSuccess,
                CurrentThreatExecutionStatusID
    )
}
catch {
    $ProviderErrors.Add("Defender threat history: $($_.Exception.Message)")
}
try {
    $Startup = @(
        Get-CimInstance -ClassName Win32_StartupCommand -ErrorAction Stop |
            Sort-Object Name |
            Select-Object -First 80 Name, Location, User
    )
}
catch {
    $ProviderErrors.Add("Startup command inventory: $($_.Exception.Message)")
}
try {
    $Products = @(
        Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct `
            -ErrorAction Stop |
            Select-Object displayName, productState, timestamp
    )
}
catch {
    $ProviderErrors.Add("Registered antivirus products: $($_.Exception.Message)")
}

$FirewallHealthy = (
    $Firewall.Count -ge 1 -and
    @($Firewall | Where-Object { -not [bool]$_.Enabled }).Count -eq 0
)
$DefenderHealthy = (
    $null -ne $Defender -and
    [bool]$Defender.AntivirusEnabled -and
    [bool]$Defender.RealTimeProtectionEnabled
)
$State = if ($DefenderHealthy -and $FirewallHealthy) {
    "healthy"
}
elseif ($null -eq $Defender -and $Firewall.Count -eq 0) {
    "unavailable"
}
else {
    "attention"
}

[pscustomobject]@{
    schema = "project-blue-windows-security-snapshot-v1"
    scannedAt = [DateTimeOffset]::UtcNow.ToString("o")
    readOnly = $true
    state = $State
    defender = if ($null -eq $Defender) {
        $null
    }
    else {
        [pscustomobject]@{
            antivirusEnabled = [bool]$Defender.AntivirusEnabled
            antispywareEnabled = [bool]$Defender.AntispywareEnabled
            realTimeProtectionEnabled = [bool]$Defender.RealTimeProtectionEnabled
            behaviorMonitorEnabled = [bool]$Defender.BehaviorMonitorEnabled
            ioavProtectionEnabled = [bool]$Defender.IoavProtectionEnabled
            networkInspectionEnabled = [bool]$Defender.NISEnabled
            onAccessProtectionEnabled = [bool]$Defender.OnAccessProtectionEnabled
            runningMode = [string]$Defender.AMRunningMode
            antivirusSignatureAgeDays = (
                Normalize-Age $Defender.AntivirusSignatureAge
            )
            antivirusSignatureLastUpdated = if (
                $null -ne $Defender.AntivirusSignatureLastUpdated
            ) {
                ([DateTimeOffset]$Defender.AntivirusSignatureLastUpdated).ToString("o")
            } else { $null }
            quickScanAgeDays = (Normalize-Age $Defender.QuickScanAge)
            fullScanAgeDays = (Normalize-Age $Defender.FullScanAge)
            rebootRequired = [bool]$Defender.RebootRequired
        }
    }
    firewallProfiles = @($Firewall)
    threatDetections = @($Threats)
    antivirusProducts = @($Products)
    startupCommands = @($Startup)
    providerErrors = @($ProviderErrors)
    limitations = @(
        "This is a manual read-only status snapshot, not an antivirus engine.",
        "Blue did not quarantine, delete, scan, update, or change security settings.",
        "Unavailable providers can require Windows permissions or installed components."
    )
} | ConvertTo-Json -Depth 6 -Compress
