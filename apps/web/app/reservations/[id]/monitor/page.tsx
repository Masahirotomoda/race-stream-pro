"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import LogoutButton from "@/app/components/LogoutButton";

// ApexCharts は CDN版を使用するため dynamic import で SSR 無効化
const BitrateChart = dynamic(
  () => import("./SrtCharts").then((m) => ({ default: m.BitrateChart })),
  { ssr: false, loading: () => <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>グラフ読み込み中…</div> }
);
const PacketLossChart = dynamic(
  () => import("./SrtCharts").then((m) => ({ default: m.PacketLossChart })),
  { ssr: false, loading: () => <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>グラフ読み込み中…</div> }
);

// ─── 型定義 ─────────────────────────────────────────────
type ApiResp = any;

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
};

type HistoryPoint = { time: number; value: number };

// ─── GCP Stats 型 ──────────────────────────────────────
type GcpStats = {
  instanceName: string;
  cpu:     { percent: number; cores: number };
  memory:  { percent: number; usedGb: string; totalGb: string };
  gpu:     { name: string; percent: number; memUsedMb: number; memTotalMb: number; tempC: number };
  network: { sentMbps: string; recvMbps: string };
  disk:    { percent: number; usedGb: string; totalGb: string };
  timestamp: number;
};

// ─── ユーティリティ ─────────────────────────────────────
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

const MAX_HISTORY = 60;

// ─── GCP ゲージバー ─────────────────────────────────────
function GcpGaugeBar({
  label, percent, color, warning = 80,
}: { label: string; percent: number; color: string; warning?: number }) {
  const over = percent >= warning;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, color: "rgba(255,255,255,0.75)" }}>
        <span>{label}</span>
        <span style={{ color: over ? "#ff4444" : "#aaa", fontWeight: 600 }}>{percent}%</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.10)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(percent, 100)}%`,
          background: over ? "#ff4444" : color,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
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

// ─── メインページ ────────────────────────────────────────
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

  // グラフ用履歴 state
  const [bitrateHistory, setBitrateHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [pktLossHistory, setPktLossHistory] = useState<Record<string, HistoryPoint[]>>({});

  // GCP state
  const [gcpStats, setGcpStats] = useState<GcpStats | null>(null);
  const [gcpErr, setGcpErr] = useState(false);

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

  // SRT fetch（5秒ごと）+ 履歴蓄積
  async function loadSrt() {
    try {
      const res = await fetch(`/api/srt-status?reservationId=${id}`, { cache: "no-store" });
      const json: SrtStatus = await res.json();

      const nowMs = Date.now();
      const newBps = new Map<string, number>();

      for (const cam of json.cameras ?? []) {
        const prev = prevBytesRef.current.get(cam.path);
        let bpsVal = 0;
        if (prev) {
          const dt = (nowMs - prev.time) / 1000;
          const db = cam.bytesReceived - prev.bytes;
          if (dt > 0 && db >= 0) {
            bpsVal = Math.round((db * 8) / dt);
            newBps.set(cam.path, bpsVal);
          }
        }
        prevBytesRef.current.set(cam.path, { bytes: cam.bytesReceived, time: nowMs });

        setBitrateHistory((prev) => {
          const arr = [...(prev[cam.path] ?? []), { time: nowMs, value: Math.round(bpsVal / 1000) }];
          return { ...prev, [cam.path]: arr.slice(-MAX_HISTORY) };
        });

        const lossVal = cam.pktLostPct != null ? parseFloat(cam.pktLostPct) : 0;
        setPktLossHistory((prev) => {
          const arr = [...(prev[cam.path] ?? []), { time: nowMs, value: lossVal }];
          return { ...prev, [cam.path]: arr.slice(-MAX_HISTORY) };
        });
      }

      setBpsMap(newBps);
      setSrt(json);
    } catch {
      setSrt({ serverOk: false, cameras: [], activePaths: 0, totalPaths: 0, fetchedAt: new Date().toISOString(), error: "fetch failed" });
    }
  }

  // GCP fetch（5秒ごと）
  async function loadGcp() {
    try {
      const res = await fetch(`/api/gcp-stats?reservationId=${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("gcp failed");
      const d: GcpStats = await res.json();
      setGcpStats(d);
      setGcpErr(false);
    } catch {
      setGcpErr(true);
    }
  }

  useEffect(() => {
    load();
    loadSrt();
    loadGcp();
    const t1 = window.setInterval(load, 10000);
    const t2 = window.setInterval(() => setNow(Date.now()), 1000);
    const t3 = window.setInterval(loadSrt, 5000);
    const t4 = window.setInterval(loadGcp, 5000);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      window.clearInterval(t3);
      window.clearInterval(t4);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const cameraCount = srt?.cameras?.length ?? 0;

  const totalBitrateHistory = useMemo(() => {
    const allPaths = Object.keys(bitrateHistory);
    if (allPaths.length === 0) return [];
    const maxLen = Math.max(...allPaths.map((p) => bitrateHistory[p]?.length ?? 0));
    const result: HistoryPoint[] = [];
    for (let i = 0; i < maxLen; i++) {
      let total = 0;
      let t = 0;
      for (const path of allPaths) {
        const arr = bitrateHistory[path] ?? [];
        const offset = maxLen - arr.length;
        const idx = i - offset;
        if (idx >= 0 && arr[idx]) {
          total += arr[idx].value;
          t = arr[idx].time;
        }
      }
      if (t > 0) result.push({ time: t, value: total });
    }
    return result;
  }, [bitrateHistory]);

  const cameraPathsWithHistory = Object.keys(bitrateHistory).filter(
    (p) => bitrateHistory[p]?.length > 1
  );

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
        <div style={{
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${srt?.serverOk ? "rgba(74,222,128,0.35)" : "rgba(255,80,80,0.35)"}`,
          background: srt?.serverOk ? "rgba(74,222,128,0.05)" : "rgba(255,80,80,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: srt?.serverOk ? "#4ade80" : "#f87171" }}>
            {srt == null ? "確認中…" : srt.serverOk ? "● ONLINE" : "● OFFLINE"}
          </span>
          {srt?.serverOk && (
            <>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                配信中: <b style={{ color: "#fff" }}>{srt.activePaths}</b> / {cameraCount} カメラ
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
                最終更新: {srt.fetchedAt ? new Date(srt.fetchedAt).toLocaleTimeString("ja-JP") : "—"}
              </span>
            </>
          )}
          {srt?.error && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{srt.error}</span>
          )}
        </div>
      </div>

      {/* ── カメラ別SRT状態 ── */}
      {cameraCount > 0 && (
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

      {srt?.serverOk && cameraCount === 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)", fontSize: 13, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          現在配信中のカメラはありません（Larix で配信を開始すると表示されます）
        </div>
      )}

      {/* ── ビットレート / パケットロス グラフ ── */}
      {cameraPathsWithHistory.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            📈 リアルタイム グラフ（過去5分）
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.02)", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
              📶 合算ビットレート（全カメラ）
            </div>
            <BitrateChart
              history={totalBitrateHistory}
              label="合算ビットレート (kbps)"
              color="#6366f1"
            />
          </div>

          {cameraPathsWithHistory.length > 1 && (
            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.02)", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
                📷 カメラ別ビットレート
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                {cameraPathsWithHistory.map((path, idx) => {
                  const camLabel = `Camera ${srt?.cameras.find((c) => c.path === path)?.cameraIndex ?? idx + 1}`;
                  const colors = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#fb7185"];
                  return (
                    <div key={path}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>{camLabel}</div>
                      <BitrateChart
                        history={bitrateHistory[path] ?? []}
                        label={`${camLabel} (kbps)`}
                        color={colors[idx % colors.length]}
                        height={160}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
              📉 パケットロス率（%）
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {cameraPathsWithHistory.map((path, idx) => {
                const camLabel = `Camera ${srt?.cameras.find((c) => c.path === path)?.cameraIndex ?? idx + 1}`;
                return (
                  <div key={path}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>{camLabel}</div>
                    <PacketLossChart
                      history={pktLossHistory[path] ?? []}
                      label={`${camLabel} パケットロス (%)`}
                      height={140}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── GCPリソースモニター ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
          🖥️ GCPリソースモニター
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.02)" }}>
          {/* ヘッダー行 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {gcpStats?.instanceName && (
              <span style={{
                fontSize: 12, padding: "2px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)",
                fontFamily: "monospace",
              }}>
                {gcpStats.instanceName}
              </span>
            )}
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 10,
              background: gcpErr ? "rgba(255,80,80,0.2)" : "rgba(74,222,128,0.15)",
              color: gcpErr ? "#f87171" : "#4ade80",
            }}>
              {gcpErr ? "⚠ エラー" : "● ライブ"}
            </span>
            {gcpStats && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>
                {new Date(gcpStats.timestamp).toLocaleTimeString("ja-JP")} 更新
              </span>
            )}
          </div>

          {gcpStats ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* 左列 */}
              <div>
                <GcpGaugeBar
                  label={`CPU (${gcpStats.cpu.cores}コア)`}
                  percent={gcpStats.cpu.percent}
                  color="#22d3ee"
                />
                <GcpGaugeBar
                  label={`MEM ${gcpStats.memory.usedGb} / ${gcpStats.memory.totalGb} GB`}
                  percent={gcpStats.memory.percent}
                  color="#a855f7"
                />
                <GcpGaugeBar
                  label={`Disk  ${gcpStats.disk.usedGb} / ${gcpStats.disk.totalGb} GB`}
                  percent={gcpStats.disk.percent}
                  color="#f97316"
                  warning={90}
                />
              </div>
              {/* 右列 */}
              <div>
                {gcpStats.gpu.percent > 0 ? (
                  <GcpGaugeBar
                    label={`GPU  ${gcpStats.gpu.name}`}
                    percent={gcpStats.gpu.percent}
                    color="#4ade80"
                  />
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
                    GPU: データなし（nvidia-smi 未設定）
                  </div>
                )}
                {gcpStats.gpu.tempC > 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
                    🌡 GPU温度:{" "}
                    <span style={{ color: gcpStats.gpu.tempC > 80 ? "#ff4444" : "#aaa", fontWeight: 700 }}>
                      {gcpStats.gpu.tempC}°C
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 2 }}>
                  <div>⬆ 送信: <b style={{ color: "rgba(255,255,255,0.9)" }}>{gcpStats.network.sentMbps} MB/s</b></div>
                  <div>⬇ 受信: <b style={{ color: "rgba(255,255,255,0.9)" }}>{gcpStats.network.recvMbps} MB/s</b></div>
                  {gcpStats.gpu.memTotalMb > 0 && (
                    <div>GPU VRAM: <b style={{ color: "rgba(255,255,255,0.9)" }}>{gcpStats.gpu.memUsedMb} / {gcpStats.gpu.memTotalMb} MB</b></div>
                  )}
                </div>
              </div>
            </div>
          ) : gcpErr ? (
            <div style={{ fontSize: 13, color: "#f87171", padding: "8px 0" }}>
              GCPリソースを取得できません。サーバーがオフラインか、/api/gcp-stats が応答していません。
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "8px 0" }}>取得中…</div>
          )}
        </div>
      </div>

      {/* ── 配信統計 ── */}
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

      {/* ── ライブプレビュー ── */}
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
