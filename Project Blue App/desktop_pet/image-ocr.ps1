param(
    [string]$ImagePath,
    [switch]$ListLanguages
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$OcrEngineType = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
if ($ListLanguages) {
    $OcrEngineType::AvailableRecognizerLanguages |
        ForEach-Object { Write-Output $_.LanguageTag }
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ImagePath) -or
    -not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
    throw "Choose an existing image to scan."
}

$AllowedExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
if ([System.IO.Path]::GetExtension($ImagePath).ToLowerInvariant() -notin $AllowedExtensions) {
    throw "Local OCR accepts PNG, JPG, JPEG, GIF, WEBP, or BMP images."
}

$AsTaskGeneric = (
    [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        }
)[0]

function Wait-WinRtOperation {
    param($Operation, [Type]$ResultType)
    $AsTask = $AsTaskGeneric.MakeGenericMethod($ResultType)
    $Task = $AsTask.Invoke($null, @($Operation))
    $Task.Wait()
    return $Task.Result
}

$StorageFileType = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$StreamType = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$DecoderType = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$BitmapType = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$OcrResultType = [Windows.Media.Ocr.OcrResult,Windows.Media.Ocr,ContentType=WindowsRuntime]
$FileAccessMode = [Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime]

$File = Wait-WinRtOperation ($StorageFileType::GetFileFromPathAsync(
    [System.IO.Path]::GetFullPath($ImagePath)
)) $StorageFileType
$Stream = Wait-WinRtOperation ($File.OpenAsync($FileAccessMode::Read)) $StreamType
$Bitmap = $null
try {
    $Decoder = Wait-WinRtOperation ($DecoderType::CreateAsync($Stream)) $DecoderType
    if ($Decoder.PixelWidth -gt $OcrEngineType::MaxImageDimension -or
        $Decoder.PixelHeight -gt $OcrEngineType::MaxImageDimension) {
        throw "Image dimensions exceed the local Windows OCR limit."
    }
    $Bitmap = Wait-WinRtOperation ($Decoder.GetSoftwareBitmapAsync()) $BitmapType
    $Engine = $OcrEngineType::TryCreateFromUserProfileLanguages()
    if ($null -eq $Engine) {
        throw "No compatible local Windows OCR language is installed."
    }
    $Result = Wait-WinRtOperation ($Engine.RecognizeAsync($Bitmap)) $OcrResultType
    [pscustomobject]@{
        language = $Engine.RecognizerLanguage.LanguageTag
        text = [string]$Result.Text
        lines = @($Result.Lines).Count
        width = [int]$Decoder.PixelWidth
        height = [int]$Decoder.PixelHeight
        provider = "Windows.Media.Ocr"
    } | ConvertTo-Json -Compress
}
finally {
    if ($null -ne $Bitmap) { $Bitmap.Dispose() }
    $Stream.Dispose()
}
