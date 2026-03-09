"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import CalendarPicker from "@/app/components/CalendarPicker";

type Plan = { key: string; name: string; price_per_15m: number };
type Reservation = {
  id: string; name: string; plan_key: string;
  start_at: string; end_at: string;
  stream_url?: string; obs_scene?: string; notes?: string;
  status: string; total_price: number; user_id: string;
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

function calcPrice(plan: Plan | undefined, s: string, e: string): number {
  if (!plan || !s || !e) return 0;
  const diff = (new Date(e).getTime() - new Date(s).getTime()) / (15 * 60 * 1000);
  return diff > 0 ? diff * plan.price_per_15m : 0;
}

function minPlusFifteen(val: string): string {
  const d = new Date(val);
  d.setMinutes(d.getMinutes() + 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_OPTIONS = [
  { value: "pending",   label: "保留中",     color: "#f59e0b" },
  { value: "confirmed", label: "確定",       color: "#22c55e" },
  { value: "cancelled", label: "キャンセル", color: "#ef4444" },
];

const PLAN_COLOR: Record<string, string> = {
  srt_only: "#60a5fa",
  srt_obs:  "#f59e0b",
};

export default function AdminEditReservationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [original, setOriginal] = useState<Reservation | null>(null);
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = plans.find(p => p.key === original?.plan_key);
  const newPrice = calcPrice(selectedPlan, startVal, endVal);
  const originalPrice = original?.total_price ?? 0;
  const priceDiff = newPrice - originalPrice;

  useEffect(() => {
    const sb = supabase();
    Promise.all([
      sb.from("plans").select("*").eq("is_active", true),
      sb.from("reservations").select("*, plans(name, price_per_15m)").eq("id", id).single(),
    ]).then(([plansRes, resRes]) => {
      if (plansRes.data) setPlans(plansRes.data);
      if (resRes.data) {
        const r = resRes.data as Reservation;
        setOriginal(r);
        setStartVal(toPickerValue(r.start_at));
        setEndVal(toPickerValue(r.end_at));
        setStatus(r.status);
      }
      setLoading(false);
    });
  }, [id]);

  async function handleConfirmOnly() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const json = ct.includes("application/json") ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(json?.error ?? raw.slice(0, 200));
      router.push("/admin/reservations");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!startVal || !endVal) { setError("開始・終了日時を選択してください"); return; }
    if (new Date(endVal) <= new Date(startVal)) { setError("終了日時は開始日時より後にしてください"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_at: new Date(startVal).toISOString(),
          end_at:   new Date(endVal).toISOString(),
          total_price: newPrice,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "更新に失敗しました");
      router.push("/admin/reservations");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "削除に失敗しました"); }
      router.push("/admin/reservations");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))" }}>
      読み込み中…
    </div>
  );

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
        <LogoutButton />
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        <a href="/admin/reservations" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "none", marginBottom: 24 }}>← 予約一覧に戻る</a>

        {/* 予約情報カード（読み取り専用） */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "18px 24px" }}>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>予約名</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{original?.name}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: PLAN_COLOR[original?.plan_key ?? ""] ?? "#aaa" }}>
                {plans.find(p => p.key === original?.plan_key)?.name ?? original?.plan_key}
              </span>
              <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
                ¥{original?.plan_key ? (plans.find(p => p.key === original.plan_key)?.price_per_15m ?? 0).toLocaleString() : 0} / 15分
              </span>
            </div>
          </div>
        </div>

        {/* 編集フォーム */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #1e1e1e", fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.08em", textTransform: "uppercase" }}>時間・ステータス変更</div>
          <div style={{ padding: "20px 24px" }}>
            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#ef4444" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

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
                minDatetime={startVal ? minPlusFifteen(startVal) : undefined}
                disabled={!startVal}
              />

              {/* 料金変化プレビュー */}
              {startVal && endVal && (
                <div style={{ background: "#1a1a1a", border: `1px solid ${priceDiff !== 0 ? "rgba(230,57,70,0.3)" : "#2a2a2a"}`, borderRadius: 8, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: priceDiff !== 0 ? 8 : 0 }}>
                    <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>新しい料金</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#e63946" }}>¥{newPrice.toLocaleString()}</span>
                  </div>
                  {priceDiff !== 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #222" }}>
                      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>元の料金</span>
                      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textDecoration: "line-through" }}>¥{originalPrice.toLocaleString()}</span>
                    </div>
                  )}
                  {priceDiff !== 0 && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: priceDiff > 0 ? "#22c55e" : "#ef4444" }}>
                        {priceDiff > 0 ? "+" : ""}¥{priceDiff.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ステータス */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>ステータス</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
                      style={{ flex: 1, padding: "10px 8px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: `1px solid ${status === opt.value ? opt.color : "#2a2a2a"}`, background: status === opt.value ? `${opt.color}20` : "transparent", color: status === opt.value ? opt.color : "#666", cursor: "pointer", transition: "all 0.15s" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 保存ボタン */}
              <button type="submit" disabled={saving}
                style={{ padding: "13px 0", borderRadius: 6, fontSize: 14, fontWeight: 700, border: "none", background: saving ? "#333" : "linear-gradient(135deg, #e63946, #c1121f)", color: saving ? "#666" : "#fff", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                {saving ? "保存中…" : "変更を保存する"}
              </button>
              <button type="button" onClick={handleConfirmOnly} disabled={saving}
                style={{ padding: "13px 0", borderRadius: 6, fontSize: 14, fontWeight: 700, border: "none", background: saving ? "#333" : "linear-gradient(135deg, #e63946, #c1121f)", color: saving ? "#666" : "#fff", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                確定する（日時変更なし）
              </button>              
            </form>
          </div>
        </div>

        {/* 危険操作ゾーン：削除 */}
        <div style={{ background: "#111", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #1e1e1e", fontSize: 13, fontWeight: 700, color: "#ef4444", letterSpacing: "0.08em", textTransform: "uppercase" }}>⚠ 危険な操作</div>
          <div style={{ padding: "20px 24px" }}>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "hsl(var(--muted-foreground))" }}>削除すると元に戻せません。慎重に操作してください。</p>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)}
                style={{ padding: "10px 24px", borderRadius: 6, fontSize: 14, fontWeight: 700, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer" }}>
                この予約を削除する
              </button>
            ) : (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 16 }}>
                <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#ef4444" }}>本当に削除しますか？この操作は取り消せません。</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowDeleteConfirm(false)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid #333", background: "transparent", color: "#bbb", cursor: "pointer" }}>
                    キャンセル
                  </button>
                  <button onClick={handleDelete} disabled={deleting}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", background: "#e63946", color: "hsl(var(--foreground))", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
                    {deleting ? "削除中…" : "削除確定"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
