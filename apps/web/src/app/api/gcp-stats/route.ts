import { NextResponse } from 'next/server'
import si from 'systeminformation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const [cpu, mem, gpuData, net, disk] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.graphics(),
      si.networkStats(),
      si.fsSize(),
    ])

    const gpuController = gpuData.controllers?.[0]
    const gpuPercent  = gpuController?.utilizationGpu ?? 0
    const gpuMemUsed  = gpuController?.memoryUsed     ?? 0
    const gpuMemTotal = gpuController?.memoryTotal    ?? 0
    const gpuTemp     = gpuController?.temperatureGpu ?? 0
    const gpuName     = gpuController?.model          ?? 'N/A'

    const netIf = net?.[0]
    const netSentMbps = netIf ? (netIf.tx_sec / 1024 / 1024).toFixed(2) : '0'
    const netRecvMbps = netIf ? (netIf.rx_sec / 1024 / 1024).toFixed(2) : '0'

    const mainDisk = disk.find(d => d.mount === 'C:' || d.mount === '/') ?? disk[0]

    return NextResponse.json({
      cpu: {
        percent: Math.round(cpu.currentLoad),
        cores: cpu.cpus?.length ?? 0,
      },
      memory: {
        percent: Math.round((mem.used / mem.total) * 100),
        usedGb:  (mem.used  / 1024 ** 3).toFixed(1),
        totalGb: (mem.total / 1024 ** 3).toFixed(1),
      },
      gpu: {
        name:       gpuName,
        percent:    Math.round(gpuPercent),
        memUsedMb:  gpuMemUsed,
        memTotalMb: gpuMemTotal,
        tempC:      gpuTemp,
      },
      network: {
        sentMbps: netSentMbps,
        recvMbps: netRecvMbps,
      },
      disk: {
        percent: mainDisk ? Math.round(mainDisk.use)                   : 0,
        usedGb:  mainDisk ? (mainDisk.used / 1024 ** 3).toFixed(1) : '0',
        totalGb: mainDisk ? (mainDisk.size / 1024 ** 3).toFixed(1) : '0',
      },
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error('[gcp-stats] error:', err)
    return NextResponse.json({ error: 'Failed to collect stats' }, { status: 500 })
  }
}
