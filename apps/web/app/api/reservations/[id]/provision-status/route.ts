import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id, plan_key, provision_status")
    .eq("id", id)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const { data: job } = await supabase
    .from("provisioning_jobs")
    .select("status, last_error, attempts")
    .eq("reservation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: resource } = await supabase
    .from("reservation_resources")
    .select("data")
    .eq("reservation_id", id)
    .eq("kind", "windows_obs")
    .maybeSingle();

  const rdpData = resource?.data as {
    rdp_host?: string;
    rdp_port?: number;
    username?: string;
    password?: string;
  } | null;

  return NextResponse.json({
    provision_status: reservation.provision_status,
    plan_key: reservation.plan_key,
    job_status: job?.status ?? null,
    job_error: job?.last_error ?? null,
    job_attempts: job?.attempts ?? 0,
    rdp_host: rdpData?.rdp_host ?? null,
    rdp_port: rdpData?.rdp_port ?? null,
    username: rdpData?.username ?? null,
  });
}
