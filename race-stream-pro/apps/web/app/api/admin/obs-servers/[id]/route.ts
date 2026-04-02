import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";

async function requireAdmin() {
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
  if (!user || !isAdmin(user.email)) return null;
  return user;
}

/**
 * GET /api/admin/obs-servers/[id]
 * サーバー詳細（secret_key 含む）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("obs_servers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ item: data });
}

/**
 * PUT /api/admin/obs-servers/[id]
 * サーバー情報更新（status 含む）
 * status を 'available' に戻す（Sysprep完了後の手動 or 自動操作）
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  const allowedStatuses = ["available", "in_use", "sysprep_needed", "maintenance", "error"];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updateFields: Record<string, any> = {};
  const allowed = [
    "name", "gcp_instance", "gcp_zone", "gcp_project", "internal_ip",
    "metrics_port", "secret_key", "status", "rdp_host", "rdp_port",
    "rdp_username", "rdp_password", "notes",
  ];
  for (const f of allowed) {
    if (f in body) updateFields[f] = body[f];
  }

  // status が available に戻る場合、assigned_to をクリア・last_sysprep_at 更新
  if (body.status === "available") {
    updateFields.assigned_to = null;
    updateFields.last_sysprep_at = new Date().toISOString();
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("obs_servers")
    .update(updateFields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

/**
 * DELETE /api/admin/obs-servers/[id]
 * サーバーを台帳から削除（使用中は不可）
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();

  // 使用中チェック
  const { data: server } = await admin
    .from("obs_servers")
    .select("status, name")
    .eq("id", id)
    .single();

  if (server?.status === "in_use") {
    return NextResponse.json({
      error: `${server.name} は現在使用中のため削除できません`,
    }, { status: 409 });
  }

  const { error } = await admin.from("obs_servers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
