# One-shot: free :8080, start backend detached (logs to files), wait for health, run E2E.
param([switch]$SkipE2E)
$root    = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'autoscript'
$status  = Join-Path $PSScriptRoot 'orchestrate-status.txt'
"start $(Get-Date -Format s)" | Set-Content $status

# 1. Free port 8080
$conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
foreach ($p in ($conns.OwningProcess | Select-Object -Unique)) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; "killed $p" | Add-Content $status }
Start-Sleep -Seconds 3

# 2. Start backend detached so it survives this script
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $backend 'start-backend.ps1') `
  -WorkingDirectory $backend -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend.log') `
  -RedirectStandardError  (Join-Path $PSScriptRoot 'backend.err.log')
"backend launched" | Add-Content $status

# 3. Wait for health (up to 4 min)
$ok = $false
for ($i = 0; $i -lt 48; $i++) {
  Start-Sleep -Seconds 5
  $code = curl.exe -s -o NUL -w "%{http_code}" "http://localhost:8080/api/prescriptions/stats"
  if ($code -eq '200') { $ok = $true; break }
}
"healthy=$ok after $(($i+1)*5)s" | Add-Content $status
if (-not $ok) { "ABORT: backend not healthy" | Add-Content $status; exit 1 }

# 4. Run E2E
if (-not $SkipE2E) {
  & (Join-Path $PSScriptRoot 'run-e2e.ps1')
  "e2e finished" | Add-Content $status
}
"done $(Get-Date -Format s)" | Add-Content $status
