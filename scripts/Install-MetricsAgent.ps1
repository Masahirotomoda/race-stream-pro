# ============================================================
# MetricsAgent を Windows サービスとして登録
# ファイル: C:\RaceStreamPro\Install-MetricsAgent.ps1
# 実行方法: 管理者権限の PowerShell で実行
# ============================================================

param(
    [string]$SecretKey = $env:RSP_SECRET_KEY,
    [int]$Port         = 9090
)

if (-not $SecretKey) {
    Write-Error "RSP_SECRET_KEY が指定されていません。-SecretKey パラメータか環境変数で指定してください"
    exit 1
}

$serviceName = "RspMetricsAgent"
$scriptPath  = "C:\RaceStreamPro\MetricsAgent.ps1"
$logDir      = "C:\RaceStreamPro\logs"

# ログディレクトリ作成
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# NSSM のパスを探す
$nssmPath = $null
$candidates = @(
    "C:\tools\nssm\nssm.exe",
    "C:\ProgramData\chocolatey\bin\nssm.exe",
    (Get-Command "nssm" -ErrorAction SilentlyContinue)?.Source
)
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $nssmPath = $c; break }
}

# NSSM がなければ winget でインストール
if (-not $nssmPath) {
    Write-Host "NSSM をインストール中..."
    winget install nssm --silent --accept-source-agreements --accept-package-agreements
    $nssmPath = (Get-Command "nssm" -ErrorAction SilentlyContinue)?.Source
}

if (-not $nssmPath) {
    Write-Error "NSSM が見つかりません。https://nssm.cc から手動でインストールしてください"
    exit 1
}

# 既存サービスがあれば停止・削除
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "既存サービスを停止・削除..."
    & $nssmPath stop $serviceName 2>$null
    & $nssmPath remove $serviceName confirm
}

# サービス登録
$psExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$args  = "-ExecutionPolicy Bypass -NonInteractive -File `"$scriptPath`" -Port $Port"

& $nssmPath install $serviceName $psExe
& $nssmPath set $serviceName AppParameters $args
& $nssmPath set $serviceName AppEnvironmentExtra "RSP_SECRET_KEY=$SecretKey"
& $nssmPath set $serviceName Start SERVICE_AUTO_START
& $nssmPath set $serviceName DisplayName "RSP Metrics Agent"
& $nssmPath set $serviceName Description "RaceStreamPro OBS Server Metrics HTTP Agent"
& $nssmPath set $serviceName AppStdout "$logDir\metrics-agent.log"
& $nssmPath set $serviceName AppStderr "$logDir\metrics-agent-err.log"
& $nssmPath set $serviceName AppRotateFiles 1
& $nssmPath set $serviceName AppRotateBytes 10485760   # 10MB

# サービス開始
Start-Service $serviceName
$svc = Get-Service $serviceName
Write-Host ""
Write-Host "RspMetricsAgent サービス登録完了"
Write-Host "  状態: $($svc.Status)"
Write-Host "  確認: Invoke-RestMethod -Uri http://localhost:$Port/metrics -Headers @{'x-secret-key'='$SecretKey'}"
Write-Host "  ログ: $logDir\metrics-agent.log"
