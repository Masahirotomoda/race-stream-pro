// apps/web/app/api/mediamtx-auth/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MtxAuthBody = {
  user?: string;
  password?: string;
  ip?: string;
  action?: "publish" | "read" | string;
  path?: string;
  protocol?: "srt" | string;
  query?: string;
};

function minutes(n: number) {
  return n * 60 * 1000;
}

function normalizeStreamId(raw: string) {
  const parts = raw.split(":");
  if (parts[0] === "publish" || parts[0] === "read" || parts[0] === "playback") {
    return parts[1] ?? raw;
  }
  return raw;
}

function mask(s: string, keep = 4) {
  if (!s) return "";
  if (s.length <= keep) return "*".repeat(s.length);
  return "*".repeat(s.length - keep) + s.slice(-keep);
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env missing");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  let body: MtxAuthBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "bad json" }, { status: 400 });
  }

  const protocol = body.protocol ?? "";
  const action = body.action ?? "";
  if (protocol !== "srt" || (action !== "publish" && action !== "read")) {
    return NextResponse.json({ ok: true, skipped: `${protocol}/${action}` });
  }

  const params = new URLSearchParams(body.query ?? "");

  // ★ pathは body.path を最優先（MediaMTXがここに入れてくる）
  const streamPath = normalizeStreamId(body.path ?? params.get("streamid") ?? "");

  // ★ tokenは body.password を最優先（streamid の user:pass の pass がここに来る）
  const token = body.password ?? params.get("passphrase") ?? "";

  if (!streamPath || !token) {
    console.warn("[mediamtx-auth] missing", {
      hasPath: Boolean(streamPath),
      hasPassword: Boolean(body.password),
      hasPassphraseQuery: Boolean(params.get("passphrase")),
    });
    return NextResponse.json({ ok: false, message: "missing streamid/passphrase" }, { status: 401 });
  }

  const allowBeforeMin = Number(process.env.SRT_ALLOW_BEFORE_MINUTES ?? "5");
  const allowAfterMin = Number(
    process.env.SRT_ALLOW_AFTER_MINUTES ?? process.env.OBS_BLOCK_MARGIN_MINUTES ?? "15"
  );

  try {
    const admin = createAdminClient();

    const { data: rr, error: rrErr } = await admin
      .from("reservation_resources")
      .select("reservation_id")
      .eq("kind", "srt")
      .contains("data", { items: [{ streamid: streamPath, passphrase: token }] })
      .maybeSingle();

    if (rrErr || !rr) {
      console.warn("[mediamtx-auth] unauthorized", { streamPath, token: mask(token) });
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { data: rsv, error: rsvErr } = await admin
      .from("reservations")
      .select("id, status, start_at, end_at")
      .eq("id", rr.reservation_id)
      .single();

    if (rsvErr || !rsv) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    if (rsv.status !== "confirmed") {
      return NextResponse.json({ ok: false, message: `status=${rsv.status}` }, { status: 401 });
    }

    const now = Date.now();
    const start = new Date(rsv.start_at).getTime();
    const end = new Date(rsv.end_at).getTime();
    const windowStart = start - minutes(allowBeforeMin);
    const windowEnd = end + minutes(allowAfterMin);

    if (now < windowStart) return NextResponse.json({ ok: false, message: "too early" }, { status: 401 });
    if (now > windowEnd) return NextResponse.json({ ok: false, message: "expired" }, { status: 401 });

    return NextResponse.json({ ok: true, reservation_id: rsv.id });
  } catch (e) {
    console.error("[mediamtx-auth] exception", e);
    return NextResponse.json({ ok: false, message: "server error" }, { status: 500 });
  }
}
