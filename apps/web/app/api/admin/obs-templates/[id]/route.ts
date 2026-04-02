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
 * PUT /api/admin/obs-templates/[id]
 * テンプレート更新。is_active=true にする場合は他を false に変更。
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

  // is_active=true にする場合は他を全て false に
  if (body.is_active === true) {
    await admin
      .from("obs_vm_templates")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", id);
  }

  const allowed = [
    "name", "snapshot_name", "gcp_zone", "gcp_project",
    "machine_type", "disk_size_gb", "metrics_port",
    "secret_key", "rdp_username", "rdp_port", "is_active", "notes",
  ];
  const updateFields: Record<string, any> = {};
  for (const f of allowed) {
    if (f in body) updateFields[f] = body[f];
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("obs_vm_templates")
    .update(updateFields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

/**
 * DELETE /api/admin/obs-templates/[id]
 * テンプレート削除（is_active=true のものは削除不可）
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: tmpl } = await admin
    .from("obs_vm_templates")
    .select("is_active, name")
    .eq("id", id)
    .single();

  if (tmpl?.is_active) {
    return NextResponse.json({
      error: `${tmpl.name} は現在使用中のテンプレートのため削除できません。先に別のテンプレートをアクティブにしてください。`,
    }, { status: 409 });
  }

  const { error } = await admin.from("obs_vm_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
