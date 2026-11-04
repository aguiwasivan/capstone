param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $mobileRoot
$network = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Sort-Object InterfaceIndex | Select-Object -First 1
if (-not $network) { throw 'Connect the laptop to your phone hotspot or home Wi-Fi first.' }
$phoneHost = $network.IPv4Address.IPAddress | Select-Object -First 1
$profile = Get-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex
Write-Host "Phone server address: http://${phoneHost}:8001/api/" -ForegroundColor Cyan
Write-Host 'Use this address in the app Connection settings if your network address changed.'
if ($profile.NetworkCategory -ne 'Private') {
    throw 'This network is Public. For your trusted hotspot/home Wi-Fi, select Private in Windows Settings, then run this command again.'
}
$rule = Get-NetFirewallRule -DisplayName 'Reservation Mobile API' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' }
if (-not $rule) { Write-Warning 'The mobile API firewall exception was not found. Phone access may be blocked.' }
$python = Join-Path (Split-Path $mobileRoot -Parent) 'backend\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'The backend Python environment is missing.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$expo = Join-Path $mobileRoot 'node_modules\expo\bin\cli'
if (-not (Test-Path -LiteralPath $expo)) { throw 'Run npm install in the mobile folder first.' }
if ($CheckOnly) { Write-Host 'Startup checks passed. No servers were started.'; exit 0 }
$listener = Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction SilentlyContinue
if ($listener) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener[0].OwningProcess)"
    if ($existing.CommandLine -notlike '*scripts/dev_backend.py*' -and $existing.CommandLine -notlike '*scripts\dev_backend.py*') {
        throw 'Port 8001 is used by another process. It was left running. Close it or choose a different port before starting the mobile API.'
    }
    # Restart only our mobile helper so ALLOWED_HOSTS uses the current network address.
    Stop-Process -Id $existing.ProcessId
    Start-Sleep -Seconds 1
}
New-Item -ItemType Directory -Path '.expo' -Force | Out-Null
$api = Start-Process -FilePath $python -ArgumentList @('-u', 'scripts/dev_backend.py', '--host', $phoneHost) -WorkingDirectory $mobileRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $mobileRoot '.expo\mobile-api.stdout.log') -RedirectStandardError (Join-Path $mobileRoot '.expo\mobile-api.stderr.log') -PassThru
Write-Host 'Starting the separate mobile API. The website server is unchanged.'
$ready = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($api.HasExited) { throw 'Mobile API exited. Check .expo/mobile-api.stderr.log.' }
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 2 "http://${phoneHost}:8001/api/login/"
    if ($code -eq '405') { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Mobile API did not become ready. Check .expo/mobile-api.stderr.log.' }
$env:EXPO_PUBLIC_API_URL = "http://${phoneHost}:8001/api/"
Write-Host "API ready. Keep the laptop connected. Phone server: $env:EXPO_PUBLIC_API_URL" -ForegroundColor Green
Write-Host 'Scan the new Expo QR code. The mobile API stays running when Expo closes.'
& $node $expo start --port 8082 --tunnel ngrok --clear
exit $LASTEXITCODE
