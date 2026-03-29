import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const agentUrl = process.env.GCP_STATS_AGENT_URL
  const token    = process.env.GCP_STATS_TOKEN ?? ''

  if (!agentUrl) {
    return NextResponse.json({ error: 'GCP_STATS_AGENT_URL not set' }, { status: 500 })
  }

  try {
    const res = await fetch(agentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Agent returned ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[gcp-stats] fetch error:', err)
    return NextResponse.json({ error: 'Failed to reach stats agent' }, { status: 503 })
  }
}
