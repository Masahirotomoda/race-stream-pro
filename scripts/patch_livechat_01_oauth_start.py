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
  "apps/web/app/api/oauth/youtube/start/route.ts",
r'''import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function randomState(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/";
  const reservationId = url.searchParams.get("reservationId") || "";

  const cookieStore = await cookies();
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
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname)}`, mustEnv("APP_BASE_URL")));
  }

  const clientId = mustEnv("GOOGLE_OAUTH_CLIENT_ID");
  const baseUrl = mustEnv("APP_BASE_URL");
  const redirectUri = `${baseUrl}/api/oauth/youtube/callback`;

  const csrf = randomState(24);
  cookieStore.set("yt_oauth_csrf", csrf, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: baseUrl.startsWith("https://"),
  });

  const stateObj = { csrf, next, reservationId };
  const state = Buffer.from(JSON.stringify(stateObj), "utf-8").toString("base64url");

  const scope = "https://www.googleapis.com/auth/youtube.readonly";

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
'''
)
