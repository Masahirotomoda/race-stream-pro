import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function signOutHandler() {
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
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
  );
}

// GET でも POST でもログアウトできるように両方対応
export const GET  = signOutHandler;
export const POST = signOutHandler;
