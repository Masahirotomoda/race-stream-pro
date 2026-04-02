import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: any }[]) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * GET /api/system-metrics?reservationId=xxx
 *
 * 対象予約の obs_server を特定し、MetricsAgent にプロキシして返す。
 * 認証: 管理者 OR 予約オーナー
 */
export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get("reservationId");
  if (!reservationId) {
    return NextResponse.json({ ok: false, error: "reservationId is required" }, { status: 400 });
  }

  // ── 認証 ─────────────────────────────────────────────────
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 予約取得（オーナー or 管理者チェック）─────────────────
  const { data: reservation, error: rErr } = await admin
    .from("reservations")
    .select("id, user_id, plan_key, status, start_at, end_at")
    .eq("id", reservationId)
    .maybeSingle();

  if (rErr || !reservation) {
    return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  }

  const userEmail = user.email ?? "";
  const admin_ = isAdmin(userEmail);
  if (!admin_ && reservation.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // ── OBSプランでない場合は非対応 ──────────────────────────
  if (reservation.plan_key !== "srt_obs") {
    return NextResponse.json({
      ok: false,
      error: "This reservation does not include an OBS server",
      plan_key: reservation.plan_key,
    }, { status: 400 });
  }

  // ── 予約期間チェック ──────────────────────────────────────
  const now = new Date();
  const endAt = reservation.end_at ? new Date(reservation.end_at) : null;
  if (endAt && now > endAt) {
    return NextResponse.json({
      ok: false,
      error: "Reservation has ended",
      reservationEnded: true,
    }, { status: 200 });
  }

  // ── 割り当て中の obs_server を取得 ────────────────────────
  const { data: obsServer, error: sErr } = await admin
    .from("obs_servers")
    .select("id, name, internal_ip, metrics_port, secret_key, status")
    .eq("assigned_to", reservationId)
    .maybeSingle();

  if (sErr) {
    return NextResponse.json({ ok: false, error: "DB error: " + sErr.message }, { status: 500 });
  }

  if (!obsServer) {
    return NextResponse.json({
      ok: false,
      error: "No OBS server assigned to this reservation",
      notAssigned: true,
    }, { status: 200 });
  }

  // ── MetricsAgent にプロキシ ───────────────────────────────
  const metricsUrl = `http://${obsServer.internal_ip}:${obsServer.metrics_port}/metrics`;

  try {
    const metricsRes = await fetch(metricsUrl, {
      headers: { "x-secret-key": obsServer.secret_key },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!metricsRes.ok) {
      const body = await metricsRes.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `MetricsAgent returned ${metricsRes.status}`,
        detail: body.slice(0, 200),
        serverName: obsServer.name,
      }, { status: 200 });
    }

    const metrics = await metricsRes.json();
    return NextResponse.json({
      ok: true,
      serverName: obsServer.name,
      serverStatus: obsServer.status,
      metrics,
      fetchedAt: new Date().toISOString(),
    });

  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "fetch failed",
      serverName: obsServer.name,
      agentUnreachable: true,
    }, { status: 200 });
  }
}
