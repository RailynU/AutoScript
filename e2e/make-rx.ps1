# Generates a synthetic prescription PNG for E2E testing. All data is fake.
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'test-rx.png'
$bmp = New-Object System.Drawing.Bitmap 900, 620
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::White)
$title = New-Object System.Drawing.Font 'Arial', 22, ([System.Drawing.FontStyle]::Bold)
$body  = New-Object System.Drawing.Font 'Arial', 17
$brush = [System.Drawing.Brushes]::Black
$pen   = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 2
$g.DrawRectangle($pen, 15, 15, 870, 590)
$lines = @(
  @($title, 'Dr. Alan Reyes, MD', 40),
  @($body,  'NPI: 1234567893     Phone: (555) 201-3344', 85),
  @($body,  '------------------------------------------------------------', 120),
  @($body,  'Patient: Emily Carter', 160),
  @($body,  'DOB: 04/12/1985', 195),
  @($body,  '------------------------------------------------------------', 230),
  @($title, 'Rx: Lisinopril 10 mg tablet', 275),
  @($body,  'Sig: Take 1 tablet by mouth once daily', 325),
  @($body,  'Quantity: 30', 365),
  @($body,  'Days supply: 30', 400),
  @($body,  'Refills: 2', 435),
  @($body,  'Signature: A. Reyes', 520)
)
foreach ($l in $lines) { $g.DrawString($l[1], $l[0], $brush, 45, $l[2]) }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"
