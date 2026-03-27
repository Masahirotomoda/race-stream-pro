import { createServerClient } from "@supabase/ssr";
import LogoutButton from "@/app/components/LogoutButton";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import CancelButton from "./CancelButton";
import ConnectionInfoPanel from "./ConnectionInfoPanel";

export const dynamic = "force-dynamic";

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: "確定", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  pending:   { label: "保留中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  cancelled: { label: "キャンセル", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

const PLAN_COLOR: Record<string, string> = {
  srt_only: "#60a5fa",
  srt_obs:  "#f59e0b",
};

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const { data: r, error } = await supabase
    .from("reservations")
    .select("*, plans(name, price_per_15m)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !r) notFound();


  const { data: resources } = await supabase
    .from("reservation_resources")
    .select("kind, data")
    .eq("reservation_id", id);

  const byKind = new Map<string, any>();
  (resources ?? []).forEach((x: any) => byKind.set(x.kind, x.data));
  const srt = byKind.get("srt");
  const win = byKind.get("windows_obs");


  const s = STATUS_CONFIG[r.status] ?? { label: r.status, color: "#bbb", bg: "#1a1a1a" };
  const planColor = PLAN_COLOR[r.plan_key] ?? "#9ca3af";
  const planName = r.plans?.name ?? r.plan_key;
  const startDate = new Date(r.start_at);
  const endDate = new Date(r.end_at);
  const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  const rows: [string, React.ReactNode][] = [
    ["予約 ID",   <span key="id"    style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 13 }}>{r.id}</span>],
    ["プラン",    <span key="plan"  style={{ color: planColor, fontWeight: 700 }}>{planName}</span>],
    ["ステータス",<span key="status" style={{ fontSize: 13, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 20, padding: "3px 12px" }}>{s.label}</span>],
    ["開始",      startDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })],
    ["終了",      endDate.toLocaleString("ja-JP",   { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })],
    ["放映時間",  `${durationMin} 分`],
    ["合計金額",  <span key="price" style={{ fontSize: 16, fontWeight: 700, color: "#e63946" }}>¥{r.total_price.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400, color: "#aaa", marginLeft: 4 }}>(税込)</span></span>],
    ...(r.stream_url ? [["配信 URL", <a key="url" href={r.stream_url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: 13 }}>{r.stream_url}</a>] as [string, React.ReactNode]] : []),
    ...(r.obs_scene  ? [["OBS シーン", r.obs_scene]  as [string, React.ReactNode]] : []),
    ...(r.notes      ? [["メモ",       <span key="notes" style={{ whiteSpace: "pre-wrap" }}>{r.notes}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <header style={{ background: "#111", borderBottom: "1px solid #222", padding: "0 24px", height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em", color: "#e63946" }}>RACE STREAM PRO</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#bbb" }}>{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        <a href="/reservations" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "none", marginBottom: 24 }}>← 予約一覧に戻る</a>

        {/* Race event header */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "24px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Race Event</div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{r.name}</h1>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: planColor, border: `1px solid ${planColor}`, borderRadius: 4, padding: "3px 10px", letterSpacing: "0.05em" }}>{planName}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 4, padding: "3px 10px" }}>{s.label}</span>
              </div>
            </div>
            <div style={{ textAlign: "center", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 16px", minWidth: 60 }}>
              <div style={{ fontSize: 13, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em" }}>{startDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", timeZone: "Asia/Tokyo", month: "short" })}</div>
              <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: "hsl(var(--foreground))" }}>{parseInt(startDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", day: "numeric" }))}</div>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{startDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", timeZone: "Asia/Tokyo", weekday: "short" })}</div>
            </div>
          </div>
        </div>

        {/* Detail table */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "14px 28px", borderBottom: "1px solid #1e1e1e", fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase" }}>予約詳細</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([label, value], i) => (
                <tr key={String(label)} style={{ borderBottom: i < rows.length - 1 ? "1px solid #1a1a1a" : "none" }}>
                  <td style={{ padding: "14px 28px", fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", width: 110, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}</td>
                  <td style={{ padding: "14px 28px", fontSize: 14, color: "#e0e0e0" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        
                {/* 接続情報 */}
        <div style={{ background:"#111", border:"1px solid #222", borderRadius:12, overflow:"hidden", marginBottom:24 }}>
          <div style={{ padding:"14px 28px", borderBottom:"1px solid #1e1e1e", fontSize:13, fontWeight:700, color:"#999", letterSpacing:"0.08em", textTransform:"uppercase" }}>
            接続情報
          </div>
          <div style={{ padding:"18px 28px" }}>
            <ConnectionInfoPanel
              srt={srt}
              win={win}
              provisionStatus={r.provision_status}
              planKey={r.plan_key}
            />
          </div>
        </div>

{/* Action buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <a href="/reservations" style={{ padding: "10px 24px", borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none", color: "#bbb", border: "1px solid #333", background: "transparent" }}>一覧に戻る</a>
          {r.status !== "cancelled" && (
            <a href={`/reservations/${id}/edit`} style={{ padding: "10px 24px", borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none", color: "#60a5fa", border: "1px solid #60a5fa44", background: "rgba(96,165,250,0.1)" }}>編集する</a>
          )}
          {r.status !== "cancelled" && (
            <CancelButton reservationId={id} />
          )}
        </div>
      </main>
    
      <div style={{ marginTop: 16, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>配信状態モニター</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
          ライブプレビュー / 視聴者数 / 配信時間を確認できます。
        </div>
        <a href={`/reservations/${id}/monitor`} style={{ display: "inline-block", marginTop: 10, color: "rgba(160,220,255,0.95)", textDecoration: "none", fontSize: 13 }}>
          → モニターを開く
        </a>
      </div>

</div>
  );
}
