import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components から呼ばれた等、set が禁止されるケースは無視
          }
        },
      },
    }
  );
}

function safeJsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
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
    // URL じゃない入力なら、IDっぽいものだけ許可
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    return null;
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: mustEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: mustEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`refresh_failed:${txt.slice(0, 200)}`);
  }
  return await res.json() as {
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

type ChatMessage = {
  id: string;
  publishedAt: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  displayMessage: string | null;
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: reservationId } = await ctx.params;

    const url = new URL(req.url);
    const pageToken = url.searchParams.get("pageToken") || null;

    const supabase = await createSupabaseServerClient();

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return safeJsonError("unauthorized", 401);

    const admin = isAdmin(user.email);

    // 予約取得（必要に応じて owner チェック）
    const { data: reservation, error: rErr } = await supabase
      .from("reservations")
      .select("id,user_id,youtube_broadcast_url")
      .eq("id", reservationId)
      .single();

    if (rErr || !reservation) return safeJsonError("reservation_not_found", 404);
    if (!admin && reservation.user_id !== user.id) return safeJsonError("forbidden", 403);

    const videoId = parseYouTubeVideoId(reservation.youtube_broadcast_url);
    if (!videoId) {
      return NextResponse.json({
        ok: true,
        linked: true,
        live: false,
        reason: "no_youtube_video_id",
        messages: [],
      }, { headers: { "cache-control": "no-store" } });
    }

    // トークン取得
    const { data: tokenRow, error: tErr } = await supabase
      .from("user_oauth_tokens")
      .select("user_id,provider,access_token,refresh_token,scope,expires_at")
      .eq("user_id", user.id)
      .eq("provider", "youtube")
      .maybeSingle();

    if (tErr) return safeJsonError("token_lookup_failed", 500);
    if (!tokenRow?.access_token) {
      return NextResponse.json({
        ok: true,
        linked: false,
        reason: "not_linked",
      }, { headers: { "cache-control": "no-store" } });
    }

    // 期限切れなら refresh
    let accessToken = tokenRow.access_token as string;
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
    const aboutToExpire = expiresAt && expiresAt < Date.now() + 60_000;

    if (aboutToExpire && tokenRow.refresh_token) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;

      const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 0) * 1000).toISOString();
      await supabase
        .from("user_oauth_tokens")
        .update({
          access_token: accessToken,
          expires_at: newExpiresAt,
          scope: refreshed.scope ?? tokenRow.scope ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("provider", "youtube");
    }

    const authHeader = { authorization: `Bearer ${accessToken}` };

    // 1) videos.list で activeLiveChatId を取得
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
      { headers: authHeader, cache: "no-store" }
    );

    if (!vRes.ok) {
      const txt = await vRes.text();
      return safeJsonError("videos_list_failed", 502, { detail: txt.slice(0, 200) });
    }

    const vJson = await vRes.json();
    const item = vJson?.items?.[0];
    const liveChatId: string | null = item?.liveStreamingDetails?.activeLiveChatId ?? null;

    if (!liveChatId) {
      return NextResponse.json({
        ok: true,
        linked: true,
        live: false,
        reason: "no_active_live_chat",
        videoId,
        messages: [],
      }, { headers: { "cache-control": "no-store" } });
    }

    // 2) liveChatMessages.list
    const chatUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    chatUrl.searchParams.set("liveChatId", liveChatId);
    chatUrl.searchParams.set("part", "snippet,authorDetails");
    chatUrl.searchParams.set("maxResults", "200");
    if (pageToken) chatUrl.searchParams.set("pageToken", pageToken);

    const cRes = await fetch(chatUrl.toString(), { headers: authHeader, cache: "no-store" });

    if (!cRes.ok) {
      const txt = await cRes.text();
      // ここで forbidden/liveChatDisabled/liveChatEnded 等が返ることがある
      // liveChatMessages.list の公式 Errors 参照
      return safeJsonError("live_chat_messages_failed", 502, { detail: txt.slice(0, 250) });
    }

    const cJson = await cRes.json();

    const messages: ChatMessage[] = (cJson.items ?? []).map((m: any) => ({
      id: m.id,
      publishedAt: m?.snippet?.publishedAt ?? null,
      authorName: m?.authorDetails?.displayName ?? null,
      authorAvatarUrl: m?.authorDetails?.profileImageUrl ?? null,
      displayMessage: m?.snippet?.displayMessage ?? null,
    }));

    return NextResponse.json(
      {
        ok: true,
        linked: true,
        live: true,
        videoId,
        liveChatId,
        messages,
        nextPageToken: cJson.nextPageToken ?? null,
        pollingIntervalMillis: cJson.pollingIntervalMillis ?? 2000,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return safeJsonError("internal_error", 500, { detail: String(e?.message ?? e).slice(0, 250) });
  }
}
