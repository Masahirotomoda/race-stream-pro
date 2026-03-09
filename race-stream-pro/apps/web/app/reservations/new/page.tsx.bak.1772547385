"use client";

import { createBrowserClient } from "@supabase/ssr";

import { useEffect, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";
import { useRouter } from "next/navigation";
import CalendarPicker from "@/app/components/CalendarPicker";

type Plan = {
  key: string;
  name: string;
  description: string;
  price_per_15m: number;
};

function calcPrice(plan: Plan | undefined, startVal: string, endVal: string): number {
  if (!plan || !startVal || !endVal) return 0;
  const diff = (new Date(endVal).getTime() - new Date(startVal).getTime()) / (15 * 60 * 1000);
  if (diff <= 0) return 0;
  return diff * plan.price_per_15m;
}

const PLAN_COLOR: Record<string, string> = {
  srt_only: "#60a5fa",
  srt_obs:  "#f59e0b",
};

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "10px 14px",
  background: "#1a1a1a",
  border: `1px solid ${focused ? "#e63946" : "#2a2a2a"}`,
  borderRadius: 6,
  color: "hsl(var(--foreground))",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
});

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function NewReservationPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [planKey, setPlanKey] = useState("srt_only");
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [obsScene, setObsScene] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const selectedPlan = plans.find(p => p.key === planKey);
  const totalPrice = calcPrice(selectedPlan, startVal, endVal);

  useEffect(() => {
    supabase().from("plans").select("*").eq("is_active", true).order("price_per_15m")
      .then(({ data }) => { if (data) setPlans(data); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())         { setError("予約名を入力してください"); return; }
    if (!startVal || !endVal) { setError("開始・終了日時を選択してください"); return; }
    if (new Date(endVal) <= new Date(startVal)) { setError("終了日時は開始日時より後にしてください"); return; }
    setLoading(true); setError("");
    try {
      // メール送信のため直接 Supabase ではなく API ルートを経由する
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        name.trim(),
          plan_key:    planKey,
          start_at:    new Date(startVal).toISOString(),
          end_at:      new Date(endVal).toISOString(),
          stream_url:  streamUrl.trim() || null,
          obs_scene:   obsScene.trim() || null,
          notes:       notes.trim() || null,
          total_price: totalPrice,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "予約の作成に失敗しました");
      router.push("/reservations");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <header style={{ background: "#111", borderBottom: "1px solid #222", padding: "0 24px", height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em", color: "#e63946" }}>RACE STREAM PRO</span>
        </div>
        <LogoutButton />
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
        <a href="/reservations" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "none", marginBottom: 24 }}>← 予約一覧に戻る</a>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "24px 28px 28px" }}>
            <h1 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800 }}>新規予約</h1>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#ef4444" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* 予約名 */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>予約名 *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
                  placeholder="例：第5戦 スーパーフォーミュラ" style={inputStyle(focused === "name")} />
              </div>

              {/* プラン */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>プラン *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {plans.map(p => (
                    <label key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", background: planKey === p.key ? "rgba(230,57,70,0.06)" : "#1a1a1a", border: `1px solid ${planKey === p.key ? "#e63946" : "#2a2a2a"}`, borderRadius: 8, cursor: "pointer", transition: "all 0.15s" }}>
                      <input type="radio" name="plan" value={p.key} checked={planKey === p.key} onChange={() => setPlanKey(p.key)} style={{ marginTop: 2, accentColor: "#e63946" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: PLAN_COLOR[p.key] ?? "#fff" }}>{p.name}</span>
                          <span style={{ fontSize: 13, color: "#e0e0e0" }}>¥{p.price_per_15m.toLocaleString()} <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>/ 15分</span></span>
                        </div>
                        <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>{p.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 開始日時 */}
              <CalendarPicker
                label="開始日時 *"
                value={startVal}
                onChange={val => { setStartVal(val); setEndVal(""); }}
              />

              {/* 終了日時 */}
              <CalendarPicker
                label="終了日時 *"
                value={endVal}
                onChange={setEndVal}
                minDatetime={startVal ? (() => {
                  const d = new Date(startVal);
                  d.setMinutes(d.getMinutes() + 15);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                })() : undefined}
                disabled={!startVal}
              />

              {/* 料金プレビュー */}
              {totalPrice > 0 && (
                <div style={{ background: "rgba(230,57,70,0.06)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 8, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#bbb" }}>料金（自動計算）</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#e63946" }}>¥{totalPrice.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400, color: "#aaa", marginLeft: 4 }}>(税込)</span></span>
                </div>
              )}

              {/* 配信URL */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>配信先 URL</label>
                <input value={streamUrl} onChange={e => setStreamUrl(e.target.value)}
                  onFocus={() => setFocused("url")} onBlur={() => setFocused(null)}
                  placeholder="rtmp://..." style={inputStyle(focused === "url")} />
              </div>

              {/* OBSシーン */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>OBS シーン名</label>
                <input value={obsScene} onChange={e => setObsScene(e.target.value)}
                  onFocus={() => setFocused("obs")} onBlur={() => setFocused(null)}
                  placeholder="メインシーン" style={inputStyle(focused === "obs")} />
              </div>

              {/* メモ */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>メモ・備考</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  onFocus={() => setFocused("notes")} onBlur={() => setFocused(null)}
                  rows={3} placeholder="特記事項があれば入力"
                  style={{ ...inputStyle(focused === "notes"), resize: "vertical" }} />
              </div>

              {/* 送信 */}
              <button type="submit" disabled={loading} style={{ padding: "13px 0", borderRadius: 6, fontSize: 15, fontWeight: 700, border: "none", background: loading ? "#333" : "linear-gradient(135deg, #e63946, #c1121f)", color: loading ? "#666" : "#fff", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                {loading ? "送信中…" : totalPrice > 0 ? `予約する（¥${totalPrice.toLocaleString()}）` : "予約する"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
