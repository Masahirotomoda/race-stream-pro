"use client";

import { useEffect, useState, useCallback } from "react";

// ── VMテンプレート型定義 ────────────────────────────────────
type ObsVmTemplate = {
  id: string;
  name: string;
  snapshot_name: string;
  gcp_zone: string;
  gcp_project: string;
  machine_type: string;
  disk_size_gb: number;
  metrics_port: number;
  rdp_username: string;
  rdp_port: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

// ── 型定義 ─────────────────────────────────────────────────────
type ObsServerStatus = "available" | "in_use" | "sysprep_needed" | "maintenance" | "error";

type ObsServer = {
  id: string;
  name: string;
  gcp_instance: string;
  gcp_zone: string;
  gcp_project: string;
  internal_ip: string;
  metrics_port: number;
  status: ObsServerStatus;
  assigned_to: string | null;
  rdp_host: string | null;
  rdp_port: number;
  rdp_username: string;
  notes: string | null;
  last_sysprep_at: string | null;
  is_dynamic: boolean;
  vm_instance_name: string | null;
  created_at: string;
  updated_at: string;
  assignedReservation?: {
    id: string;
    name: string;
    start_at: string;
    end_at: string;
    status: string;
  } | null;
};

type Metrics = {
  collectedAt: string;
  uptimeSec: number;
  cpu: { pct: number };
  memory: { totalGb: number; usedGb: number; freeGb: number; pct: number };
  disk: { totalGb: number; usedGb: number; pct: number };
  network: { rxKbps: number; txKbps: number };
  gpu: { available: boolean; gpuPct?: number; vramUsedMb?: number; vramTotalMb?: number };
  obs: { running: boolean; processCpu?: number; memoryMb?: number; pid?: number };
};

// ── ステータス設定 ─────────────────────────────────────────────
const STATUS_CONFIG: Record<ObsServerStatus, { label: string; color: string; bg: string; border: string }> = {
  available:     { label: "利用可能",   color: "#4ade80", bg: "rgba(74,222,128,0.1)",  border: "rgba(74,222,128,0.35)" },
  in_use:        { label: "使用中",     color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.35)" },
  sysprep_needed:{ label: "Sysprep中",  color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.35)" },
  maintenance:   { label: "メンテ中",   color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.35)" },
  error:         { label: "エラー",     color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.35)" },
};

function fmtSeconds(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtBps(kbps: number) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps.toFixed(0)} kbps`;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6, overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

// ── 新規サーバー追加フォーム ─────────────────────────────────
function AddServerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "", gcp_instance: "", gcp_zone: "asia-northeast1-c",
    gcp_project: "livestreaming-430703", internal_ip: "",
    metrics_port: "9090", secret_key: "", rdp_host: "",
    rdp_port: "3389", rdp_username: "obs", notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/admin/obs-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          metrics_port: Number(form.metrics_port),
          rdp_port: Number(form.rdp_port),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録失敗");
      onAdded();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, key: string, placeholder = "", required = false, type = "text") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>
        {label}{required && <span style={{ color: "#f87171" }}> *</span>}
      </label>
      <input
        type={type} value={(form as any)[key]} onChange={set(key)}
        placeholder={placeholder} required={required}
        style={{ width: "100%", padding: "8px 10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>OBSサーバー追加</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          {field("サーバー名", "name", "obsserver-win01", true)}
          {field("GCPインスタンス名", "gcp_instance", "obsserver-win01", true)}
          {field("GCPゾーン", "gcp_zone", "asia-northeast1-c", true)}
          {field("GCPプロジェクト", "gcp_project", "livestreaming-430703", true)}
          {field("内部IP", "internal_ip", "10.146.0.6", true)}
          {field("MetricsPort", "metrics_port", "9090")}
          {field("シークレットキー", "secret_key", "MetricsAgentのRSP_SECRET_KEY", true, "password")}
          {field("RDPホスト (外部IP)", "rdp_host", "34.xx.xx.xx")}
          {field("RDPポート", "rdp_port", "3389")}
          {field("RDPユーザー名", "rdp_username", "obs")}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>メモ</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2}
              style={{ width: "100%", padding: "8px 10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #444", background: "none", color: "#bbb", cursor: "pointer" }}>キャンセル</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#4ade80", color: "#000", fontWeight: 700, cursor: "pointer" }}>
              {loading ? "登録中…" : "登録"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── メトリクスカード ─────────────────────────────────────────
function MetricsPanel({ serverId, serverName }: { serverId: string; serverName: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // admin直接取得（obs_server_idで直接fetch）
      const res = await fetch(`/api/admin/obs-servers/${serverId}/metrics`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "取得失敗");
      setMetrics(json.metrics);
      setErr("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (err) return <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>⚠ {err}</div>;
  if (!metrics && loading) return <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>取得中…</div>;
  if (!metrics) return null;

  const m = metrics;
  const cpuColor = m.cpu.pct > 80 ? "#f87171" : m.cpu.pct > 60 ? "#fbbf24" : "#4ade80";
  const memColor = m.memory.pct > 85 ? "#f87171" : m.memory.pct > 70 ? "#fbbf24" : "#60a5fa";
  const diskColor = m.disk.pct > 90 ? "#f87171" : m.disk.pct > 75 ? "#fbbf24" : "#a78bfa";

  return (
    <div style={{ marginTop: 10, padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888" }}>CPU</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: cpuColor }}>{m.cpu.pct}%</div>
          <Bar pct={m.cpu.pct} color={cpuColor} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888" }}>メモリ</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: memColor }}>{m.memory.pct}%</div>
          <Bar pct={m.memory.pct} color={memColor} />
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{m.memory.usedGb}/{m.memory.totalGb}GB</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888" }}>ディスク</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: diskColor }}>{m.disk.pct}%</div>
          <Bar pct={m.disk.pct} color={diskColor} />
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{m.disk.usedGb}/{m.disk.totalGb}GB</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#888" }}>
        <span>↓ {fmtBps(m.network.rxKbps)}</span>
        <span>↑ {fmtBps(m.network.txKbps)}</span>
        {m.gpu.available && <span>GPU {m.gpu.gpuPct}% / VRAM {m.gpu.vramUsedMb}MB</span>}
        <span>OBS: <span style={{ color: m.obs.running ? "#4ade80" : "#f87171" }}>{m.obs.running ? `稼働中 (${m.obs.memoryMb?.toFixed(0)}MB)` : "停止"}</span></span>
        <span>稼働 {fmtSeconds(m.uptimeSec)}</span>
      </div>
    </div>
  );
}

// ── サーバーカード ───────────────────────────────────────────
function ServerCard({ server, onRefresh }: { server: ObsServer; onRefresh: () => void }) {
  const [showMetrics, setShowMetrics] = useState(false);
  const [updating, setUpdating] = useState(false);
  const cfg = STATUS_CONFIG[server.status] ?? STATUS_CONFIG.error;

  async function updateStatus(status: ObsServerStatus) {
    if (!confirm(`${server.name} のステータスを「${STATUS_CONFIG[status].label}」に変更しますか？`)) return;
    setUpdating(true);
    try {
      await fetch(`/api/admin/obs-servers/${server.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } finally {
      setUpdating(false);
    }
  }

  async function deleteServer() {
    if (!confirm(`${server.name} を台帳から削除しますか？`)) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/obs-servers/${server.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      onRefresh();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div style={{ background: "#111", border: `1px solid ${cfg.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>🖥️ {server.name}</span>
            {server.is_dynamic && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(167,139,250,0.15)", color: "#a78bfa", padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(167,139,250,0.3)" }}>
                動的VM
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: "2px 10px" }}>
              {cfg.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.8 }}>
            <span style={{ marginRight: 16 }}>📍 {server.internal_ip}:{server.metrics_port}</span>
            <span style={{ marginRight: 16 }}>☁️ {server.gcp_instance} / {server.gcp_zone}</span>
            {server.last_sysprep_at && (
              <span style={{ marginRight: 16 }}>🔄 最終Sysprep: {new Date(server.last_sysprep_at).toLocaleString("ja-JP")}</span>
            )}
          </div>
          {server.status === "in_use" && server.assignedReservation && (
            <div style={{ marginTop: 6, fontSize: 12, padding: "4px 10px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 6, display: "inline-block" }}>
              📋 使用中: <a href={`/admin/reservations/${server.assignedReservation.id}`} style={{ color: "#60a5fa" }}>{server.assignedReservation.name}</a>
              <span style={{ color: "#888", marginLeft: 8 }}>
                {new Date(server.assignedReservation.end_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} まで
              </span>
            </div>
          )}
          {server.notes && <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{server.notes}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          {/* メトリクス表示ボタン（使用中 or available のみ） */}
          {(server.status === "in_use" || server.status === "available") && (
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #333", background: showMetrics ? "#333" : "none", color: "#bbb", cursor: "pointer", fontSize: 12 }}
            >
              {showMetrics ? "メトリクス非表示" : "📊 メトリクス"}
            </button>
          )}

          {/* ステータス変更ボタン */}
          {server.status === "sysprep_needed" && (
            <button
              onClick={() => updateStatus("available")} disabled={updating}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.1)", color: "#4ade80", cursor: "pointer", fontSize: 12 }}
            >
              ✓ Sysprep完了（手動）
            </button>
          )}
          {(server.status === "available" || server.status === "error") && (
            <button
              onClick={() => updateStatus("maintenance")} disabled={updating}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #444", background: "none", color: "#f87171", cursor: "pointer", fontSize: 12 }}
            >
              🔧 メンテナンス
            </button>
          )}
          {server.status === "maintenance" && (
            <button
              onClick={() => updateStatus("available")} disabled={updating}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.1)", color: "#4ade80", cursor: "pointer", fontSize: 12 }}
            >
              ✓ メンテ終了
            </button>
          )}
          {server.status !== "in_use" && (
            <button
              onClick={deleteServer} disabled={updating}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #333", background: "none", color: "#777", cursor: "pointer", fontSize: 11 }}
            >
              削除
            </button>
          )}
        </div>
      </div>

      {showMetrics && <MetricsPanel serverId={server.id} serverName={server.name} />}
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────
export default function ObsServersPage() {
  const [servers, setServers] = useState<ObsServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [summary, setSummary] = useState({ available: 0, in_use: 0, sysprep: 0, total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/obs-servers");
      const data = await res.json();
      const items: ObsServer[] = data.items ?? [];
      setServers(items);
      setSummary({
        available: items.filter((s) => s.status === "available").length,
        in_use:    items.filter((s) => s.status === "in_use").length,
        sysprep:   items.filter((s) => s.status === "sysprep_needed").length,
        total:     items.length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // 15秒ごと自動更新
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* ヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a href="/admin/dashboard" style={{ color: "#888", textDecoration: "none", fontSize: 13 }}>← 管理ダッシュボード</a>
            </div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 800 }}>🖥️ OBSサーバー管理</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>案B: テンプレートスナップショットから予約ごとに新規VM作成・削除</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#4ade80", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            + サーバー追加
          </button>
        </div>

        {/* サマリー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "合計", value: summary.total,     color: "#e0e0e0" },
            { label: "利用可能", value: summary.available, color: "#4ade80" },
            { label: "使用中", value: summary.in_use,   color: "#60a5fa" },
            { label: "Sysprep中", value: summary.sysprep, color: "#fbbf24" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* サーバーリスト */}
        {loading && servers.length === 0 ? (
          <div style={{ textAlign: "center", color: "#666", padding: 40 }}>読み込み中…</div>
        ) : servers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, background: "#111", borderRadius: 12, border: "1px solid #222" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🖥️</div>
            <div style={{ color: "#888" }}>OBSサーバーが登録されていません</div>
            <button onClick={() => setShowAdd(true)} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 6, border: "none", background: "#4ade80", color: "#000", fontWeight: 700, cursor: "pointer" }}>
              最初のサーバーを追加
            </button>
          </div>
        ) : (
          servers.map((s) => <ServerCard key={s.id} server={s} onRefresh={load} />)
        )}

        {/* VMテンプレート管理セクション */}
        <VmTemplateSection />

        {/* 環境変数設定ガイド */}
        <details style={{ marginTop: 24, background: "#111", border: "1px solid #222", borderRadius: 10 }}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#888", fontWeight: 700 }}>
            ⚙️ 環境変数・設定ガイド
          </summary>
          <div style={{ padding: "0 16px 16px", fontSize: 12, color: "#777" }}>
            <p style={{ margin: "12px 0 6px", color: "#aaa", fontWeight: 700 }}>/opt/rsp-web/.env に追記が必要な変数:</p>
            <pre style={{ background: "#0a0a0a", borderRadius: 6, padding: 12, overflow: "auto", fontSize: 11 }}>{`# gcloud CLI でVM作成・削除を実行する場合は false（デフォルト）
GCP_VM_DISABLED=false

# gcloud CLI がない環境（ローカル開発など）は true
# GCP_VM_DISABLED=true

GCP_PROJECT=livestreaming-430703`}</pre>
            <p style={{ margin: "12px 0 6px", color: "#aaa", fontWeight: 700 }}>初期テンプレート登録（Supabase SQL Editor）:</p>
            <pre style={{ background: "#0a0a0a", borderRadius: 6, padding: 12, overflow: "auto", fontSize: 11 }}>{`INSERT INTO obs_vm_templates (
  name, snapshot_name, gcp_zone, gcp_project,
  machine_type, disk_size_gb, metrics_port,
  secret_key, rdp_username, rdp_port, is_active, notes
) VALUES (
  'OBS Template v1 (2026-03-31)',
  'obsserver-win01-asia-northeast1-c-20260331064023-iwc1ql1t',
  'asia-northeast1-c', 'livestreaming-430703',
  'n1-standard-4', 100, 9090,
  'YOUR_SECRET_KEY', 'obs', 3389, true,
  'OBS Studio + MetricsAgent インストール済み'
);`}</pre>
          </div>
        </details>
      </div>

      {showAdd && <AddServerModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

// ── VMテンプレート管理セクション ────────────────────────────
function VmTemplateSection() {
  const [templates, setTemplates] = useState<ObsVmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/obs-templates");
      const data = await res.json();
      setTemplates(data.items ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function activate(id: string) {
    if (!confirm("このテンプレートをアクティブにしますか？\n現在アクティブなテンプレートは非アクティブになります。")) return;
    const res = await fetch(`/api/admin/obs-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (res.ok) load();
    else setErr((await res.json()).error ?? "切り替え失敗");
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const res = await fetch(`/api/admin/obs-templates/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setErr((await res.json()).error ?? "削除失敗");
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>🖼️ VMテンプレート管理</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>新規VM作成に使うスナップショットを管理します（is_active = 使用中）</div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#a78bfa", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
        >
          + テンプレート追加
        </button>
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}

      {loading && templates.length === 0 ? (
        <div style={{ color: "#666", fontSize: 13 }}>読み込み中…</div>
      ) : templates.length === 0 ? (
        <div style={{ background: "#111", border: "1px dashed #333", borderRadius: 10, padding: 20, textAlign: "center", color: "#666", fontSize: 13 }}>
          テンプレートが登録されていません。「+ テンプレート追加」から登録してください。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <div key={t.id} style={{
              background: "#111",
              border: `1px solid ${t.is_active ? "rgba(167,139,250,0.5)" : "#222"}`,
              borderRadius: 10,
              padding: "12px 16px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              alignItems: "start",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: t.is_active ? "#a78bfa" : "#e0e0e0" }}>
                    {t.name}
                  </span>
                  {t.is_active && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(167,139,250,0.2)", color: "#a78bfa", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(167,139,250,0.4)" }}>
                      ✅ 使用中
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", wordBreak: "break-all" }}>
                  📷 {t.snapshot_name}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>
                  {t.machine_type} / {t.disk_size_gb}GB / port {t.metrics_port} / {t.gcp_zone}
                </div>
                {t.notes && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>📝 {t.notes}</div>}
                <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>登録: {new Date(t.created_at).toLocaleString("ja-JP")}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!t.is_active && (
                  <button
                    onClick={() => activate(t.id)}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.5)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                  >
                    アクティブに
                  </button>
                )}
                {!t.is_active && (
                  <button
                    onClick={() => deleteTemplate(t.id, t.name)}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.08)", color: "#f87171", cursor: "pointer", fontSize: 11 }}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddTemplateModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

// ── テンプレート追加モーダル ──────────────────────────────────
function AddTemplateModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "",
    snapshot_name: "obsserver-win01-asia-northeast1-c-20260331064023-iwc1ql1t",
    gcp_zone: "asia-northeast1-c",
    gcp_project: "livestreaming-430703",
    machine_type: "n1-standard-4",
    disk_size_gb: "100",
    metrics_port: "9090",
    secret_key: "",
    rdp_username: "obs",
    rdp_port: "3389",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/admin/obs-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          disk_size_gb: Number(form.disk_size_gb),
          metrics_port: Number(form.metrics_port),
          rdp_port: Number(form.rdp_port),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録失敗");
      onAdded();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, key: string, placeholder = "", required = false, type = "text") => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>
        {label}{required && <span style={{ color: "#f87171" }}> *</span>}
      </label>
      <input
        type={type} value={(form as any)[key]} onChange={set(key)}
        placeholder={placeholder} required={required}
        style={{ width: "100%", padding: "7px 10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#e0e0e0", fontSize: 12, boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>🖼️ VMテンプレート追加</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 14, padding: "8px 10px", background: "rgba(167,139,250,0.08)", borderRadius: 6, border: "1px solid rgba(167,139,250,0.2)" }}>
          登録すると自動的に<strong style={{ color: "#a78bfa" }}>アクティブ（使用中）</strong>になります。<br />
          既存のアクティブテンプレートは非アクティブになります。
        </div>
        <form onSubmit={submit}>
          {field("テンプレート名", "name", "OBS Template v2 (2026-04-15)", true)}
          {field("GCPスナップショット名", "snapshot_name", "obsserver-win01-asia-northeast1-c-...", true)}
          {field("MetricsAgent シークレットキー", "secret_key", "RSP_SECRET_KEY の値", true, "password")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {field("GCPゾーン", "gcp_zone", "asia-northeast1-c", true)}
            {field("GCPプロジェクト", "gcp_project", "livestreaming-430703", true)}
            {field("マシンタイプ", "machine_type", "n1-standard-4")}
            {field("ディスクGB", "disk_size_gb", "100")}
            {field("MetricsPort", "metrics_port", "9090")}
            {field("RDPポート", "rdp_port", "3389")}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>メモ</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2}
              style={{ width: "100%", padding: "7px 10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#e0e0e0", fontSize: 12, boxSizing: "border-box", resize: "vertical" }} />
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #444", background: "none", color: "#bbb", cursor: "pointer", fontSize: 13 }}>キャンセル</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#a78bfa", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {loading ? "登録中…" : "登録してアクティブに"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
