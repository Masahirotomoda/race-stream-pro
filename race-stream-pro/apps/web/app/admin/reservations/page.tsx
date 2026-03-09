import { createServerClient } from "@supabase/ssr";
import LogoutButton from "@/app/components/LogoutButton";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
  return (await supabase.auth.getUser()).data.user;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: "確定",       color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  pending:   { label: "保留中",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  cancelled: { label: "キャンセル", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

const PLAN_COLOR: Record<string, string> = {
  srt_only: "#60a5fa",
  srt_obs:  "#f59e0b",
};

export default async function AdminReservationsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.email)) redirect("/reservations");

  const admin = createAdminClient();

  // 全ユーザーの予約を取得（RLS bypass）
  const { data: reservations } = await admin
    .from("reservations")
    .select("*, plans(name)")
    .order("start_at", { ascending: false });

  // ユーザー情報を取得
  const { data: usersData } = await admin.auth.admin.listUsers();
  const userMap = new Map(usersData?.users.map((u) => [u.id, u.email]) ?? []);

  const items = reservations ?? [];

  const stats = {
    total:     items.length,
    confirmed: items.filter((r) => r.status === "confirmed").length,
    pending:   items.filter((r) => r.status === "pending").length,
    cancelled: items.filter((r) => r.status === "cancelled").length,
    revenue:   items.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.total_price, 0),
  };

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      {/* Header */}
      <header style={{ background: "#111", borderBottom: "1px solid #222", padding: "0 24px", height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🏁</span>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em", color: "#e63946" }}>RACE STREAM PRO</span>
          </div>
          <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", padding: "2px 10px", background: "rgba(230,57,70,0.12)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 20 }}>管理者</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#bbb" }}>{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>予約管理</h1>
          <p style={{ margin: 0, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>全ユーザーの予約を管理します</p>
        </div>

        {/* 統計カード */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
          {[
            { label: "総予約数",   value: stats.total,                    color: "hsl(var(--foreground))" },
            { label: "確定",       value: stats.confirmed,                color: "#22c55e" },
            { label: "保留中",     value: stats.pending,                  color: "#f59e0b" },
            { label: "キャンセル", value: stats.cancelled,                color: "#ef4444" },
            { label: "売上合計",   value: `¥${stats.revenue.toLocaleString()}`, color: "#e63946" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 予約テーブル */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.08em", textTransform: "uppercase" }}>予約一覧</span>
            <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{items.length} 件</span>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#444" }}>予約はありません</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
                    {["予約名", "ユーザー", "プラン", "開始日時", "終了日時", "金額", "ステータス", "操作"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const s = STATUS_CONFIG[r.status] ?? { label: r.status, color: "#888", bg: "#1a1a1a" };
                    const planColor = PLAN_COLOR[r.plan_key] ?? "#9ca3af";
                    const planName = r.plans?.name ?? r.plan_key;
                    const email = userMap.get(r.user_id) ?? r.user_id.slice(0, 8) + "…";
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #161616" }}>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "hsl(var(--foreground))", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#bbb", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: planColor }}>{planName}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#bbb", whiteSpace: "nowrap" }}>
                          {new Date(r.start_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#bbb", whiteSpace: "nowrap" }}>
                          {new Date(r.end_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#e63946", whiteSpace: "nowrap" }}>
                          ¥{r.total_price.toLocaleString()}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>{s.label}</span>
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <a href={`/admin/reservations/${r.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#60a5fa", textDecoration: "none", border: "1px solid #60a5fa44", borderRadius: 4, padding: "4px 12px", background: "rgba(96,165,250,0.08)" }}>編集</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
