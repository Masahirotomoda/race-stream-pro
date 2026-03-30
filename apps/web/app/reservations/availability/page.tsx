"use client";

import { useEffect, useMemo, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";

type Slot = {
  timeJst: string;
  used: number;
  available: number;
  blocked: boolean;
};

type AvailabilityResponse = {
  dateJst: string;
  planKey: string;
  capacity: number;
  slots: Slot[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayJst(): string {
  const now = new Date();
  const j = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`;
}

function addDaysJst(dateJst: string, days: number): string {
  const [y, m, d] = dateJst.split("-").map(Number);
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const nextUtc = new Date(startUtcMs + days * 24 * 60 * 60 * 1000);
  const j = new Date(nextUtc.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`;
}

function dateLabel(dateJst: string) {
  const [y, m, d] = dateJst.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000);
  const j = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][j.getUTCDay()];
  return `${m}/${d}（${wd}）`;
}

export default function AvailabilityPage() {
  const base = useMemo(() => todayJst(), []);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysJst(base, i)), [base]);

  const [items, setItems] = useState<AvailabilityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resList = await Promise.all(
          dates.map(async (date) => {
            const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}&planKey=srt_obs`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "availability fetch failed");
            return json as AvailabilityResponse;
          })
        );
        if (!cancelled) setItems(resList);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dates]);

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <header style={{ background: "#111", borderBottom: "1px solid #222", padding: "0 24px", height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em", color: "#e63946" }}>RACE STREAM PRO</span>
          <span style={{ fontSize: 12, color: "#aaa", marginLeft: 10 }}>空き枠（OBS）</span>
        </div>
        <LogoutButton />
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>予約可能時間（OBS枠）</h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              pending / confirmed を枠消費として計算し、予約の前後15分もブロックします（JST）。
            </div>
          </div>
          <a href="/reservations" style={{ fontSize: 13, color: "#bbb", textDecoration: "none", border: "1px solid #333", borderRadius: 6, padding: "8px 12px" }}>
            予約一覧へ
          </a>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#ef4444" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>読み込み中…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {items.map((d) => {
              const free = (d.slots ?? []).filter((s) => !s.blocked).length;
              const first = (d.slots ?? []).find((s) => !s.blocked)?.timeJst ?? null;

              return (
                <div key={d.dateJst} style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, transparent)" }} />
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>{dateLabel(d.dateJst)}</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>capacity: {d.capacity}</div>
                  </div>

                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, color: "#bbb" }}>空きスロット数</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: free > 0 ? "#22c55e" : "#ef4444" }}>{free}</div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "#bbb" }}>
                      最初の空き: <b style={{ color: first ? "#fff" : "#888" }}>{first ?? "なし"}</b>
                    </div>

                    <a
                      href={`/reservations/new?date=${encodeURIComponent(d.dateJst)}`}
                      style={{
                        display: "inline-block",
                        marginTop: 12,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#60a5fa",
                        textDecoration: "none",
                        border: "1px solid rgba(96,165,250,0.35)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        background: "rgba(96,165,250,0.08)",
                      }}
                    >
                      この日に予約する →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
