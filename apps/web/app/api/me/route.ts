import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/app/lib/supabase/admin-client";
import { isAdmin } from "@/app/lib/admin";

export async function GET() {
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = isAdmin(user.email);

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("beta_approved")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    is_admin: admin,
    beta_approved: profile?.beta_approved === true || admin,
  });
}
