import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MEDIAMTX_API = process.env.MEDIAMTX_API_URL ?? "http://10.146.0.9:9997";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get("reservationId");

  // 予約期間チェック
  if (reservationId) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: rsv } = await supabase
        .from("reservations")
        .select("end_at, status")
        .eq("id", reservationId)
        .single();
      if (rsv) {
        const now = new Date();
        const endAt = new Date(rsv.end_at);
        if (endAt < now) {
          return NextResponse.json({
            serverOk: false,
            expired: true,
            expiredAt: rsv.end_at,
            activePaths: 0,
            totalPaths: 0,
            cameras: [],
            fetchedAt: now.toISOString(),
          });
        }
      }
    } catch (_) {
      // Supabase エラーは無視してフォールスルー
    }
  }
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
