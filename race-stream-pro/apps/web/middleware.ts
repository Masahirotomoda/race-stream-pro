import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/auth/callback",
]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 先に公開パスは素通し（/auth/callback が /login に飛ばされるのを防ぐ）
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // response は最初に1つだけ作る（この response に cookie を set する）
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未認証なら /login（元のURLは next= に入れて戻れるように）
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // /admin は管理者のみ
  if (pathname.startsWith("/admin")) {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);

    const userEmail = (user?.email ?? "").toLowerCase().trim();
    const ok = admins.includes(userEmail);

    if (!ok) {
      return NextResponse.redirect(new URL("/reservations", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};
