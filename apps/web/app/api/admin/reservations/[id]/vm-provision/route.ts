import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  return (await supabase.auth.getUser()).data.user;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: reservation, error: resErr } = await admin
    .from("reservations")
    .select("id, plan_key, status, provision_status, gcp_instance_name, gcp_instance_zone")
    .eq("id", id)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.plan_key !== "windows_obs") {
    return NextResponse.json(
      { error: `This plan (${reservation.plan_key}) does not support VM provisioning` },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action: "provision" | "deprovision" = body.action ?? "provision";

  await admin
    .from("reservations")
    .update({ provision_status: "queued" })
    .eq("id", id);

  const { data: job, error: jobErr } = await admin
    .from("provisioning_jobs")
    .insert({
      reservation_id: id,
      action,
      status: "queued",
      run_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobErr) {
    console.error("[vm-provision] Failed to insert job:", jobErr);
    return NextResponse.json({ error: "Failed to queue job" }, { status: 500 });
  }

  if (action === "provision") {
    await admin.from("reservation_resources").upsert(
      {
        reservation_id: id,
        kind: "windows_obs",
        data: {},
      },
      { onConflict: "reservation_id,kind" }
    );
  }

  return NextResponse.json({ job_id: job.id, action, status: "queued" });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: reservation, error: resErr } = await admin
    .from("reservations")
    .select("id, plan_key")
    .eq("id", id)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.plan_key !== "windows_obs") {
    return NextResponse.json({ error: "Not a windows_obs plan" }, { status: 400 });
  }

  await admin
    .from("reservations")
    .update({ provision_status: "queued" })
    .eq("id", id);

  const { data: job, error: jobErr } = await admin
    .from("provisioning_jobs")
    .insert({
      reservation_id: id,
      action: "deprovision",
      status: "queued",
      run_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobErr) {
    return NextResponse.json({ error: "Failed to queue deprovision job" }, { status: 500 });
  }

  return NextResponse.json({ job_id: job.id, action: "deprovision", status: "queued" });
}
