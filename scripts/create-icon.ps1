Add-Type -AssemblyName System.Drawing

$size = 128
$backgroundColor = [System.Drawing.Color]::FromArgb(255, 30, 34, 59)
$accentColor = [System.Drawing.Color]::FromArgb(255, 255, 181, 45)
$fontFamily = 'Segoe UI'
$fontSize = 42
$text = 'RS'
$outputPath = Join-Path -Path (Split-Path -Parent $PSScriptRoot) -ChildPath 'media/icon.png'

if (-not (Test-Path (Split-Path -Parent $outputPath))) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
}

$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear($backgroundColor)

$font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush($accentColor)
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$graphics.DrawString($text, $font, $brush, $rect, $format)

$graphics.Dispose()
$font.Dispose()
$brush.Dispose()

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "Icon written to $outputPath"
