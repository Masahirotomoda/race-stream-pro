import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";

function safeTrim(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

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
  const email = user?.email ?? null;
  if (!email || !isAdmin(email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const { data: reservation, error: rErr } = await admin
    .from("reservations")
    .select("id, name, status, plan_key, start_at, end_at, total_price, youtube_broadcast_url, twitch_channel_url, created_at")
    .eq("id", id)
    .single();

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const { data: secretRow, error: sErr } = await admin
    .from("reservation_output_secrets")
    .select("reservation_id, youtube_stream_key, twitch_stream_key, twitch_ingest_server, updated_at")
    .eq("reservation_id", id)
    .maybeSingle();

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({
    reservation,
    outputs: secretRow ?? {
      reservation_id: id,
      youtube_stream_key: null,
      twitch_stream_key: null,
      twitch_ingest_server: process.env.TWITCH_DEFAULT_INGEST_SERVER ?? "rtmp://live.twitch.tv/app",
      updated_at: null,
    },
    defaults: {
      youtube_server_url: process.env.YOUTUBE_RTMPS_SERVER_URL ?? "rtmps://a.rtmps.youtube.com/live2",
      twitch_default_ingest_server: process.env.TWITCH_DEFAULT_INGEST_SERVER ?? "rtmp://live.twitch.tv/app",
    },
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

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
  const email = user?.email ?? null;
  if (!email || !isAdmin(email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));

  const youtube_stream_key = safeTrim(body.youtube_stream_key);
  const twitch_stream_key = safeTrim(body.twitch_stream_key);
  const twitch_ingest_server = safeTrim(body.twitch_ingest_server) ?? (process.env.TWITCH_DEFAULT_INGEST_SERVER ?? "rtmp://live.twitch.tv/app");

  const admin = createAdminClient();

  const payload: any = {
    reservation_id: id,
    youtube_stream_key,
    twitch_stream_key,
    twitch_ingest_server,
  };

  const { data, error } = await admin
    .from("reservation_output_secrets")
    .upsert(payload, { onConflict: "reservation_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, outputs: data });
}
