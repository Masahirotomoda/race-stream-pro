import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      `Supabase admin client: 環境変数が未設定です。\n` +
      `  NEXT_PUBLIC_SUPABASE_URL: ${url ? "✅" : "❌ 未設定"}\n` +
      `  SUPABASE_SERVICE_ROLE_KEY: ${key ? "✅" : "❌ 未設定"}`
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
