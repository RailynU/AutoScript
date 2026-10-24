# Loads autoscript/.env into this process's environment, then starts Spring Boot.
# Values are never printed. Usage (from the autoscript folder):  .\start-backend.ps1
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx  = $line.IndexOf('=')
            $name = $line.Substring(0, $idx).Trim()
            $val  = $line.Substring($idx + 1).Trim()
            [Environment]::SetEnvironmentVariable($name, $val, 'Process')
        }
    }
    Write-Output "Loaded .env (values hidden)"
} else {
    Write-Output "No .env found at $envFile"
}
Set-Location $PSScriptRoot
.\mvnw.cmd spring-boot:run "-Dmaven.test.skip=true"
