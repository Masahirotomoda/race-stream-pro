import { NextRequest, NextResponse } from "next/server";

const MEDIAMTX_API = process.env.MEDIAMTX_API_URL ?? "http://10.146.0.9:9997";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get("reservationId");
  const suffix = reservationId ? `-${reservationId.slice(0, 8)}` : "";
  try {
    const [pathsRes, srtRes] = await Promise.all([
      fetch(`${MEDIAMTX_API}/v3/paths/list`, { signal: AbortSignal.timeout(3000), cache: "no-store" }),
      fetch(`${MEDIAMTX_API}/v3/srtconns/list`, { signal: AbortSignal.timeout(3000), cache: "no-store" }),
    ]);
    const pathsData = pathsRes.ok ? await pathsRes.json() : { items: [] };
    const srtData = srtRes.ok ? await srtRes.json() : { items: [] };
    const allPaths = pathsData.items ?? [];
    const allSrtConns = srtData.items ?? [];
    const camPaths = suffix ? allPaths.filter((p: any) => p.name.endsWith(suffix)) : allPaths;
    const srtByPath = new Map<string, any>();
    for (const conn of allSrtConns) {
      if (conn.state === "publish") srtByPath.set(conn.path, conn);
    }
    camPaths.sort((a: any, b: any) => {
      const na = parseInt(a.name.replace(/^cam(\d+)-.*/, "$1") ?? "0");
      const nb = parseInt(b.name.replace(/^cam(\d+)-.*/, "$1") ?? "0");
      return na - nb;
    });
    const cameras = camPaths.map((path: any) => {
      const conn = srtByPath.get(path.name);
      const camNum = parseInt(path.name.replace(/^cam(\d+)-.*/, "$1") ?? "0");
      const lostPct = conn?.pktReceivedTotal && conn?.pktLostTotal
        ? ((conn.pktLostTotal / (conn.pktReceivedTotal + conn.pktLostTotal)) * 100).toFixed(2)
        : null;
      return {
        cameraIndex: camNum, path: path.name, ready: path.ready,
        readyTime: path.readyTime, tracks: path.tracks,
        bytesReceived: path.bytesReceived, readerCount: path.readers.length,
        remoteAddr: conn?.remoteAddr ?? null, pktLostPct: lostPct,
      };
    });
    return NextResponse.json({
      serverOk: true,
      activePaths: allPaths.filter((p: any) => p.ready).length,
      totalPaths: allPaths.length,
      cameras,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ serverOk: false, error: e?.message ?? "fetch failed" }, { status: 200 });
  }
}
