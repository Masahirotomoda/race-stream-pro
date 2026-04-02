import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const MEDIAMTX_API = process.env.MEDIAMTX_API_URL ?? "http://10.146.0.9:9997";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}

export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get("reservationId");
  const suffix = reservationId ? `-${reservationId.slice(0, 8)}` : "";

  // 予約終了日時チェック: reservationId がある場合、Supabase から end_at を取得
  if (reservationId) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: reservation } = await supabase
        .from("reservations")
        .select("id, start_at, end_at, status")
        .eq("id", reservationId)
        .maybeSingle();

      if (reservation) {
        const now = new Date();
        const endAt = reservation.end_at ? new Date(reservation.end_at) : null;
        const startAt = reservation.start_at ? new Date(reservation.start_at) : null;

        // 予約期間終了後はSRTサーバーをOFFLINE扱いにする
        if (endAt && now > endAt) {
          return NextResponse.json({
            serverOk: false,
            activePaths: 0,
            totalPaths: 0,
            cameras: [],
            fetchedAt: new Date().toISOString(),
            reservationEnded: true,
            error: `予約期間終了 (${endAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })})`,
          });
        }

        // 予約開始前もSRTは非アクティブ
        if (startAt && now < startAt) {
          return NextResponse.json({
            serverOk: false,
            activePaths: 0,
            totalPaths: 0,
            cameras: [],
            fetchedAt: new Date().toISOString(),
            reservationNotStarted: true,
            error: `予約開始前 (${startAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 開始)`,
          });
        }
      }
    } catch {
      // Supabase チェック失敗時はMediaMTX APIのみで応答（フォールスルー）
    }
  }

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
