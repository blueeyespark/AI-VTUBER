param(
    [ValidateRange(1, 15)]
    [int]$Seconds = 8,
    [switch]$ListRecognizers
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech

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
