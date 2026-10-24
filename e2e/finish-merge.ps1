# Finish the in-progress merge and push. Logs every step to finish-merge.log.
Set-Location (Split-Path $PSScriptRoot -Parent)
$out = Join-Path $PSScriptRoot 'finish-merge.log'
"=== $(Get-Date -Format s) ===" | Set-Content $out

git add autoscript-ui/src/App.tsx autoscript-ui/src/api/scripts.ts autoscript/src/main/resources/application.properties 2>&1 | Add-Content $out
$unmerged = git diff --name-only --diff-filter=U
"UNMERGED_AFTER_ADD=[$unmerged]" | Add-Content $out
if ($unmerged) { "ABORT: conflicts remain" | Add-Content $out; exit 1 }

# Refuse to commit secrets or run artifacts.
$staged = git diff --cached --name-only
$bad = $staged | Where-Object { $_ -match '(^|/)\.env$' -or $_ -match '\.log$' -or $_ -match 'e2e-results' }
if ($bad) { "ABORT: secret/artifact staged: $bad" | Add-Content $out; exit 1 }

git commit --no-edit 2>&1 | Add-Content $out
"COMMIT_EXIT=$LASTEXITCODE" | Add-Content $out
"MERGE_HEAD_EXISTS=$(Test-Path .git/MERGE_HEAD)" | Add-Content $out

git push origin main 2>&1 | Add-Content $out
"PUSH_EXIT=$LASTEXITCODE" | Add-Content $out

git fetch origin 2>&1 | Out-Null
$l = git rev-parse main; $r = git rev-parse origin/main
"LOCAL=$l" | Add-Content $out
"REMOTE=$r" | Add-Content $out
"SYNCED=$($l -eq $r)" | Add-Content $out
git status -sb | Select-Object -First 3 | Add-Content $out
"=== DONE ===" | Add-Content $out
