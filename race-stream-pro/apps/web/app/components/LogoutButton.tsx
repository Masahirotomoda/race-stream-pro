"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export default function LogoutButton({ style }: { style?: React.CSSProperties }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        fontSize: 13,
        color: "#bbb",
        textDecoration: "none",
        border: "1px solid #333",
        borderRadius: 4,
        padding: "4px 12px",
        background: "transparent",
        cursor: "pointer",
        ...style,
      }}
    >
      ログアウト
    </button>
  );
}
