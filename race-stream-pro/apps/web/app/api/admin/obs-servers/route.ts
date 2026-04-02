import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";
import crypto from "node:crypto";

export const runtime = "nodejs";

function randPass(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return null;
  return user;
}

/**
 * GET /api/admin/obs-servers
 * OBSサーバー一覧（secret_key は管理者UIのみ表示するため含む）
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const { data: servers, error } = await admin
    .from("obs_servers")
    .select(`
      id, name, gcp_instance, gcp_zone, gcp_project,
      internal_ip, metrics_port, status,
      assigned_to, rdp_host, rdp_port, rdp_username,
      notes, last_sysprep_at, created_at, updated_at
    `)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 割り当て中の予約情報を付加
  const assignedIds = (servers ?? [])
    .map((s) => s.assigned_to)
    .filter(Boolean) as string[];

  let reservationMap = new Map<string, any>();
  if (assignedIds.length > 0) {
    const { data: reservations } = await admin
      .from("reservations")
      .select("id, name, start_at, end_at, status, plan_key")
      .in("id", assignedIds);
    (reservations ?? []).forEach((r) => reservationMap.set(r.id, r));
  }

  const result = (servers ?? []).map((s) => ({
    ...s,
    assignedReservation: s.assigned_to ? (reservationMap.get(s.assigned_to) ?? null) : null,
  }));

  return NextResponse.json({ items: result });
}

/**
 * POST /api/admin/obs-servers
 * 新しいOBSサーバーを台帳に登録
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const required = ["name", "gcp_instance", "gcp_zone", "gcp_project", "internal_ip", "secret_key"];
  for (const f of required) {
    if (!body[f]) return NextResponse.json({ error: `${f} is required` }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("obs_servers")
    .insert({
      name:         body.name,
      gcp_instance: body.gcp_instance,
      gcp_zone:     body.gcp_zone,
      gcp_project:  body.gcp_project,
      internal_ip:  body.internal_ip,
      metrics_port: body.metrics_port ?? 9090,
      secret_key:   body.secret_key,
      status:       "available",
      rdp_host:     body.rdp_host ?? null,
      rdp_port:     body.rdp_port ?? 3389,
      rdp_username: body.rdp_username ?? "obs",
      rdp_password: randPass(16),
      notes:        body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}
