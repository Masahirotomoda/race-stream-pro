"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";

type Stats = any;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: 14,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ color: "rgba(255,255,255,0.92)" }}>{children}</div>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: 8,
            borderRadius: 999,
            background: "rgba(255,255,255,0.75)",
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>{pct}%</div>
    </div>
  );
}

function fmt(n: any) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      <span style={{ minWidth: 92 }}>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function StackedBar({ parts }: { parts: Array<{ key: string; label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
        }}
        aria-label="status distribution chart"
      >
        {parts.map((p) => {
          const w = total > 0 ? (p.value / total) * 100 : 0;
          return (
            <div
              key={p.key}
              title={`${p.label}: ${p.value} (${total > 0 ? (w).toFixed(1) : "0"}%)`}
              style={{
                width: `${w}%`,
                background: p.color,
                opacity: p.value > 0 ? 0.95 : 0.25,
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
        total: {total}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string>("");

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 240)}`);
      if (!ct.includes("application/json")) throw new Error(`Non-JSON response: ${raw.slice(0, 240)}`);

      setStats(JSON.parse(raw));
    } catch (e: any) {
      setError(e?.message ?? "stats load failed");
      setStats(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const reservationsTotal = fmt(stats?.reservations?.total);
  const byStatus = stats?.reservations?.byStatus ?? {};
  const byProv = stats?.reservations?.byProvisionStatus ?? {};
  const byJob = stats?.jobs?.byStatus ?? {};

  // 追加: pending/approved/completed/cancelled 分布
  const dist = stats?.reservations?.statusDistribution ?? {};
  const pending = fmt(dist.pending);
  const approved = fmt(dist.approved);
  const completed = fmt(dist.completed);
  const cancelled = fmt(dist.cancelled);

  const parts = [
    { key: "pending", label: "pending（未承認）", value: pending, color: "rgba(255, 203, 59, 0.95)" },
    { key: "approved", label: "approved（承認済み）", value: approved, color: "rgba(83, 209, 255, 0.95)" },
    { key: "completed", label: "completed（完了）", value: completed, color: "rgba(95, 255, 167, 0.95)" },
    { key: "cancelled", label: "cancelled（キャンセル）", value: cancelled, color: "rgba(255, 95, 95, 0.95)" },
  ];

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Admin Dashboard</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            generatedAt: {stats?.generatedAt ?? "—"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={load}
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.9)",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
          <LogoutButton />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,80,80,0.45)",
            background: "rgba(255,80,80,0.10)",
            color: "rgba(255,220,220,0.95)",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <Card title="予約（総数）">
          <div style={{ fontSize: 28, fontWeight: 900 }}>{reservationsTotal}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            pending {byStatus.pending ?? 0} / confirmed {byStatus.confirmed ?? 0} / cancelled {byStatus.cancelled ?? 0}
          </div>
        </Card>

        <Card title="売上合計（total_price 合算）">
          <div style={{ fontSize: 28, fontWeight: 900 }}>
            ¥{Number(stats?.reservations?.revenueYen ?? 0).toLocaleString("ja-JP")}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            upcoming confirmed: {stats?.reservations?.upcomingConfirmed ?? 0}
          </div>
        </Card>

        <Card title="ユーザー数（Supabase Auth）">
          <div style={{ fontSize: 28, fontWeight: 900 }}>
            {stats?.users?.total ?? "—"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            {stats?.users?.capped ? "（上限に達しました。集計方法の見直し推奨）" : "（ページングで集計）"}
          </div>
        </Card>

        {/* 追加カード: ステータス分布グラフ */}
        <Card title="予約ステータス別分布（pending / approved / completed / cancelled）">
          <StackedBar parts={parts} />
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <LegendItem color={parts[0].color} label={parts[0].label} value={pending} />
            <LegendItem color={parts[1].color} label={parts[1].label} value={approved} />
            <LegendItem color={parts[2].color} label={parts[2].label} value={completed} />
            <LegendItem color={parts[3].color} label={parts[3].label} value={cancelled} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            ※ approved = confirmed かつ未終了 / completed = confirmed かつ終了済み（DB変更なしで算出）
          </div>
        </Card>

        <Card title="Provision 状態（ready率）">
          <div style={{ fontSize: 14 }}>
            ready {byProv.ready ?? 0} / queued {byProv.queued ?? 0} / running {byProv.running ?? 0} / failed {byProv.failed ?? 0}
          </div>
          <Bar value={fmt(byProv.ready)} max={reservationsTotal} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
            readyRate: {stats?.reservations?.readyRatePercent ?? 0}%
          </div>
        </Card>

        <Card title="ジョブキュー">
          <div style={{ fontSize: 14 }}>
            queued {byJob.queued ?? 0} / running {byJob.running ?? 0} / succeeded {byJob.succeeded ?? 0} / failed {byJob.failed ?? 0}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            stale running: {stats?.jobs?.staleRunning ?? 0}
          </div>
        </Card>

        <Card title="リソース使用状況（reservation_resources）">
          <div style={{ fontSize: 14 }}>total {stats?.resources?.total ?? 0}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            srt {stats?.resources?.byKind?.srt ?? 0} / windows_obs {stats?.resources?.byKind?.windows_obs ?? 0}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="直近10件 予約">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.7)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>id</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>status</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>prov</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>¥</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recent?.reservations ?? []).map((r: any) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.id}</td>
                    <td style={{ padding: "6px 8px" }}>{r.status}</td>
                    <td style={{ padding: "6px 8px" }}>{r.provision_status}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
                      {Number(r.total_price ?? 0).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="直近10件 ジョブ">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.7)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>id</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>action</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>status</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>attempts</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recent?.jobs ?? []).map((j: any) => (
                  <tr key={j.id} style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{j.id}</td>
                    <td style={{ padding: "6px 8px" }}>{j.action}</td>
                    <td style={{ padding: "6px 8px" }}>{j.status}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{j.attempts ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
