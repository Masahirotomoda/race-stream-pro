import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/app/lib/admin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function createSupabaseServerClient() {
  const cookieStore = await cookies(); // Next.js cookies store
  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        // Supabase SSR 推奨: getAll / setAll
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component から呼ばれる等、書き込み不可のケースは握りつぶし（route handler では通常OK）
          }
        },
      },
    }
  );
}

/**
 * Cookieベース認証またはBearerトークン認証でユーザーを取得する
 * - Cookie認証: Supabase SSR createServerClient を使用（getSession → getUser の順で試行）
 * - Bearer認証: Authorization ヘッダーのアクセストークンを使用
 */
async function getAuthenticatedUser() {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization") ?? "";

  // Authorization: Bearer <token> が提供された場合
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const supabaseAdmin = createClient(
        mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
        mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        { auth: { persistSession: false } }
      );
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) return { user, source: "bearer" };
    }
  }

  // Cookie ベース認証
  const supabase = await createSupabaseServerClient();

  // getSession() でローカルCookieからセッションを取得（外部APIコールなし）
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return { user: session.user, supabase, source: "cookie_session" };
  }

  // getUser() でサーバー検証（外部APIコール、より安全）
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return { user, supabase, source: "cookie_getuser" };
  }

  return null;
}

function parseYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    const v = u.searchParams.get("v");
    if (v) return v;

    if (u.hostname === "youtu.be") {
      const p = u.pathname.split("/").filter(Boolean)[0];
      return p || null;
    }

    const parts = u.pathname.split("/").filter(Boolean);
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && liveIdx + 1 < parts.length) return parts[liveIdx + 1];

    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && shortsIdx + 1 < parts.length) return parts[shortsIdx + 1];

    return null;
  } catch {
    return null;
  }
}

function parseTwitchChannel(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    const parts = u.pathname.split("/").filter(Boolean);
    const ch = parts[0];
    return ch ? ch.toLowerCase() : null;
  } catch {
    return null;
  }
}

let twitchAppTokenCache: { token: string; expiresAt: number } | null = null;

async function getTwitchAppAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (twitchAppTokenCache && twitchAppTokenCache.expiresAt > now + 60_000) {
    return twitchAppTokenCache.token;
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });

  if (!res.ok) return null;
  const json = await res.json() as { access_token: string; expires_in: number; token_type: string };
  twitchAppTokenCache = { token: json.access_token, expiresAt: now + (json.expires_in ?? 0) * 1000 };
  return json.access_token;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const authResult = await getAuthenticatedUser();
  if (!authResult) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const { user } = authResult;

  // DBクエリ用のSupabaseクライアント（Cookie認証がある場合はそれを使用、なければ新規作成）
  const supabase = authResult.supabase ?? await createSupabaseServerClient();

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id,user_id,youtube_broadcast_url,twitch_channel_url")
    .eq("id", id)
    .maybeSingle();

  if (!reservation) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

  const email = user.email || "";
  const admin = email ? isAdmin(email) : false;
  if (!admin && reservation.user_id !== user.id) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const youtubeVideoId = parseYouTubeVideoId(reservation.youtube_broadcast_url);
  const twitchChannel = parseTwitchChannel(reservation.twitch_channel_url);

  // --- YouTube (API key optional)
  let youtube: any = null;
  const ytKey = process.env.YOUTUBE_API_KEY;

  if (youtubeVideoId) {
    youtube = { videoId: youtubeVideoId, live: null, viewerCount: null, startedAt: null, note: null };

    if (!ytKey) {
      youtube.note = "YOUTUBE_API_KEY is not set (viewerCount/live status disabled)";
    } else {
      const u = new URL("https://www.googleapis.com/youtube/v3/videos");
      u.searchParams.set("part", "snippet,liveStreamingDetails");
      u.searchParams.set("id", youtubeVideoId);
      u.searchParams.set("key", ytKey);

      const res = await fetch(u.toString(), { cache: "no-store" });
      if (res.ok) {
        const json = await res.json() as any;
        const item = json?.items?.[0];
        const liveDetails = item?.liveStreamingDetails;
        const snippet = item?.snippet;

        const lbc = snippet?.liveBroadcastContent ?? null; // 'live' | 'upcoming' | 'none'
        youtube.live = lbc === "live";
        youtube.viewerCount = liveDetails?.concurrentViewers ? Number(liveDetails.concurrentViewers) : null;
        youtube.startedAt = liveDetails?.actualStartTime ?? null;
      } else {
        youtube.note = `YouTube videos.list failed: ${res.status}`;
      }
    }
  }

  // --- Twitch (Helix optional)
  let twitch: any = null;
  if (twitchChannel) {
    twitch = { channel: twitchChannel, live: null, viewerCount: null, startedAt: null, note: null };

    const clientId = process.env.TWITCH_CLIENT_ID;
    const appToken = await getTwitchAppAccessToken();
    if (!clientId || !appToken) {
      twitch.note = "TWITCH_CLIENT_ID/SECRET not set (viewerCount/live status disabled)";
    } else {
      const helix = new URL("https://api.twitch.tv/helix/streams");
      helix.searchParams.set("user_login", twitchChannel);

      const res = await fetch(helix.toString(), {
        headers: {
          "Client-Id": clientId,
          "Authorization": `Bearer ${appToken}`,
        },
        cache: "no-store",
      });

      if (res.ok) {
        const json = await res.json() as any;
        const s = json?.data?.[0] ?? null;
        if (s) {
          twitch.live = true;
          twitch.viewerCount = typeof s.viewer_count === "number" ? s.viewer_count : null;
          twitch.startedAt = s.started_at ?? null;
        } else {
          twitch.live = false;
        }
      } else {
        twitch.note = `Twitch helix/streams failed: ${res.status}`;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    reservation: {
      id: reservation.id,
      youtube_broadcast_url: reservation.youtube_broadcast_url ?? null,
      twitch_channel_url: reservation.twitch_channel_url ?? null,
    },
    youtube,
    twitch,
    generatedAt: new Date().toISOString(),
  });
}
