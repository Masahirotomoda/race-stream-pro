import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const agentUrl = process.env.GCP_STATS_AGENT_URL
  const token    = process.env.GCP_STATS_TOKEN ?? ''

  // 未設定時は 500 ではなく 200 + 空データを返す
  // （page.tsx が if (!res.ok) throw → gcpErr=true になるのを防ぐ）
  if (!agentUrl) {
    return NextResponse.json({
      instanceName: null,
      cpu:     { percent: 0, cores: 0 },
      memory:  { percent: 0, usedGb: '0', totalGb: '0' },
      gpu:     { name: '', percent: 0, memUsedMb: 0, memTotalMb: 0, tempC: 0 },
      network: { sentMbps: '0', recvMbps: '0' },
      disk:    { percent: 0, usedGb: '0', totalGb: '0' },
      timestamp: Date.now(),
      _note: 'GCP_STATS_AGENT_URL not configured',
    }, { status: 200 })
  }

  try {
    const res = await fetch(agentUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({
        instanceName: null,
        cpu:     { percent: 0, cores: 0 },
        memory:  { percent: 0, usedGb: '0', totalGb: '0' },
        gpu:     { name: '', percent: 0, memUsedMb: 0, memTotalMb: 0, tempC: 0 },
        network: { sentMbps: '0', recvMbps: '0' },
        disk:    { percent: 0, usedGb: '0', totalGb: '0' },
        timestamp: Date.now(),
        _note: `Agent returned ${res.status}`,
      }, { status: 200 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[gcp-stats] fetch error:', err)
    return NextResponse.json({
      instanceName: null,
      cpu:     { percent: 0, cores: 0 },
      memory:  { percent: 0, usedGb: '0', totalGb: '0' },
      gpu:     { name: '', percent: 0, memUsedMb: 0, memTotalMb: 0, tempC: 0 },
      network: { sentMbps: '0', recvMbps: '0' },
      disk:    { percent: 0, usedGb: '0', totalGb: '0' },
      timestamp: Date.now(),
      _note: 'Failed to reach stats agent',
    }, { status: 200 })
  }
}
