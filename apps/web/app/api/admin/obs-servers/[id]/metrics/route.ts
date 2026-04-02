import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * GET /api/admin/obs-servers/[id]/metrics
 * 管理者用: 直接 obs_server の MetricsAgent にプロキシ
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: server, error } = await admin
    .from("obs_servers")
    .select("id, name, internal_ip, metrics_port, secret_key, status")
    .eq("id", id)
    .single();

  if (error || !server) {
    return NextResponse.json({ ok: false, error: "Server not found" }, { status: 404 });
  }

  const metricsUrl = `http://${server.internal_ip}:${server.metrics_port}/metrics`;

  try {
    const res = await fetch(metricsUrl, {
      headers: { "x-secret-key": server.secret_key },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `MetricsAgent returned ${res.status}`,
        detail: body.slice(0, 200),
      }, { status: 200 });
    }

    const metrics = await res.json();
    return NextResponse.json({
      ok: true,
      serverName: server.name,
      serverStatus: server.status,
      metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "fetch failed",
      agentUnreachable: true,
    }, { status: 200 });
  }
}
