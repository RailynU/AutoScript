Set-Location (Split-Path $PSScriptRoot -Parent)
$out = Join-Path $PSScriptRoot 'git-state.log'
"=== $(Get-Date -Format s) ===" | Set-Content $out
git fetch origin 2>&1 | Out-Null
"MERGING=$(Test-Path .git/MERGE_HEAD)" | Add-Content $out
"UNMERGED:" | Add-Content $out
git diff --name-only --diff-filter=U 2>&1 | Add-Content $out
"LOCAL=$(git rev-parse main)"  | Add-Content $out
"REMOTE=$(git rev-parse origin/main)" | Add-Content $out
git status -sb 2>&1 | Select-Object -First 6 | Add-Content $out
"LOG:" | Add-Content $out
git log --oneline -5 2>&1 | Add-Content $out
