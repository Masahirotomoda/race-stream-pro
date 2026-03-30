"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import CalendarPicker from "@/app/components/CalendarPicker";

type Plan = {
  key: string;
  name: string;
  description: string;
  price_per_15m: number;
};

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function toPickerValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export default function EditReservationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [planKey, setPlanKey] = useState("srt_only");
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [youtubeBroadcastUrl, setYoutubeBroadcastUrl] = useState("");
  const [twitchChannelUrl, setTwitchChannelUrl] = useState("");
  const [obsScene, setObsScene] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const selectedPlan = plans.find(p => p.key === planKey);
  const totalPrice = calcPrice(selectedPlan, startVal, endVal);

  useEffect(() => {
    const sb = supabase();
    Promise.all([
      sb.from("plans").select("*").eq("is_active", true).order("price_per_15m"),
      sb.from("reservations").select("*").eq("id", id).single(),
    ]).then(([plansRes, resRes]) => {
      if (plansRes.data) setPlans(plansRes.data);
      if (resRes.data) {
        const r = resRes.data;
        setName(r.name);
        setPlanKey(r.plan_key);
        setStartVal(toPickerValue(r.start_at));
        setEndVal(toPickerValue(r.end_at));
        setStreamUrl(r.stream_url ?? "");
        setObsScene(r.obs_scene ?? "");
        setNotes(r.notes ?? "");
      }
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())         { setError("予約名を入力してください"); return; }
    if (!startVal || !endVal) { setError("開始・終了日時を選択してください"); return; }
    if (new Date(endVal) <= new Date(startVal)) { setError("終了日時は開始日時より後にしてください"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plan_key: planKey,
          start_at: new Date(startVal).toISOString(),
          end_at:   new Date(endVal).toISOString(),
          stream_url: streamUrl.trim() || null,
          youtube_broadcast_url: youtubeBroadcastUrl.trim() || null,
          twitch_channel_url: twitchChannelUrl.trim() || null,
          obs_scene:  obsScene.trim() || null,
          notes:      notes.trim() || null,
          total_price: totalPrice,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "更新に失敗しました");
      router.push(`/reservations/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "hsl(var(--background))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))" }}>
        読み込み中…
      </div>
    );
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
        <a href={`/reservations/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "none", marginBottom: 24 }}>← 詳細に戻る</a>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "24px 28px 28px" }}>
            <h1 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800 }}>予約を編集</h1>

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

              {/* YouTube URL */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>YouTube 配信URL（任意）</label>
                <input value={youtubeBroadcastUrl} onChange={e => setYoutubeBroadcastUrl(e.target.value)}
                  onFocus={() => setFocused("youtube")} onBlur={() => setFocused(null)}
                  placeholder="https://www.youtube.com/watch?v=xxxxx" style={inputStyle(focused === "youtube")} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>視聴者数・ライブ状態の取得に使用します</div>
              </div>

              {/* Twitch URL */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Twitch チャンネルURL（任意）</label>
                <input value={twitchChannelUrl} onChange={e => setTwitchChannelUrl(e.target.value)}
                  onFocus={() => setFocused("twitch")} onBlur={() => setFocused(null)}
                  placeholder="https://www.twitch.tv/チャンネル名" style={inputStyle(focused === "twitch")} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>視聴者数・ライブ状態の取得に使用します</div>
              </div>

              {/* 配信URL（その他） */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>配信先 URL（その他）</label>
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
              <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
                <a href={`/reservations/${id}`} style={{ flex: 1, padding: "12px 0", borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none", color: "#bbb", border: "1px solid #333", background: "transparent", textAlign: "center" }}>キャンセル</a>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: "12px 0", borderRadius: 6, fontSize: 14, fontWeight: 700, border: "none", background: saving ? "#333" : "linear-gradient(135deg, #e63946, #c1121f)", color: saving ? "#666" : "#fff", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                  {saving ? "保存中…" : `保存する（¥${totalPrice.toLocaleString()}）`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
