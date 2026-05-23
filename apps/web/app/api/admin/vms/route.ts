import { NextResponse } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

/**
 * GET /api/admin/vms
 * windows_obs プランの予約一覧と VM 稼働状況を返す
 */
export async function GET() {
  const supabase = createAdminClient();

  // windows_obs プランの予約を取得
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select(`
      id,
      status,
      provision_status,
      plan_key,
      gcp_instance_name,
      gcp_instance_zone,
      start_at,
      end_at,
      user_id
    `)
    .eq("plan_key", "windows_obs")
    .order("start_at", { ascending: false })
    .limit(50);

  if (resErr) {
    console.error("[api/admin/vms] DB error:", resErr);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // 各予約の RDP 接続情報を取得
  const reservationIds = (reservations ?? []).map((r) => r.id);
  let resourceMap: Record<string, { rdp_host?: string; rdp_port?: number }> = {};

  if (reservationIds.length > 0) {
    const { data: resources } = await supabase
      .from("reservation_resources")
      .select("reservation_id, data")
      .in("reservation_id", reservationIds)
      .eq("kind", "windows_obs");

    for (const r of resources ?? []) {
      const d = r.data as { rdp_host?: string; rdp_port?: number };
      resourceMap[r.reservation_id] = {
        rdp_host: d?.rdp_host,
        rdp_port: d?.rdp_port,
      };
    }
  }

  const result = (reservations ?? []).map((r) => ({
    ...r,
    windows_obs: resourceMap[r.id] ?? null,
  }));

  return NextResponse.json({ reservations: result });
}
