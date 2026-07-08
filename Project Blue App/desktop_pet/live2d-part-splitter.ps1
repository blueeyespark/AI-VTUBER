param(
  [Parameter(Mandatory = $true)]
  [string]$Reference,
  [Parameter(Mandatory = $true)]
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Reference -PathType Leaf)) {
  throw "Reference image was not found: $Reference"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$source = [System.Drawing.Image]::FromFile($Reference)
$width = [int]$source.Width
$height = [int]$source.Height

function New-Part {
  param(
    [string]$Group,
    [string]$File,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H
  )
  $dir = Join-Path $OutputDir $Group
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir $File
  $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $left = [Math]::Max(0, [int]($width * $X))
  $top = [Math]::Max(0, [int]($height * $Y))
  $partWidth = [Math]::Min($width - $left, [int]($width * $W))
  $partHeight = [Math]::Min($height - $top, [int]($height * $H))
  if ($partWidth -gt 0 -and $partHeight -gt 0) {
    $rect = New-Object System.Drawing.Rectangle $left, $top, $partWidth, $partHeight
    $graphics.DrawImage($source, $rect, $rect, [System.Drawing.GraphicsUnit]::Pixel)
  }
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  [pscustomobject]@{
    group = $Group
    file = $File
    path = $target
    status = "auto_rough_cut"
  }
}

$parts = @()
$parts += New-Part "head" "head_base.png" 0.34 0.05 0.32 0.22
$parts += New-Part "hair" "hair_back.png" 0.28 0.02 0.44 0.30
$parts += New-Part "hair" "hair_side_l.png" 0.24 0.10 0.18 0.32
$parts += New-Part "hair" "hair_side_r.png" 0.58 0.10 0.18 0.32
$parts += New-Part "hair" "bangs_front.png" 0.30 0.04 0.40 0.18
$parts += New-Part "face" "face_base.png" 0.36 0.12 0.28 0.18
$parts += New-Part "eyes" "eye_l_white.png" 0.40 0.16 0.08 0.04
$parts += New-Part "eyes" "eye_l_iris.png" 0.42 0.16 0.04 0.04
$parts += New-Part "eyes" "eye_l_pupil.png" 0.43 0.17 0.02 0.02
$parts += New-Part "eyes" "eye_l_lid.png" 0.39 0.14 0.10 0.05
$parts += New-Part "eyes" "eye_l_lashes.png" 0.38 0.14 0.12 0.06
$parts += New-Part "eyes" "eye_r_white.png" 0.52 0.16 0.08 0.04
$parts += New-Part "eyes" "eye_r_iris.png" 0.54 0.16 0.04 0.04
$parts += New-Part "eyes" "eye_r_pupil.png" 0.55 0.17 0.02 0.02
$parts += New-Part "eyes" "eye_r_lid.png" 0.51 0.14 0.10 0.05
$parts += New-Part "eyes" "eye_r_lashes.png" 0.50 0.14 0.12 0.06
$parts += New-Part "brows" "brow_l.png" 0.39 0.12 0.10 0.035
$parts += New-Part "brows" "brow_r.png" 0.51 0.12 0.10 0.035
$parts += New-Part "mouth" "mouth_closed.png" 0.44 0.23 0.12 0.035
$parts += New-Part "mouth" "mouth_open.png" 0.43 0.22 0.14 0.055
$parts += New-Part "mouth" "upper_lip.png" 0.43 0.215 0.14 0.025
$parts += New-Part "mouth" "lower_lip.png" 0.43 0.245 0.14 0.03
$parts += New-Part "body" "neck.png" 0.43 0.27 0.14 0.10
$parts += New-Part "body" "torso_base.png" 0.30 0.32 0.40 0.34
$parts += New-Part "arms" "upper_arm_l.png" 0.18 0.34 0.16 0.24
$parts += New-Part "arms" "lower_arm_l.png" 0.12 0.50 0.18 0.24
$parts += New-Part "arms" "hand_l.png" 0.10 0.68 0.14 0.12
$parts += New-Part "arms" "upper_arm_r.png" 0.66 0.34 0.16 0.24
$parts += New-Part "arms" "lower_arm_r.png" 0.70 0.50 0.18 0.24
$parts += New-Part "arms" "hand_r.png" 0.76 0.68 0.14 0.12
$parts += New-Part "outfit" "outfit_top_front.png" 0.31 0.34 0.38 0.23
$parts += New-Part "outfit" "outfit_top_shadow.png" 0.29 0.33 0.42 0.27
$parts += New-Part "outfit" "outfit_trim.png" 0.30 0.32 0.40 0.12
$parts += New-Part "outfit" "outfit_bottom.png" 0.32 0.55 0.36 0.18
$parts += New-Part "legs" "leg_l.png" 0.34 0.66 0.15 0.30
$parts += New-Part "legs" "leg_r.png" 0.51 0.66 0.15 0.30
$parts += New-Part "accessories" "accessory_01.png" 0.20 0.05 0.60 0.24

$checklist = @(
  "# Live2D Auto-Cut Parts Checklist",
  "",
  "Reference image: $Reference",
  "Canvas: ${width}x${height}",
  "",
  "These are first-pass rough cuts from one flat PNG. Review each transparent PNG and redraw/refine the edges before final Live2D rigging.",
  ""
) + ($parts | ForEach-Object { "- [ ] $($_.group)/$($_.file) - $($_.status)" })
Set-Content -LiteralPath (Join-Path $OutputDir "PARTS_CHECKLIST.md") -Value ($checklist -join "`r`n") -Encoding UTF8

[pscustomobject]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  referencePath = $Reference
  canvas = @{ width = $width; height = $height }
  method = "rough_rectangular_same_canvas_png_split"
  warning = "These are rough first-pass cuts from a flat PNG, not final clean artist layers."
  parts = $parts
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "parts-manifest.json") -Encoding UTF8

$source.Dispose()
Write-Output "Created $($parts.Count) rough transparent PNG part(s) in $OutputDir"
