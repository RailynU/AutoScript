# E2E: AI beans loaded -> Extract (autofill) -> Review (match) -> Review (mismatch).
$base = 'http://localhost:8080/api'
$img  = Join-Path $PSScriptRoot 'test-rx.png'
$out  = Join-Path $PSScriptRoot 'e2e-results.txt'
"=== E2E $(Get-Date -Format s) ===" | Set-Content $out

function Log($s) { $s | Add-Content $out }

# 1. AI endpoints present? (404 = AI beans not loaded)
$code = curl.exe -s -o NUL -w "%{http_code}" "$base/scripts/queued"
Log "1. GET /scripts/queued -> HTTP $code"

# 2. Extract (autofill)
$t = Measure-Command { $extract = curl.exe -s -w "`nHTTP %{http_code}" -F "image=@$img;type=image/png" "$base/scripts/autofill" }
Log "2. POST /scripts/autofill ($([int]$t.TotalSeconds)s):"
Log $extract

# 3. Review with data that MATCHES the image
$match = @{
  patientFirstName='Emily'; patientLastName='Carter'; patientDateOfBirth='1985-04-12'
  drugName='Lisinopril 10 mg tablet'; directions='Take 1 tablet by mouth once daily'
  quantity=30; daySupply=30; refillCount=2
  prescriberName='Dr. Alan Reyes, MD'; prescriberNpi='1234567893'; prescriberPhone='(555) 201-3344'
} | ConvertTo-Json -Compress
$mf = Join-Path $PSScriptRoot 'match.json'; Set-Content $mf $match -NoNewline
$r1 = curl.exe -s -w "`nHTTP %{http_code}" -F "image=@$img;type=image/png" -F "scriptData=@$mf;type=application/json" "$base/scripts/review"
Log "3. POST /scripts/review (matching entry):"
Log $r1

# 4. Review with deliberate MISMATCHES (wrong qty, wrong drug strength, wrong NPI)
$bad = @{
  patientFirstName='Emily'; patientLastName='Carter'; patientDateOfBirth='1985-04-12'
  drugName='Lisinopril 20 mg tablet'; directions='Take 1 tablet by mouth once daily'
  quantity=90; daySupply=30; refillCount=2
  prescriberName='Dr. Alan Reyes, MD'; prescriberNpi='9999999999'; prescriberPhone='(555) 201-3344'
} | ConvertTo-Json -Compress
$bf = Join-Path $PSScriptRoot 'mismatch.json'; Set-Content $bf $bad -NoNewline
$r2 = curl.exe -s -w "`nHTTP %{http_code}" -F "image=@$img;type=image/png" -F "scriptData=@$bf;type=application/json" "$base/scripts/review"
Log "4. POST /scripts/review (deliberate mismatches: drug strength, quantity, NPI):"
Log $r2

# 5. Completed queue shows the reviews
Log "5. GET /scripts/completed:"
Log (curl.exe -s "$base/scripts/completed")
Remove-Item $mf,$bf -ErrorAction SilentlyContinue
Log "=== DONE ==="
