'use client'
import { useEffect, useState, useCallback } from 'react'

interface GcpStats {
  cpu:     { percent: number; cores: number }
  memory:  { percent: number; usedGb: string; totalGb: string }
  gpu:     { name: string; percent: number; memUsedMb: number; memTotalMb: number; tempC: number }
  network: { sentMbps: string; recvMbps: string }
  disk:    { percent: number; usedGb: string; totalGb: string }
  timestamp: number
}

function GaugeBar({ label, value, subLabel, color, warnAt = 85 }: {
  label: string; value: number; subLabel?: string; color: string; warnAt?: number
}) {
  const isWarn = value >= warnAt
  const barColor = isWarn ? 'from-red-500 to-red-700' : color
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] tracking-widest text-gray-400 uppercase">{label}</span>
        <div className="text-right">
          <span className={`text-xs font-bold ${isWarn ? 'text-red-400' : 'text-white'}`}>{value}%</span>
          {subLabel && <span className="text-[9px] text-gray-500 ml-1">{subLabel}</span>}
        </div>
      </div>
      <div className="h-[4px] rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default function MonitorPage() {
  const [stats, setStats] = useState<GcpStats | null>(null)
  const [error, setError] = useState(false)
  const [blink, setBlink] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/gcp-stats', { cache: 'no-store' })
      if (!res.ok) throw new Error('fetch failed')
      setStats(await res.json())
      setError(false)
    } catch { setError(true) }
  }, [])

  useEffect(() => {
    fetchStats()
    const id = setInterval(fetchStats, 2000)
    return () => clearInterval(id)
  }, [fetchStats])

  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 800)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-transparent p-3 w-[320px]">
      <div className="rounded-xl border border-cyan-500/30 p-3"
        style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full"
              style={{ background: error ? '#ff1744' : '#00e676', opacity: blink ? 1 : 0.2, transition: 'opacity 0.3s' }} />
            <span className="text-[10px] tracking-[3px] text-cyan-400 uppercase font-semibold">GCP Monitor</span>
          </div>
          <span className="text-[9px] text-gray-600 tracking-widest uppercase">{error ? 'ERROR' : 'LIVE'}</span>
        </div>
        {!stats ? (
          <div className="text-gray-500 text-[11px] text-center py-4">接続中...</div>
        ) : (
          <>
            <GaugeBar label={`CPU (${stats.cpu.cores} vCPU)`} value={stats.cpu.percent} color="from-cyan-400 to-blue-600" />
            <GaugeBar label="MEMORY" value={stats.memory.percent} subLabel={`${stats.memory.usedGb}/${stats.memory.totalGb}GB`} color="from-purple-400 to-purple-700" />
            <GaugeBar label={`GPU ${stats.gpu.name}`} value={stats.gpu.percent}
              subLabel={stats.gpu.memTotalMb > 0 ? `${stats.gpu.memUsedMb}/${stats.gpu.memTotalMb}MB` : undefined}
              color="from-green-400 to-teal-600" />
            {stats.gpu.tempC > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] tracking-widest text-gray-400 uppercase">GPU TEMP</span>
                <span className={`text-xs font-bold ${stats.gpu.tempC > 80 ? 'text-red-400' : 'text-orange-300'}`}>{stats.gpu.tempC}°C</span>
              </div>
            )}
            <GaugeBar label="DISK C:" value={stats.disk.percent}
              subLabel={`${stats.disk.usedGb}/${stats.disk.totalGb}GB`}
              color="from-yellow-400 to-orange-500" warnAt={90} />
            <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-[9px] text-gray-500 tracking-widest uppercase">▲ Upload</div>
                <div className="text-[12px] font-bold text-yellow-300">{stats.network.sentMbps} <span className="text-[9px] text-gray-500">MB/s</span></div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-gray-500 tracking-widest uppercase">▼ Download</div>
                <div className="text-[12px] font-bold text-yellow-300">{stats.network.recvMbps} <span className="text-[9px] text-gray-500">MB/s</span></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
