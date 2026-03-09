import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cs) {
          cs.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cs.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // ── デバッグログ ──────────────────────────────────────────
  console.log("[middleware] pathname   :", pathname);
  console.log("[middleware] user.email :", user?.email ?? "(none)");
  console.log("[middleware] ADMIN_EMAILS:", process.env.ADMIN_EMAILS ?? "(unset)");

  // 未認証 → /login へ
  if (!user && pathname !== "/login") {
    console.log("[middleware] → redirect /login (unauthenticated)");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // /admin/* は管理者のみ
  if (pathname.startsWith("/admin")) {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);
    const userEmail = (user?.email ?? "").toLowerCase().trim();
    const ok = admins.includes(userEmail);

    console.log("[middleware] admins list:", admins);
    console.log("[middleware] userEmail  :", userEmail);
    console.log("[middleware] isAdmin    :", ok);

    if (!ok) {
      console.log("[middleware] → redirect /reservations (not admin)");
      return NextResponse.redirect(new URL("/reservations", request.url));
    }
    console.log("[middleware] → admin access granted ✅");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\.ico|api/).*)",
  ],
};
