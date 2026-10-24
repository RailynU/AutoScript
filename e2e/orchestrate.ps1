# One-shot: ensure the docker DB is up, start the API + RX Engine (pnpm dev) detached if they
# are not already answering, wait for /api/health, then run the E2E flow.
param([switch]$SkipE2E)
$root    = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'autoscript'
$status  = Join-Path $PSScriptRoot 'orchestrate-status.txt'
$health  = 'http://localhost:8080/api/health'
"start $(Get-Date -Format s)" | Set-Content $status

function Healthy {
  $code = curl.exe -s -o NUL -w "%{http_code}" $health
  return $code -eq '200'
}

# 1. Database (pgvector on :5433)
Push-Location $backend
docker compose up -d --wait db 2>&1 | Add-Content $status
Pop-Location

# 2. Start API (:8080) + RX Engine (:4210) unless already running
if (Healthy) {
  "services already running" | Add-Content $status
} else {
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c','pnpm','dev' `
    -WorkingDirectory $backend -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend.log') `
    -RedirectStandardError  (Join-Path $PSScriptRoot 'backend.err.log')
  "pnpm dev launched" | Add-Content $status
}

# 3. Wait for health (up to 2 min)
$ok = $false
for ($i = 0; $i -lt 24; $i++) {
  if (Healthy) { $ok = $true; break }
  Start-Sleep -Seconds 5
}
"healthy=$ok after $($i*5)s" | Add-Content $status
if (-not $ok) { "ABORT: API not healthy at $health" | Add-Content $status; exit 1 }

# 4. Run E2E
if (-not $SkipE2E) {
  & (Join-Path $PSScriptRoot 'run-e2e.ps1')
  "e2e finished" | Add-Content $status
}
"done $(Get-Date -Format s)" | Add-Content $status
