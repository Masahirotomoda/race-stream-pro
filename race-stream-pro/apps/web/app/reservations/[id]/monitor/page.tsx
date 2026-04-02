"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";

// ─── 既存の型 ───────────────────────────────────────────
type ApiResp = any;

// ─── SRTモニター用の型 ──────────────────────────────────
type SrtCamera = {
  cameraIndex: number;
  path: string;
  ready: boolean;
  readyTime: string | null;
  tracks: string[];
  bytesReceived: number;
  readerCount: number;
  remoteAddr: string | null;
  pktLostPct: string | null;
};

type SrtStatus = {
  serverOk: boolean;
  activePaths: number;
  totalPaths: number;
  cameras: SrtCamera[];
  fetchedAt: string;
  error?: string;
  reservationEnded?: boolean;
  reservationNotStarted?: boolean;
};

// ─── ユーティリティ ────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 14, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginBottom: 8 }}>{title}</div>
      <div style={{ color: "rgba(255,255,255,0.92)" }}>{children}</div>
    </div>
  );
}

function fmtSeconds(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtBps(bps: number) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
  return `${bps} bps`;
}

function parseYTVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v) return v;
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/").filter(Boolean)[0] ?? null;
    const parts = u.pathname.split("/").filter(Boolean);
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && liveIdx + 1 < parts.length) return parts[liveIdx + 1];
    return null;
  } catch { return null; }
}

function parseTwitchChannel(url: string): string | null {
  try {
    const u = new URL(url);
    const ch = u.pathname.split("/").filter(Boolean)[0];
    if (!ch || ch === "videos") return null;
    return ch.toLowerCase();
  } catch { return null; }
}

// ─── SRTカメラカードコンポーネント ──────────────────────
function SrtCameraCard({ cam, bps, now }: { cam: SrtCamera; bps: number | null; now: number }) {
  const elapsed = cam.readyTime ? (now - Date.parse(cam.readyTime)) / 1000 : null;
  const statusColor = cam.ready ? "#4ade80" : "rgba(255,255,255,0.35)";
  const statusLabel = cam.ready ? "● LIVE" : "○ OFFLINE";

  return (
    <div style={{
      border: `1px solid ${cam.ready ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.10)"}`,
      borderRadius: 10,
      padding: 12,
      background: cam.ready ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.02)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Camera {cam.cameraIndex}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", lineHeight: 2.0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 10px" }}>
          <span>ビットレート</span>
          <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 600 }}>
            {bps != null ? fmtBps(bps) : cam.ready ? "計測中…" : "—"}
          </span>
          <span>コーデック</span>
          <span style={{ color: "rgba(255,255,255,0.92)" }}>
            {cam.tracks.length > 0 ? cam.tracks.join(" + ") : "—"}
          </span>
          <span>接続時間</span>
          <span style={{ color: "rgba(255,255,255,0.92)" }}>
            {elapsed != null ? fmtSeconds(elapsed) : "—"}
          </span>
          <span>パケットロス</span>
          <span style={{ color: cam.pktLostPct && parseFloat(cam.pktLostPct) > 1 ? "#f87171" : "rgba(255,255,255,0.92)" }}>
            {cam.pktLostPct != null ? `${cam.pktLostPct}%` : "—"}
          </span>
          <span>受信側(OBS)</span>
          <span style={{ color: "rgba(255,255,255,0.92)" }}>
            {cam.readerCount > 0 ? `${cam.readerCount} 接続中` : "未接続"}
          </span>
          <span>送信元IP</span>
          <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 11 }}>
            {cam.remoteAddr ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── OBSメトリクスパネル ──────────────────────────────
type ObsMetrics = {
  ok: boolean;
  serverName?: string;
  serverStatus?: string;
  error?: string;
  notAssigned?: boolean;
  agentUnreachable?: boolean;
  reservationEnded?: boolean;
  metrics?: {
    collectedAt: string;
    uptimeSec: number;
    cpu: { pct: number };
    memory: { totalGb: number; usedGb: number; pct: number };
    disk: { totalGb: number; usedGb: number; pct: number };
    network: { rxKbps: number; txKbps: number };
    gpu: { available: boolean; gpuPct?: number; vramUsedMb?: number; vramTotalMb?: number };
    obs: { running: boolean; processCpu?: number; memoryMb?: number };
  };
};

function ObsBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6, overflow: "hidden", marginTop: 3 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

function fmtKbps(kbps: number) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps.toFixed(0)} kbps`;
}

function ObsMetricsPanel({ reservationId, planKey }: { reservationId: string; planKey: string | null }) {
  const [obs, setObs] = useState<ObsMetrics | null>(null);

  useEffect(() => {
    if (planKey !== "srt_obs") return;

    async function loadObs() {
      try {
        const res = await fetch(`/api/system-metrics?reservationId=${reservationId}`, { cache: "no-store" });
        const json = await res.json();
        setObs(json);
      } catch {
        setObs({ ok: false, error: "fetch failed" });
      }
    }

    loadObs();
    const t = window.setInterval(loadObs, 10000);
    return () => window.clearInterval(t);
  }, [reservationId, planKey]);

  if (planKey !== "srt_obs") return null;
  if (!obs) return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>🖥️ OBSサーバー状態</div>
      <div style={{ padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", fontSize: 13, color: "#888" }}>確認中…</div>
    </div>
  );

  const m = obs.metrics;
  const cpuColor = (m?.cpu.pct ?? 0) > 80 ? "#f87171" : (m?.cpu.pct ?? 0) > 60 ? "#fbbf24" : "#4ade80";
  const memColor = (m?.memory.pct ?? 0) > 85 ? "#f87171" : (m?.memory.pct ?? 0) > 70 ? "#fbbf24" : "#60a5fa";
  const diskColor = (m?.disk.pct ?? 0) > 90 ? "#f87171" : (m?.disk.pct ?? 0) > 75 ? "#fbbf24" : "#a78bfa";

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>🖥️ OBSサーバー状態</div>
      <div style={{
        padding: 14, borderRadius: 12,
        border: `1px solid ${obs.ok ? "rgba(96,165,250,0.35)" : "rgba(255,80,80,0.35)"}`,
        background: obs.ok ? "rgba(96,165,250,0.04)" : "rgba(255,80,80,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: obs.ok && m ? 14 : 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: obs.ok ? "#60a5fa" : "#f87171" }}>
            {obs.ok ? `● ${obs.serverName ?? "OBSサーバー"}` : "○ 未接続"}
          </span>
          {obs.ok && obs.serverStatus && (
            <span style={{ fontSize: 12, color: "#888" }}>{obs.serverStatus}</span>
          )}
          {!obs.ok && obs.notAssigned && (
            <span style={{ fontSize: 12, color: "#888" }}>OBSサーバーが割り当て中です（プロビジョニング待ち）</span>
          )}
          {!obs.ok && obs.agentUnreachable && (
            <span style={{ fontSize: 12, color: "#f87171" }}>MetricsAgent に接続できません</span>
          )}
          {!obs.ok && obs.error && !obs.notAssigned && !obs.agentUnreachable && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{obs.error}</span>
          )}
        </div>
        {obs.ok && m && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#888" }}>CPU</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: cpuColor }}>{m.cpu.pct}%</div>
                <ObsBar pct={m.cpu.pct} color={cpuColor} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#888" }}>メモリ</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: memColor }}>{m.memory.pct}%</div>
                <ObsBar pct={m.memory.pct} color={memColor} />
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{m.memory.usedGb}/{m.memory.totalGb}GB</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#888" }}>ディスク</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: diskColor }}>{m.disk.pct}%</div>
                <ObsBar pct={m.disk.pct} color={diskColor} />
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{m.disk.usedGb}/{m.disk.totalGb}GB</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "#888", flexWrap: "wrap" }}>
              <span>↓ {fmtKbps(m.network.rxKbps)}</span>
              <span>↑ {fmtKbps(m.network.txKbps)}</span>
              {m.gpu.available && <span>GPU {m.gpu.gpuPct}% / VRAM {m.gpu.vramUsedMb}MB</span>}
              <span>OBS: <span style={{ color: m.obs.running ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                {m.obs.running ? `稼働中 (${m.obs.memoryMb?.toFixed(0)}MB)` : "停止"}
              </span></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── メインページ ──────────────────────────────────────
export default function ReservationMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // 既存 state
  const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());

  // SRT state
  const [srt, setSrt] = useState<SrtStatus | null>(null);
  const prevBytesRef = useRef<Map<string, { bytes: number; time: number }>>(new Map());
  const [bpsMap, setBpsMap] = useState<Map<string, number>>(new Map());

  // 既存 fetch
  async function load() {
    setErr("");
    try {
      const res = await fetch(`/api/reservations/${id}/monitor`, { cache: "no-store" });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 240)}`);
      if (!ct.includes("application/json")) throw new Error(`Non-JSON: ${raw.slice(0, 240)}`);
      setData(JSON.parse(raw));
    } catch (e: any) {
      setErr(e?.message ?? "load failed");
      setData(null);
    }
  }

  // SRT fetch（5秒ごと）
  async function loadSrt() {
    try {
      const res = await fetch(`/api/srt-status?reservationId=${id}`, { cache: "no-store" });
      const json: SrtStatus = await res.json();

      // ビットレート計算（前回との差分 bytes/秒）
      const nowMs = Date.now();
      const newBps = new Map<string, number>();
      for (const cam of json.cameras ?? []) {
        const prev = prevBytesRef.current.get(cam.path);
        if (prev) {
          const dt = (nowMs - prev.time) / 1000;
          const db = cam.bytesReceived - prev.bytes;
          if (dt > 0 && db >= 0) newBps.set(cam.path, Math.round((db * 8) / dt));
        }
        prevBytesRef.current.set(cam.path, { bytes: cam.bytesReceived, time: nowMs });
      }
      setBpsMap(newBps);
      setSrt(json);
    } catch {
      setSrt({ serverOk: false, cameras: [], activePaths: 0, totalPaths: 0, fetchedAt: new Date().toISOString(), error: "fetch failed" });
    }
  }

  useEffect(() => {
    load();
    loadSrt();
    const t1 = window.setInterval(load, 10000);
    const t2 = window.setInterval(() => setNow(Date.now()), 1000);
    const t3 = window.setInterval(loadSrt, 5000); // SRTは5秒ごと
    return () => { window.clearInterval(t1); window.clearInterval(t2); window.clearInterval(t3); };
  }, [id]);

  const ytUrl = data?.youtube?.url ?? null;
  const twUrl = data?.twitch?.url ?? null;
  const ytVideoId = useMemo(() => (ytUrl ? parseYTVideoId(ytUrl) : null), [ytUrl]);
  const twChannel = useMemo(() => (twUrl ? parseTwitchChannel(twUrl) : null), [twUrl]);
  const twitchParent = useMemo(() => {
    if (typeof window === "undefined") return "localhost";
    return window.location.hostname || "localhost";
  }, []);
  const startedAt = useMemo(() => {
    const tw = data?.twitch?.startedAt ?? null;
    const yt = data?.youtube?.startedAt ?? null;
    const r = data?.reservation?.start_at ?? null;
    return tw ?? yt ?? r ?? null;
  }, [data]);
  const elapsed = useMemo(() => {
    if (!startedAt) return null;
    const t = Date.parse(startedAt);
    if (Number.isNaN(t)) return null;
    return (now - t) / 1000;
  }, [startedAt, now]);

  // 予約期間チェック（monitor APIから取得した end_at を使用）
  const reservationEndAt = data?.reservation?.end_at ?? null;
  const reservationStartAt = data?.reservation?.start_at ?? null;
  const isReservationEnded = reservationEndAt ? now > Date.parse(reservationEndAt) : false;
  const isReservationNotStarted = reservationStartAt ? now < Date.parse(reservationStartAt) : false;

  // カメラ数（SRTリソースから取得、なければsrtのcameras数）
  const cameraCount = srt?.cameras?.length ?? 0;

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>配信状態モニター</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>reservation: {id}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href={`/reservations/${id}`} style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 13 }}>← 予約詳細へ</a>
          <LogoutButton />
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, border: "1px solid rgba(255,80,80,0.45)", background: "rgba(255,80,80,0.10)", color: "rgba(255,220,220,0.95)", whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {/* ── SRTサーバー状態 ── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
          📡 SRTサーバー状態
        </div>

        {/* 予約期間終了バナー */}
        {isReservationEnded && (
          <div style={{
            marginBottom: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(251,191,36,0.45)",
            background: "rgba(251,191,36,0.08)",
            fontSize: 13,
            color: "rgba(251,191,36,0.95)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ⚠️ 予約期間が終了しています（終了: {new Date(reservationEndAt!).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
          </div>
        )}

        {/* 予約開始前バナー */}
        {isReservationNotStarted && (
          <div style={{
            marginBottom: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(96,165,250,0.45)",
            background: "rgba(96,165,250,0.08)",
            fontSize: 13,
            color: "rgba(147,197,253,0.95)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ℹ️ 予約開始前です（開始: {new Date(reservationStartAt!).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
          </div>
        )}

        <div style={{
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${isReservationEnded ? "rgba(251,191,36,0.35)" : srt?.serverOk ? "rgba(74,222,128,0.35)" : "rgba(255,80,80,0.35)"}`,
          background: isReservationEnded ? "rgba(251,191,36,0.05)" : srt?.serverOk ? "rgba(74,222,128,0.05)" : "rgba(255,80,80,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: isReservationEnded ? "#fbbf24" : srt?.serverOk ? "#4ade80" : "#f87171" }}>
            {srt == null ? "確認中…" : isReservationEnded ? "○ 期間終了" : srt.serverOk ? "● ONLINE" : "○ OFFLINE"}
          </span>
          {srt?.serverOk && !isReservationEnded && (
            <>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                配信中: <b style={{ color: "#fff" }}>{srt.activePaths}</b> / {cameraCount} カメラ
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
                最終更新: {srt.fetchedAt ? new Date(srt.fetchedAt).toLocaleTimeString("ja-JP") : "—"}
              </span>
            </>
          )}
          {srt?.error && !isReservationEnded && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{srt.error}</span>
          )}
        </div>
      </div>

      {/* ── カメラ別SRT状態（期間終了後は非表示） ── */}
      {!isReservationEnded && cameraCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            📷 カメラ別SRT受信状態
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
          }}>
            {srt!.cameras.map((cam) => (
              <SrtCameraCard
                key={cam.path}
                cam={cam}
                bps={bpsMap.get(cam.path) ?? null}
                now={now}
              />
            ))}
          </div>
        </div>
      )}

      {/* カメラがない（配信前 or 期間終了後）場合 */}
      {!isReservationEnded && srt?.serverOk && cameraCount === 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)", fontSize: 13, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          現在配信中のカメラはありません（Larix で配信を開始すると表示されます）
        </div>
      )}

      {/* ── OBSサーバーメトリクス（srt_obsプランのみ） ── */}
      <ObsMetricsPanel
        reservationId={id}
        planKey={data?.reservation?.plan_key ?? null}
      />

      {/* ── 既存: 配信統計 ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
          📊 配信統計
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <Card title="配信時間（経過）">
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              {elapsed == null ? "—" : fmtSeconds(elapsed)}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
              startedAt: {startedAt ?? "—"}
            </div>
          </Card>
          <Card title="視聴者数（YouTube / Twitch）">
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div>YouTube: <b>{data?.youtube?.viewerCount ?? "—"}</b></div>
              <div>Twitch: <b>{data?.twitch?.viewerCount ?? "—"}</b></div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>※ APIキー未設定の場合は "—"</div>
          </Card>
          <Card title="配信ステータス（YouTube / Twitch）">
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div>YouTube: <b>{data?.youtube?.live === null ? "不明" : (data?.youtube?.live ? "LIVE" : "OFFLINE")}</b></div>
              <div>Twitch: <b>{data?.twitch?.live === null ? "不明" : (data?.twitch?.live ? "LIVE" : "OFFLINE")}</b></div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
              {data?.youtube?.note ? `YouTube: ${data.youtube.note}` : ""}
              {data?.twitch?.note ? ` Twitch: ${data.twitch.note}` : ""}
            </div>
          </Card>
        </div>
      </div>

      {/* ── 既存: ライブプレビュー ── */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="ライブプレビュー（YouTube）">
          {ytVideoId ? (
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=0&mute=1`}
                style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: 0, borderRadius: 12 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>YouTube配信枠URLが未提出、または動画IDを解析できません。</div>
          )}
          {ytUrl && <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)", wordBreak: "break-all" }}>URL: {ytUrl}</div>}
        </Card>
        <Card title="ライブプレビュー（Twitch）">
          {twChannel ? (
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={`https://player.twitch.tv/?channel=${encodeURIComponent(twChannel)}&parent=${encodeURIComponent(twitchParent)}&muted=true`}
                style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: 0, borderRadius: 12 }}
                allowFullScreen
              />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>TwitchチャンネルURLが未提出、またはチャンネル名を解析できません。</div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            Twitch埋め込みは <code>parent</code> が必須です（この画面では {twitchParent} を自動指定）
          </div>
          {twUrl && <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)", wordBreak: "break-all" }}>URL: {twUrl}</div>}
        </Card>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
        Twitch の視聴者数/開始時刻は Helix Get Streams の <code>viewer_count</code>, <code>started_at</code>, <code>type</code> を利用します
        <br />
        YouTube は Data API の <code>videos.list</code>（<code>liveStreamingDetails</code> など）を利用します
      </div>
    </div>
  );
}
