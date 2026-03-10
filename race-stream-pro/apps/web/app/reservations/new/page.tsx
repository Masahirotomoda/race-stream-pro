"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LogoutButton from "@/app/components/LogoutButton";
import CalendarPicker from "@/app/components/CalendarPicker";

type Plan = {
  key: string;
  name: string;
  description: string;
  price_per_15m: number;
};

type AvailabilitySlot = {
  timeJst: string; // "HH:MM"
  used: number;
  available: number;
  blocked: boolean;
};

type AvailabilityResponse = {
  dateJst: string; // "YYYY-MM-DD"
  capacity: number;
  slots: AvailabilitySlot[];
};

const PLAN_COLOR: Record<string, string> = {
  srt_only: "#60a5fa",
  srt_obs: "#f59e0b",
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDuration(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${m}分`;
  if (r === 0) return `${h}時間`;
  return `${h}時間${r}分`;
}

function formatLocalYmdHm(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function calcPrice(plan: Plan | undefined, durationMin: number): number {
  if (!plan || durationMin <= 0) return 0;
  const blocks = Math.floor(durationMin / 15);
  return blocks * plan.price_per_15m;
}

function calcDisabledStartTimes(slots: AvailabilitySlot[], durationMin: number, slotMin = 15) {
  const need = Math.max(1, Math.floor(durationMin / slotMin));
  const disabled: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (i + need > slots.length) {
      disabled.push(slots[i].timeJst);
      continue;
    }
    let ok = true;
    for (let j = 0; j < need; j++) {
      if (slots[i + j].blocked) {
        ok = false;
        break;
      }
    }
    if (!ok) disabled.push(slots[i].timeJst);
  }
  return disabled;
}

function firstFreeStart(slots: AvailabilitySlot[], disabledStartTimes: string[]) {
  const disabled = new Set(disabledStartTimes);
  return slots.find((s) => !disabled.has(s.timeJst))?.timeJst ?? "";
}

export default function NewReservationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [planKey, setPlanKey] = useState("srt_only");

  // new UI: duration first
  const [durationMin, setDurationMin] = useState(60);

  // startVal is "YYYY-MM-DDTHH:MM" (browser local time)
  const [startVal, setStartVal] = useState("");

  const [streamUrl, setStreamUrl] = useState("");
  const [obsScene, setObsScene] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState("");
  const [disabledStartTimes, setDisabledStartTimes] = useState<string[]>([]);

  const selectedPlan = plans.find((p) => p.key === planKey);
  const totalPrice = useMemo(() => calcPrice(selectedPlan, durationMin), [selectedPlan, durationMin]);

  const dateParam = searchParams.get("date") ?? "";
  const selectedDate = (startVal ? startVal.split("T")[0] : "") || dateParam;

  const endVal = useMemo(() => {
    if (!startVal) return "";
    const s = new Date(startVal);
    if (Number.isNaN(s.getTime())) return "";
    const e = new Date(s.getTime() + durationMin * 60 * 1000);
    return formatLocalYmdHm(e);
  }, [startVal, durationMin]);

  // load plans
  useEffect(() => {
    supabase()
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("price_per_15m")
      .then(({ data }) => {
        if (data) setPlans(data as any);
      });
  }, []);

  // fetch availability (only for srt_obs)
  useEffect(() => {
    if (planKey !== "srt_obs" || !selectedDate) {
      setAvailability(null);
      setDisabledStartTimes([]);
      setAvailError("");
      return;
    }

    let cancelled = false;

    (async () => {
      setAvailLoading(true);
      setAvailError("");

      try {
        const res = await fetch(
          `/api/availability?date=${encodeURIComponent(selectedDate)}&planKey=srt_obs`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "availability fetch failed");
        if (cancelled) return;

        const data = json as AvailabilityResponse;
        setAvailability(data);

        const disabled = calcDisabledStartTimes(data.slots ?? [], durationMin, 15);
        setDisabledStartTimes(disabled);

        // Fix: if current time is invalid, move to first available time
        const time = (startVal.split("T")[1] ?? "").slice(0, 5);
        if (time && disabled.includes(time)) {
          const first = firstFreeStart(data.slots ?? [], disabled);
          if (first) setStartVal(`${selectedDate}T${first}`);
        }
      } catch (e: any) {
        if (!cancelled) setAvailError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setAvailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [planKey, selectedDate, durationMin]);

  // if ?date= is given and startVal empty, set to first free
  useEffect(() => {
    if (planKey !== "srt_obs") return;
    if (!dateParam || startVal) return;
    if (!availability) return;
    const first = firstFreeStart(availability.slots ?? [], disabledStartTimes);
    if (first) setStartVal(`${dateParam}T${first}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, disabledStartTimes, dateParam, planKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("予約名を入力してください");
      return;
    }
    if (!startVal) {
      setError("開始日時を選択してください");
      return;
    }
    if (!endVal) {
      setError("終了日時が計算できません（開始日時を確認してください）");
      return;
    }

    // UI guard
    const startTime = (startVal.split("T")[1] ?? "").slice(0, 5);
    if (planKey === "srt_obs" && disabledStartTimes.includes(startTime)) {
      setError("その開始時刻は満席です。別の時刻を選択してください。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plan_key: planKey,
          start_at: new Date(startVal).toISOString(),
          end_at: new Date(endVal).toISOString(),
          stream_url: streamUrl.trim() || null,
          obs_scene: obsScene.trim() || null,
          notes: notes.trim() || null,
          total_price: totalPrice,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "予約の作成に失敗しました");
      router.push("/reservations");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(False)
    } finally {
      setLoading(false);
    }
  }

  const durationOptions = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <header
        style={{
          background: "#111",
          borderBottom: "1px solid #222",
          padding: "0 24px",
          height: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em", color: "#e63946" }}>
            RACE STREAM PRO
          </span>
        </div>
        <LogoutButton />
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <a
          href="/reservations"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "hsl(var(--muted-foreground))",
            textDecoration: "none",
            marginBottom: 24,
          }}
        >
          ← 予約一覧に戻る
        </a>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "visible" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
          <div style={{ padding: "24px 28px 28px" }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>新規予約</h1>
            <div style={{ marginBottom: 20, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              利用時間を選んでから開始日時を選択します
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  予約名 *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocused("name")}
                  onBlur={() => setFocused(null)}
                  placeholder="例）○月○日 レース配信"
                  style={inputStyle(focused === "name")}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  プラン *
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {plans.map((p) => (
                    <label
                      key={p.key}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "14px 16px",
                        background: planKey === p.key ? "rgba(230,57,70,0.06)" : "#1a1a1a",
                        border: `1px solid ${planKey === p.key ? "#e63946" : "#2a2a2a"}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={p.key}
                        checked={planKey === p.key}
                        onChange={() => setPlanKey(p.key)}
                        style={{ marginTop: 2, accentColor: "#e63946" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: PLAN_COLOR[p.key] ?? "#fff" }}>
                            {p.name}
                          </span>
                          <span style={{ fontSize: 13, color: "#e0e0e0" }}>
                            ¥{p.price_per_15m.toLocaleString()}{" "}
                            <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>/ 15分</span>
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>{p.description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  ※ 空き枠制御は srt_obs のみ適用
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  利用時間 *
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <button
    type="button"
    onClick={() => setDurationMin((v) => Math.max(15, v - 15))}
    style={{
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #2a2a2a",
      background: "#1a1a1a",
      color: "#fff",
      cursor: "pointer",
      minWidth: 56,
    }}
  >
    -15
  </button>

  <input
    type="range"
    min={15}
    max={360}
    step={15}
    value={durationMin}
    onChange={(e) => setDurationMin(Number(e.target.value))}
    style={{ flex: 1 }}
  />

  <button
    type="button"
    onClick={() => setDurationMin((v) => Math.min(360, v + 15))}
    style={{
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #2a2a2a",
      background: "#1a1a1a",
      color: "#fff",
      cursor: "pointer",
      minWidth: 56,
    }}
  >
    +15
  </button>

  <div style={{ minWidth: 92, textAlign: "right", fontWeight: 900, color: "#fff" }}>
    {formatDuration(durationMin)}
  </div>
</div>

                <div style={{ marginTop: 8, fontSize: 13, color: "#e0e0e0" }}>
                  料金:{" "}
                  <span style={{ fontWeight: 800, color: "#e63946" }}>
                    {totalPrice.toLocaleString()} 円
                  </span>{" "}
                  {selectedPlan && (
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      （{selectedPlan.price_per_15m}円 / 15分）
                    </span>
                  )}
                </div>
              </div>

              <div>
                <CalendarPicker
                  label="開始日時 *"
                  value={startVal}
                  onChange={(val) => setStartVal(val)}
                  disabledTimes={planKey === "srt_obs" ? disabledStartTimes : undefined}
                
                  timePicker="slider_numeric"/>

                {planKey === "srt_obs" && selectedDate && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "#ddd" }}>
                    {availLoading && <div>空き状況を取得中...</div>}
                    {availError && <div style={{ color: "#ef4444" }}>空き状況エラー: {availError}</div>}
                    {availability && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div>OBS枠: {availability.capacity}</div>
                        <div>
                          この利用時間での最初の空き:{" "}
                          <b>{firstFreeStart(availability.slots ?? [], disabledStartTimes) || "空きなし"}</b>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13, color: "#ddd" }}>
                終了日時（自動計算）: <b>{endVal ? endVal.replace("T", " ") : "-"}</b>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  配信URL（任意）
                </label>
                <input
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  onFocus={() => setFocused("url")}
                  onBlur={() => setFocused(null)}
                  placeholder="YouTube / Twitch など"
                  style={inputStyle(focused === "url")}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  OBSシーン（任意）
                </label>
                <input
                  value={obsScene}
                  onChange={(e) => setObsScene(e.target.value)}
                  onFocus={() => setFocused("obs")}
                  onBlur={() => setFocused(null)}
                  placeholder="例）Scene 1"
                  style={inputStyle(focused === "obs")}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  メモ（任意）
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onFocus={() => setFocused("notes")}
                  onBlur={() => setFocused(null)}
                  rows={3}
                  placeholder="特記事項があれば入力"
                  style={{ ...inputStyle(focused === "notes"), resize: "vertical" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "13px 0",
                  borderRadius: 6,
                  fontSize: 15,
                  fontWeight: 700,
                  border: "none",
                  background: loading ? "#333" : "linear-gradient(135deg, #e63946, #c1121f)",
                  color: loading ? "#666" : "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "送信中…" : `予約を作成（pending）`}
              </button>

              <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                ※ 競合最終チェックはサーバ側（/api/reservations）でも行ってください（UI回避対策）
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
