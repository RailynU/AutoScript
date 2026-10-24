# E2E: health -> patient -> autofill -> upload (matching entry) -> upload (mismatches) -> poll -> report.
# Needs the API (:8080) and RX Engine (:4210) running: cd autoscript; pnpm dev
param(
  [string]$PatientId,
  [int]$TimeoutSec = 240
)
$base = 'http://localhost:8080/api'
$img  = Join-Path $PSScriptRoot 'test-rx.png'
$out  = Join-Path $PSScriptRoot 'e2e-results.txt'
"=== E2E $(Get-Date -Format s) ===" | Set-Content $out

function Log($s) { $s | Add-Content $out; Write-Output $s }

# 1. Health (API + engine)
try {
  $health = Invoke-RestMethod "$base/health"
  Log "1. GET /health -> $($health | ConvertTo-Json -Compress -Depth 5)"
} catch { Log "1. GET /health FAILED: $_"; exit 1 }

# 2. Patient: use -PatientId, else find or create the patient on test-rx.png
if (-not $PatientId) {
  $found = Invoke-RestMethod "$base/patients?firstName=Emily&lastName=Carter&dob=1985-04-12"
  $list = if ($found.patients) { $found.patients } else { $found }
  if ($list -and @($list).Count -gt 0) {
    $PatientId = @($list)[0].id
    Log "2. Found patient Emily Carter -> $PatientId"
  } else {
    $body = @{
      firstName = 'Emily'; lastName = 'Carter'; dateOfBirth = '1985-04-12'; sex = 'F'
      phone = '5552013344'; allergiesVerified = $true
      allergies = @(); conditions = @(@{ name = 'Hypertension' })
      medications = @()
    } | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod -Method Post "$base/patients" -ContentType 'application/json' -Body $body
    $PatientId = $created.patient.id
    Log "2. Created patient Emily Carter -> $PatientId"
  }
}

# 3. Autofill (reads the script without screening it)
$t = Measure-Command { $extract = curl.exe -s -w "`nHTTP %{http_code}" -F "file=@$img;type=image/png" "$base/prescriptions/extract" }
Log "3. POST /prescriptions/extract ($([int]$t.TotalSeconds)s):"
Log $extract

function Submit($label, $entered) {
  $ef = Join-Path $PSScriptRoot "$label.json"
  Set-Content $ef ($entered | ConvertTo-Json -Compress) -NoNewline
  $resp = curl.exe -s -F "file=@$img;type=image/png" -F "patientId=$PatientId" -F "enteredData=<$ef" "$base/prescriptions/upload"
  Remove-Item $ef -ErrorAction SilentlyContinue
  try { return ($resp | ConvertFrom-Json).prescription.id } catch { Log "   upload failed: $resp"; return $null }
}

function WaitFor($id) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Seconds 3
    $rx = Invoke-RestMethod "$base/prescriptions/$id"
    if ($rx.prescription) { $rx = $rx.prescription }
  } while ($rx.status -eq 'PROCESSING' -and (Get-Date) -lt $deadline)
  return $rx
}

function Report($label, $rx) {
  Log "   [$label] id=$($rx.id) status=$($rx.status) review=$($rx.reviewStatus)"
  if ($rx.status -eq 'FAILED') { Log "   failure: $($rx.failureReason)"; return }
  if ($rx.status -eq 'PROCESSING') { Log "   still PROCESSING at $($rx.progressStage) ($($rx.progressPercent)%) after ${TimeoutSec}s"; return }
  Log "   disposition: $($rx.report.disposition) - $($rx.report.dispositionReason)"
  Log "   retrieval: $($rx.report.coverage.retrievalMethod); llmUsed=$($rx.report.coverage.llmUsed)"
  foreach ($f in $rx.report.findings) { Log "   - [$($f.severity)] $($f.type): $($f.title)" }
}

# 4. Upload with an entry that MATCHES the script
$match = @{
  patientFirstName='Emily'; patientLastName='Carter'; patientDateOfBirth='1985-04-12'
  drugName='Lisinopril 10 mg tablet'; directions='Take 1 tablet by mouth once daily'
  quantity=30; daySupply=30; refillCount=2
  prescriberName='Dr. Alan Reyes, MD'; prescriberNpi='1234567893'; prescriberPhone='(555) 201-3344'
}
$id1 = Submit 'match' $match
Log "4. POST /prescriptions/upload (matching entry) -> $id1"

# 5. Upload with deliberate MISMATCHES (drug strength, quantity, NPI)
$bad = $match.Clone()
$bad.drugName = 'Lisinopril 20 mg tablet'; $bad.quantity = 90; $bad.prescriberNpi = '9999999999'
$id2 = Submit 'mismatch' $bad
Log "5. POST /prescriptions/upload (mismatches: strength, quantity, NPI) -> $id2"

# 6. Poll until each leaves PROCESSING, then print disposition and findings
Log "6. Results:"
if ($id1) { Report 'matching' (WaitFor $id1) }
if ($id2) { Report 'mismatch' (WaitFor $id2) }

Log "7. GET /stats: $(Invoke-RestMethod "$base/stats" | ConvertTo-Json -Compress)"
Log "=== DONE ==="
