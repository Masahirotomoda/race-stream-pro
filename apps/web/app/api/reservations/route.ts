import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sendCreatedEmail } from "@/app/lib/email";
import { createAdminClient } from "@/app/lib/supabase/admin-client";
import crypto from "node:crypto";

export const runtime = "nodejs";

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

function mustInt(name: string, def: number) {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function randHex(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function buildSrtUrl(args: { host: string; port: number; streamid: string; passphrase: string }) {
  const q = new URLSearchParams({
    streamid: args.streamid,
    passphrase: args.passphrase,
    mode: "caller",
  });
  return `srt://${args.host}:${args.port}?${q.toString()}`;
}

// GET /api/reservations
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("reservations")
    .select("*, plans(name)")
    .eq("user_id", user.id)
    .order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data });
}

// POST /api/reservations
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const planKey = body.plan_key;
  const startIso = body.start_at; // UI側でISOにして送る想定
  const endIso = body.end_at;

  // ---- OBS枠の競合チェック（srt_obsのみ / pendingも枠消費 / 前後15分ブロック）----
  if (planKey === "srt_obs") {
    const capacity = mustInt("OBS_MAX_CONCURRENCY", 1);
    const marginMin = mustInt("OBS_BLOCK_MARGIN_MINUTES", 15);

    const start = new Date(startIso);
    const end = new Date(endIso);
    const rangeStart = new Date(start.getTime() - marginMin * 60 * 1000).toISOString();
    const rangeEnd = new Date(end.getTime() + marginMin * 60 * 1000).toISOString();

    const admin = createAdminClient();
    const { count, error } = await admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("plan_key", "srt_obs")
      .in("status", ["pending", "confirmed"])
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((count ?? 0) >= capacity) {
      return NextResponse.json(
        { error: "満席のため、この時間帯は予約できません（OBS枠）。" },
        { status: 409 }
      );
    }
  }

  // ---- 予約作成（pendingで仮押さえ）----
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      youtube_broadcast_url: body.youtube_broadcast_url ?? null,
      twitch_channel_url: body.twitch_channel_url ?? null,
      user_id: user.id,
      name: body.name,
      plan_key: planKey,
      start_at: startIso,
      end_at: endIso,
      stream_url: body.stream_url ?? null,
      obs_scene: body.obs_scene ?? null,
      notes: body.notes ?? null,
      total_price: body.total_price,
      camera_count: body.camera_count ?? 1,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ---- SRT ID発行（予約時）----
  try {
    const admin = createAdminClient();
    const maxIds = mustInt("SRT_MAX_IDS_PER_RESERVATION", 5);
    const host = process.env.SRT_PUBLIC_HOST ?? "localhost";
    const port = mustInt("SRT_PUBLIC_PORT", 20000);

    // リクエストの camera_count を優先（未指定は1）
    const requested = Number(body.camera_count ?? 1);
    const cameraCount = Math.min(
      Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1),
      Math.max(1, maxIds)
    );

    const shortId = String(data.id).slice(0, 8);

    const items = Array.from({ length: cameraCount }, (_, i) => {
      const cameraNo = i + 1;
      const streamid = `cam${cameraNo}-${shortId}`;
      const passphrase = randHex(16);
      return {
        camera_index: cameraNo,
        streamid,
        passphrase,
        srt_url: buildSrtUrl({ host, port, streamid, passphrase }),
      };
    });

    await admin
      .from("reservation_resources")
      .upsert(
        {
          reservation_id: data.id,
          kind: "srt",
          data: {
            issued_at: new Date().toISOString(),
            max_ids: Math.max(1, maxIds),
            host,
            port,
            camera_count: cameraCount,
            items,
          },
        },
        { onConflict: "reservation_id,kind" }
      );
  } catch (e: any) {
    console.error("[srt] issue failed:", e?.message ?? e);
  }

  // ---- メール送信（失敗しても予約作成は成功扱い）----
  try {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("key", planKey)
      .single();

    await sendCreatedEmail(user.email!, {
      name: body.name,
      planName: plan?.name ?? planKey,
      startAt: startIso,
      endAt: endIso,
      totalPrice: body.total_price,
      streamUrl: body.stream_url,
      obsScene: body.obs_scene,
      notes: body.notes,
    });
    console.log("[email] reservation created:", user.email);
  } catch (emailErr) {
    console.error("[email] error:", emailErr);
  }

  return NextResponse.json({ item: data }, { status: 201 });
}

function max(a: number, b: number) { return a > b ? a : b; }
