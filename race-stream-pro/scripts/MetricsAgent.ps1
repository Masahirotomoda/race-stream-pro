# ============================================================
# RaceStreamPro - OBS Server Metrics Agent
# ファイル: C:\RaceStreamPro\MetricsAgent.ps1
# 説明: CPU/メモリ/ディスク/ネットワーク/GPU/OBS状態を
#       HTTP API として公開するエージェント
# 起動: 管理者権限で PowerShell から実行
# ============================================================

param(
    [int]$Port      = 9090,
    [string]$Secret = $env:RSP_SECRET_KEY
)

if (-not $Secret) {
    Write-Error "環境変数 RSP_SECRET_KEY が設定されていません"
    exit 1
}

# ──────────────────────────────
# ヘルパー関数
# ──────────────────────────────

function Get-CpuUsage {
    $cpu = Get-CimInstance Win32_Processor |
           Measure-Object -Property LoadPercentage -Average
    return [math]::Round($cpu.Average, 1)
}

function Get-MemoryInfo {
    $os    = Get-CimInstance Win32_OperatingSystem
    $total = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)  # GB
    $free  = [math]::Round($os.FreePhysicalMemory     / 1MB, 2)  # GB
    $used  = [math]::Round($total - $free, 2)
    $pct   = [math]::Round(($used / $total) * 100, 1)
    return @{
        totalGb = $total
        usedGb  = $used
        freeGb  = $free
        pct     = $pct
    }
}

function Get-DiskInfo {
    $disk  = Get-PSDrive C
    $total = [math]::Round(($disk.Used + $disk.Free) / 1GB, 2)
    $used  = [math]::Round($disk.Used / 1GB, 2)
    $pct   = [math]::Round(($disk.Used / ($disk.Used + $disk.Free)) * 100, 1)
    return @{
        totalGb = $total
        usedGb  = $used
        pct     = $pct
    }
}

function Get-NetworkStats {
    # 直近1秒の送受信バイト数を測定
    $adapters1 = Get-NetAdapterStatistics | Where-Object { $_.ReceivedBytes -gt 0 }
    Start-Sleep -Milliseconds 1000
    $adapters2 = Get-NetAdapterStatistics | Where-Object { $_.ReceivedBytes -gt 0 }

    $totalRx = 0
    $totalTx = 0
    foreach ($a2 in $adapters2) {
        $a1 = $adapters1 | Where-Object { $_.Name -eq $a2.Name }
        if ($a1) {
            $totalRx += ($a2.ReceivedBytes - $a1.ReceivedBytes)
            $totalTx += ($a2.SentBytes     - $a1.SentBytes)
        }
    }
    return @{
        rxBps  = $totalRx
        txBps  = $totalTx
        rxKbps = [math]::Round($totalRx * 8 / 1000, 1)
        txKbps = [math]::Round($totalTx * 8 / 1000, 1)
    }
}

function Get-GpuUsage {
    try {
        $nvidiaSmi = Get-Command "nvidia-smi" -ErrorAction SilentlyContinue
        if ($nvidiaSmi) {
            $out = & nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total `
                                --format=csv,noheader,nounits 2>$null
            if ($out) {
                $parts = $out -split ","
                return @{
                    available   = $true
                    gpuPct      = [int]$parts[0].Trim()
                    vramUsedMb  = [int]$parts[1].Trim()
                    vramTotalMb = [int]$parts[2].Trim()
                }
            }
        }
        return @{ available = $false }
    } catch {
        return @{ available = $false }
    }
}

function Get-ObsStatus {
    $proc = Get-Process -Name "obs64","obs" -ErrorAction SilentlyContinue
    if ($proc) {
        $cpuPct = [math]::Round(($proc | Measure-Object CPU -Sum).Sum, 1)
        $memMb  = [math]::Round(
            ($proc | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
        return @{
            running    = $true
            processCpu = $cpuPct
            memoryMb   = $memMb
            pid        = $proc[0].Id
        }
    }
    return @{ running = $false }
}

function Get-UptimeSeconds {
    $os = Get-CimInstance Win32_OperatingSystem
    return [int](New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalSeconds
}

# ──────────────────────────────
# HTTP サーバー
# ──────────────────────────────

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
$listener.Start()
Write-Host "MetricsAgent 起動: http://0.0.0.0:$Port/metrics (Port $Port)"
Write-Host "停止するには Ctrl+C を押してください"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        # ヘルスチェック（認証不要）
        if ($req.Url.AbsolutePath -eq "/health") {
            $body = '{"status":"ok"}'
            $buf  = [System.Text.Encoding]::UTF8.GetBytes($body)
            $res.ContentType     = "application/json"
            $res.StatusCode      = 200
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.OutputStream.Close()
            continue
        }

        # SECRET_KEY 認証
        $reqSecret = $req.Headers["x-secret-key"]
        if ($reqSecret -ne $Secret) {
            $buf = [System.Text.Encoding]::UTF8.GetBytes('{"error":"unauthorized"}')
            $res.ContentType     = "application/json"
            $res.StatusCode      = 401
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.OutputStream.Close()
            continue
        }

        # メトリクス収集 (/metrics)
        try {
            $mem  = Get-MemoryInfo
            $disk = Get-DiskInfo
            $net  = Get-NetworkStats   # 約1秒かかる
            $gpu  = Get-GpuUsage
            $obs  = Get-ObsStatus
            $cpu  = Get-CpuUsage

            $payload = @{
                collectedAt = (Get-Date -Format "o")
                uptimeSec   = Get-UptimeSeconds
                cpu         = @{ pct = $cpu }
                memory      = $mem
                disk        = $disk
                network     = $net
                gpu         = $gpu
                obs         = $obs
            }

            $json = $payload | ConvertTo-Json -Depth 5
            $buf  = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType     = "application/json; charset=utf-8"
            $res.StatusCode      = 200
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
        } catch {
            $errBody = "{`"error`":`"$($_.Exception.Message)`"}"
            $buf = [System.Text.Encoding]::UTF8.GetBytes($errBody)
            $res.ContentType     = "application/json"
            $res.StatusCode      = 500
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
        }

        $res.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "MetricsAgent 停止"
}
