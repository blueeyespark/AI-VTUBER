param(
    [ValidateRange(1, 15)]
    [int]$Seconds = 8,
    [switch]$ListRecognizers,
    [switch]$ListMicrophones
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech

if ($ListMicrophones) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WinMMInputDevices {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct WAVEINCAPS {
        public ushort wMid;
        public ushort wPid;
        public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szPname;
        public uint dwFormats;
        public ushort wChannels;
        public ushort wReserved1;
    }

    [DllImport("winmm.dll")]
    public static extern uint waveInGetNumDevs();

    [DllImport("winmm.dll", CharSet = CharSet.Auto)]
    public static extern uint waveInGetDevCaps(uint uDeviceID, out WAVEINCAPS caps, uint cbwoc);
}
"@
    $Count = [WinMMInputDevices]::waveInGetNumDevs()
    for ($Index = 0; $Index -lt $Count; $Index++) {
        $Caps = New-Object WinMMInputDevices+WAVEINCAPS
        $Result = [WinMMInputDevices]::waveInGetDevCaps([uint32]$Index, [ref]$Caps, [uint32][Runtime.InteropServices.Marshal]::SizeOf($Caps))
        if ($Result -eq 0) {
            Write-Output "$Index|$($Caps.szPname)"
        }
    }
    exit 0
}

$Recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Select-Object -First 1
if ($null -eq $Recognizer) {
    throw "No local Windows speech recognizer is installed."
}
if ($ListRecognizers) {
    [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
        ForEach-Object { Write-Output "$($_.Culture.Name)|$($_.Description)" }
    exit 0
}

$Engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($Recognizer)
try {
    $Engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    $Engine.SetInputToDefaultAudioDevice()
    $Result = $Engine.Recognize([TimeSpan]::FromSeconds($Seconds))
    if ($null -eq $Result -or [string]::IsNullOrWhiteSpace($Result.Text)) {
        throw "No speech was recognized. Check the microphone and try again."
    }
    Write-Output $Result.Text.Trim()
}
finally {
    $Engine.Dispose()
}
