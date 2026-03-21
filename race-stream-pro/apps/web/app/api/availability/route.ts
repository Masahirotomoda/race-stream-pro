import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustInt(name: string, def: number) {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// UTC instant -> JST "HH:MM"
function fmtTimeJstFromUtcInstant(dUtc: Date): string {
  const j = new Date(dUtc.getTime() + 9 * 60 * 60 * 1000);
  const hh = pad2(j.getUTCHours());
  const mm = pad2(j.getUTCMinutes());
  return `${hh}:${mm}`;
}

// JST day ("YYYY-MM-DD") -> UTC bounds [start,end)
function jstDayBoundsToUtc(dateJst: string) {
  const [y, m, d] = dateJst.split("-").map(Number);
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startUtc = new Date(startUtcMs);
  const endUtc = new Date(startUtcMs + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

export async function GET(req: Request) {
  // login required
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // JST YYYY-MM-DD
  const planKey = url.searchParams.get("planKey") ?? "srt_obs";
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  // availability is only for OBS capacity (srt_obs)
  if (planKey !== "srt_obs") {
    return NextResponse.json(
      { dateJst: date, planKey, capacity: null, slots: [], note: "only srt_obs supported" },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const capacity = mustInt("OBS_MAX_CONCURRENCY", 1);
  const marginMin = mustInt("OBS_BLOCK_MARGIN_MINUTES", 15);
  const slotMin = mustInt("AVAILABILITY_SLOT_MINUTES", 15);

  const { startUtc, endUtc } = jstDayBoundsToUtc(date);

  // fetch candidate reservations (service_role, all users)
  const rangeStartUtc = new Date(startUtc.getTime() - marginMin * 60 * 1000);
  const rangeEndUtc = new Date(endUtc.getTime() + marginMin * 60 * 1000);

  const admin = createAdminClient();
  const { data: reservations, error } = await admin
    .from("reservations")
    .select("id,start_at,end_at,status,plan_key")
    .eq("plan_key", "srt_obs")
    .in("status", ["pending", "confirmed"])
    .lt("start_at", rangeEndUtc.toISOString())
    .gt("end_at", rangeStartUtc.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const slotsPerDay = Math.floor((24 * 60) / slotMin);
  const slots: Array<{ timeJst: string; used: number; available: number; blocked: boolean }> = [];

  for (let i = 0; i < slotsPerDay; i++) {
    const slotStartUtc = new Date(startUtc.getTime() + i * slotMin * 60 * 1000);
    const slotEndUtc = new Date(slotStartUtc.getTime() + slotMin * 60 * 1000);

    const used = (reservations ?? []).filter((r: any) => {
      const rStart = new Date(new Date(r.start_at).getTime() - marginMin * 60 * 1000);
      const rEnd = new Date(new Date(r.end_at).getTime() + marginMin * 60 * 1000);
      return rStart < slotEndUtc && rEnd > slotStartUtc;
    }).length;

    const available = Math.max(0, capacity - used);
    slots.push({
      timeJst: fmtTimeJstFromUtcInstant(slotStartUtc),
      used,
      available,
      blocked: available <= 0,
    });
  }

  return NextResponse.json(
    { dateJst: date, planKey, capacity, marginMin, slotMin, slots },
    { headers: { "cache-control": "no-store" } }
  );
}
