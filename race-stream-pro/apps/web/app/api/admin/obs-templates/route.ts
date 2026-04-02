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
 * GET /api/admin/obs-templates
 * テンプレート一覧（新しい順）
 */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("obs_vm_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST /api/admin/obs-templates
 * 新しいテンプレートを登録し、is_active=true にする
 * （既存の is_active=true は false に変更）
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const required = ["name", "snapshot_name", "secret_key"];
  for (const f of required) {
    if (!body[f]) return NextResponse.json({ error: `${f} is required` }, { status: 400 });
  }

  const admin = createAdminClient();

  // 既存の is_active を全て false に
  await admin
    .from("obs_vm_templates")
    .update({ is_active: false })
    .eq("is_active", true);

  const { data, error } = await admin
    .from("obs_vm_templates")
    .insert({
      name:          body.name,
      snapshot_name: body.snapshot_name,
      gcp_zone:      body.gcp_zone      ?? "asia-northeast1-c",
      gcp_project:   body.gcp_project   ?? "livestreaming-430703",
      machine_type:  body.machine_type  ?? "n1-standard-4",
      disk_size_gb:  body.disk_size_gb  ?? 100,
      metrics_port:  body.metrics_port  ?? 9090,
      secret_key:    body.secret_key,
      rdp_username:  body.rdp_username  ?? "obs",
      rdp_port:      body.rdp_port      ?? 3389,
      is_active:     true,
      notes:         body.notes         ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}
