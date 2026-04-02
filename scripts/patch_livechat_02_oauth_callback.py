#!/usr/bin/env python3
import os
import pathlib

ROOT = pathlib.Path(os.getenv("RSP_ROOT", pathlib.Path.home() / "projects" / "race-stream-pro"))

def write(rel_path: str, content: str):
    p = ROOT / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("✅ wrote:", p)

write(
  "apps/web/app/api/oauth/youtube/callback/route.ts",
r'''import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type StateObj = { csrf: string; next?: string; reservationId?: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const baseUrl = mustEnv("APP_BASE_URL");
  const cookieStore = await cookies();

  if (err) return NextResponse.redirect(new URL(`/reservations?oauth_error=${encodeURIComponent(err)}`, baseUrl));
  if (!code || !stateRaw) return NextResponse.redirect(new URL(`/reservations?oauth_error=missing_code_or_state`, baseUrl));

  let state: StateObj | null = null;
  try { state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8")); } catch { state = null; }

  const csrfCookie = cookieStore.get("yt_oauth_csrf")?.value;
  if (!state || !csrfCookie || state.csrf !== csrfCookie) {
    return NextResponse.redirect(new URL(`/reservations?oauth_error=bad_state`, baseUrl));
  }

  cookieStore.set("yt_oauth_csrf", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: baseUrl.startsWith("https://") });

  const supabase = createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/reservations")}`, baseUrl));

  const clientId = mustEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = `${baseUrl}/api/oauth/youtube/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return NextResponse.redirect(new URL(`/reservations?oauth_error=token_exchange_failed&detail=${encodeURIComponent(txt.slice(0, 120))}`, baseUrl));
  }

  const token = await tokenRes.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };

  const expiresAt = new Date(Date.now() + (token.expires_in ?? 0) * 1000).toISOString();

  const upsertPayload: any = {
    user_id: user.id,
    provider: "youtube",
    access_token: token.access_token,
    scope: token.scope ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (token.refresh_token) upsertPayload.refresh_token = token.refresh_token;

  const { error } = await supabase
    .from("user_oauth_tokens")
    .upsert(upsertPayload, { onConflict: "user_id,provider" });

  if (error) return NextResponse.redirect(new URL(`/reservations?oauth_error=db_upsert_failed`, baseUrl));

  const next = state.next || (state.reservationId ? `/reservations/${state.reservationId}/live` : "/reservations");
  return NextResponse.redirect(new URL(next, baseUrl));
}
'''
)
