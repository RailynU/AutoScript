param([int[]]$Ports = @(8080))
$log = Join-Path $PSScriptRoot 'kill-port.log'
"run $(Get-Date -Format s)" | Set-Content $log
foreach ($p in $Ports) {
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  foreach ($pid_ in ($conns.OwningProcess | Select-Object -Unique)) {
    try { Stop-Process -Id $pid_ -Force; "killed pid $pid_ on $p" | Add-Content $log } catch { "fail $pid_ : $_" | Add-Content $log }
  }
}
Start-Sleep -Seconds 2
foreach ($p in $Ports) {
  $still = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($still) { "port $p STILL BUSY" | Add-Content $log } else { "port $p free" | Add-Content $log }
}
