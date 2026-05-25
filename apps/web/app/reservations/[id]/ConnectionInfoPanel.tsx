"use client";

import { useEffect, useState, useCallback } from "react";

// ─── 型定義 ────────────────────────────────────────────────────
interface SrtItem {
  streamid:   string;
  passphrase: string;
  path?:      string;
}

interface SrtData {
  host?:          string;
  port?:          number;
  camera_count?:  number;
  items?:         SrtItem[];
  // 旧形式フォールバック
  stream_key?:    string;
}

interface WinData {
  rdp_host?: string;
  rdp_port?: number;
  username?: string;
  password?: string;
}

interface ProvisionStatusResponse {
  provision_status: string | null;
  plan_key:         string;
  job_status:       string | null;
  job_error:        string | null;
  job_attempts:     number;
  rdp_host:         string | null;
  rdp_port:         number | null;
  username:         string | null;
}

interface Props {
  reservationId:   string;
  srt:             SrtData | null;
  win:             WinData | null;
  provisionStatus: string | null;
  planKey:         string;
}

// ─── カメラカラー ───────────────────────────────────────────────
const CAM_COLORS = ["#e63946", "#2dc653", "#4895ef", "#f4a261", "#a78bfa", "#fb7185"];
const CAM_LABELS = ["CAM 1", "CAM 2", "CAM 3", "CAM 4"];

// ─── CopyButton ─────────────────────────────────────────────────
function CopyButton({ text, label, small }: { text: string; label?: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        marginLeft: 6,
        padding: small ? "2px 8px" : "3px 10px",
        fontSize: small ? 11 : 12,
        background: copied ? "rgba(45,198,83,0.15)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${copied ? "rgba(45,198,83,0.4)" : "rgba(255,255,255,0.15)"}`,
        borderRadius: 4,
        color: copied ? "#2dc653" : "#aaa",
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {copied ? "✓ コピー済" : label ?? "コピー"}
    </button>
  );
}

// ─── SRT カメラカード ───────────────────────────────────────────
function SrtCameraCard({
  index,
  item,
  host,
  port,
}: {
  index:  number;
  item:   SrtItem;
  host:   string;
  port:   number;
}) {
  const color     = CAM_COLORS[index % CAM_COLORS.length];
  const streamId  = `publish:${item.streamid}:rsp:${item.passphrase}`;
  const srtUrl    = `srt://${host}:${port}?streamid=${encodeURIComponent(streamId)}&latency=200000`;

  return (
    <div style={{
      background: "#1a1a24",
      border: `1px solid ${color}44`,
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* ヘッダー */}
      <div style={{
        background: `${color}18`,
        borderBottom: `2px solid ${color}55`,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: color, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 13, lineHeight: 1.2, textAlign: "center",
          flexShrink: 0,
        }}>
          CAM<br />{index + 1}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Camera {index + 1}</div>
          <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{item.streamid}</div>
        </div>
      </div>

      {/* 情報行 */}
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "ホスト",       value: host,             copy: host },
          { label: "ポート",       value: String(port),     copy: String(port) },
          { label: "SRT Mode",    value: "Caller",          copy: null },
          { label: "Latency",     value: "200 ms",          copy: null },
          { label: "パスフレーズ", value: item.passphrase,  copy: item.passphrase },
        ].map(({ label, value, copy }) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
            <div style={{
              display: "flex", alignItems: "center",
              background: "#0f0f18", border: "1px solid #2e2e40",
              borderRadius: 5, padding: "5px 10px",
              fontFamily: "monospace", fontSize: 12, fontWeight: 600,
              justifyContent: "space-between",
            }}>
              <span>{value}</span>
              {copy && <CopyButton text={copy} small />}
            </div>
          </div>
        ))}

        {/* Stream ID */}
        <div style={{ marginTop: 4 }}>
          <div style={{
            fontSize: 11, color: "#888", marginBottom: 5,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            Stream ID
            <span style={{
              background: `${color}22`, color, border: `1px solid ${color}44`,
              padding: "1px 6px", borderRadius: 3, fontSize: 10,
            }}>Larix / LM-Cam 貼り付け用</span>
          </div>
          <div style={{
            background: "#0a0a14", border: "1px solid #2e2e40", borderRadius: 6,
            padding: "8px 12px",
          }}>
            <div style={{
              fontFamily: "monospace", fontSize: 12, fontWeight: 600,
              color: "#a8d8ea", wordBreak: "break-all", lineHeight: 1.5,
            }}>
              {streamId}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <CopyButton text={streamId} label="Stream ID をコピー" />
            </div>
          </div>
        </div>

        {/* SRT URL */}
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>SRT URL（URL形式）</div>
          <div style={{
            background: "#0a0a14", border: "1px solid #2e2e40", borderRadius: 5,
            padding: "6px 10px", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 8,
          }}>
            <span style={{
              fontFamily: "monospace", fontSize: 11, color: "#6b9fc8",
              wordBreak: "break-all", lineHeight: 1.4,
            }}>
              srt://{host}:{port}?streamid=publish:{item.streamid}:rsp:…
            </span>
            <CopyButton text={srtUrl} label="コピー" small />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 共通接続情報 ────────────────────────────────────────────────
function SrtCommonInfo({ host, port }: { host: string; port: number }) {
  return (
    <div style={{
      background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10,
      padding: "16px 20px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        🌐 共通接続情報（全カメラ共通）
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12 }}>
        {[
          { label: "サーバーホスト", value: host },
          { label: "ポート番号",     value: String(port) },
          { label: "SRT Mode",      value: "Caller" },
          { label: "推奨 Latency",  value: "200 ms" },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── カメラ別メール送信フォーム ─────────────────────────────────

function SendEmailForm({
  reservationId,
  srt,
}: {
  reservationId: string;
  srt: SrtData;
}) {
  const items = srt.items ?? [];
  // カメラごとのメールアドレス入力 state: { [cameraIndex]: "email1\nemail2" }
  const [emailMap, setEmailMap] = useState<Record<number, string>>({});
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; message: string } | null>(null);

  const setEmail = (idx: number, val: string) =>
    setEmailMap((prev) => ({ ...prev, [idx]: val }));

  const handleSend = async () => {
    // カメラ別に { cameraIndex, emails[] } を組み立て
    const cameras = items.map((_, i) => ({
      cameraIndex: i + 1,
      emails: (emailMap[i] ?? "")
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@")),
    })).filter((c) => c.emails.length > 0);

    if (cameras.length === 0) {
      setResult({ ok: false, message: "少なくとも1件のメールアドレスを入力してください" });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const res = await fetch(`/api/reservations/${reservationId}/send-srt-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameras }),
      });
      const text = await res.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { throw new Error(`サーバーエラー: ${text.slice(0, 100)}`); }
      if (!res.ok) throw new Error(json.error ?? "送信失敗");
      const totalEmails = cameras.reduce((s, c) => s + c.emails.length, 0);
      setResult({ ok: true, message: `✅ ${totalEmails} 件に送信しました（成功 ${json.sent} / 失敗 ${json.failed}）` });
      setEmailMap({});
    } catch (e) {
      setResult({ ok: false, message: `❌ ${e instanceof Error ? e.message : "送信エラー"}` });
    } finally {
      setSending(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <div style={{
      background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10,
      padding: "20px", marginTop: 24,
    }}>
      {/* ヘッダー */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📧</span> 接続情報をカメラ別にメール送信
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
        各カメラ担当者のメールアドレスを入力してください。空欄のカメラはスキップされます。
      </div>

      {/* カメラ別入力行 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item, i) => {
          const color = CAM_COLORS[i % CAM_COLORS.length];
          const label = CAM_LABELS[i] ?? `CAM ${i + 1}`;
          // path から短いカメラ名を取得
          const pathLabel = item.path ?? item.streamid?.split("/").pop() ?? "";
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              alignItems: "center",
              gap: 10,
            }}>
              {/* カメララベル */}
              <div style={{
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: `${color}22`, border: `1px solid ${color}55`,
                  borderRadius: 6, padding: "5px 10px",
                  fontWeight: 700, fontSize: 13, color,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: color, display: "inline-block", flexShrink: 0,
                  }} />
                  {label}
                </div>
                {pathLabel && (
                  <div style={{ fontSize: 10, color: "#666", paddingLeft: 2, fontFamily: "monospace" }}>
                    {pathLabel}
                  </div>
                )}
              </div>

              {/* メールアドレス入力 */}
              <input
                type="text"
                value={emailMap[i] ?? ""}
                onChange={(e) => setEmail(i, e.target.value)}
                placeholder={`cam${i + 1}担当者@example.com`}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "#0f0f18", border: `1px solid ${emailMap[i] ? color + "66" : "#2e2e40"}`,
                  borderRadius: 6, color: "#e8e8f0", fontSize: 13,
                  fontFamily: "inherit", outline: "none",
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 送信ボタン */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            padding: "9px 22px", borderRadius: 7,
            background: sending ? "#333" : "#e63946",
            border: "none", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: sending ? "not-allowed" : "pointer",
            transition: "background 0.2s", fontFamily: "inherit",
          }}
        >
          {sending ? "送信中…" : "📤 各カメラに送信する"}
        </button>
        {result && (
          <span style={{ fontSize: 13, color: result.ok ? "#2dc653" : "#f87171" }}>
            {result.message}
          </span>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
        ※ 各カメラの Stream ID・ホスト・ポート情報が送付されます。<br />
        ※ パスフレーズは機密情報です。送信先にご注意ください。
      </div>
    </div>
  );
}

// ─── RDP 接続情報 ────────────────────────────────────────────────
function RdpInstructions({ rdpHost, rdpPort, username }: { rdpHost: string; rdpPort: number; username: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#1a1a24", border: "1px solid #457b9d44", borderRadius: 10, padding: "16px 20px" }}>
        <div style={{ fontWeight: 700, color: "#4895ef", marginBottom: 12 }}>RDP 接続情報</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "ホスト", value: `${rdpHost}:${rdpPort}`, copy: `${rdpHost}:${rdpPort}` },
            { label: "ユーザー名", value: username, copy: username },
          ].map(({ label, value, copy }) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", background: "#0f0f18", border: "1px solid #2e2e40", borderRadius: 5, padding: "5px 10px", fontFamily: "monospace", fontSize: 12, justifyContent: "space-between" }}>
                <span>{value}</span>
                <CopyButton text={copy} small />
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#888" }}>パスワード</span>
            <span style={{ fontSize: 12, color: "#666" }}>※ 予約確認メールに記載</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#888", marginBottom: 8 }}>接続手順</div>
        <ol style={{ fontSize: 13, color: "#aaa", lineHeight: 2, paddingLeft: 18, margin: 0 }}>
          <li>Windows「スタート」→「リモートデスクトップ接続」を開く</li>
          <li>コンピューター欄に <code style={{ background: "#0f0f18", padding: "1px 5px", borderRadius: 3 }}>{rdpHost}:{rdpPort}</code> を入力</li>
          <li>「接続」をクリックし、ユーザー名とパスワードを入力</li>
          <li>証明書の警告が出たら「はい」をクリック</li>
        </ol>
      </div>
    </div>
  );
}

// ─── PollingStatus ───────────────────────────────────────────────
function PollingStatus({ jobStatus, jobError, jobAttempts }: { jobStatus: string | null; jobError: string | null; jobAttempts: number }) {
  if (jobStatus === "succeeded") return null;
  const statusMap: Record<string, { icon: string; text: string; color: string }> = {
    queued:  { icon: "⏳", text: "VM の起動準備中...",   color: "#f59e0b" },
    running: { icon: "🔄", text: "VM を起動しています...", color: "#4895ef" },
    error:   { icon: "❌", text: "VM の起動に失敗しました", color: "#f87171" },
  };
  const info = jobStatus ? statusMap[jobStatus] : null;
  return (
    <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "14px 18px" }}>
      {info ? (
        <>
          <p style={{ fontWeight: 600, color: info.color, margin: 0 }}>{info.icon} {info.text}</p>
          {jobAttempts > 0 && <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>試行回数: {jobAttempts}</p>}
          {jobError    && <p style={{ fontSize: 12, color: "#f87171", margin: "4px 0 0" }}>エラー: {jobError}</p>}
          {jobStatus !== "failed" && <p style={{ fontSize: 12, color: "#666", margin: "6px 0 0" }}>自動的に更新されます（15 秒ごと）</p>}
        </>
      ) : (
        <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>⏳ VM の状態を確認中...</p>
      )}
    </div>
  );
}

// ─── メイン コンポーネント ───────────────────────────────────────
export default function ConnectionInfoPanel({ reservationId, srt, win, provisionStatus, planKey }: Props) {
  const isObsPlan = planKey === "windows_obs";

  const [polledStatus, setPolledStatus] = useState<ProvisionStatusResponse | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!isObsPlan) return;
    try {
      const res = await fetch(`/api/reservations/${reservationId}/provision-status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPolledStatus(await res.json());
      setPollingError(null);
    } catch (e) {
      setPollingError(e instanceof Error ? e.message : "取得エラー");
    }
  }, [reservationId, isObsPlan]);

  useEffect(() => {
    if (!isObsPlan) return;
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [poll, isObsPlan]);

  const rdpHost              = polledStatus?.rdp_host ?? win?.rdp_host ?? null;
  const rdpPort              = polledStatus?.rdp_port ?? win?.rdp_port ?? 3389;
  const username             = polledStatus?.username ?? win?.username ?? "obsadmin";
  const currentProvisionStatus = polledStatus?.provision_status ?? provisionStatus;
  const jobStatus            = polledStatus?.job_status ?? null;
  const jobError             = polledStatus?.job_error ?? null;
  const jobAttempts          = polledStatus?.job_attempts ?? 0;

  // SRT items を正規化（新形式 items[] / 旧形式 stream_key フォールバック）
  const host  = srt?.host ?? "srt.beql.jp";
  const port  = srt?.port ?? 20000;
  const items: SrtItem[] = srt?.items ?? (
    srt?.stream_key ? [{ streamid: srt.stream_key, passphrase: "" }] : []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── SRT 接続情報 ── */}
      {srt && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>📡</span> SRT 接続情報
          </h2>

          {/* 共通情報 */}
          <SrtCommonInfo host={host} port={port} />

          {/* カメラカード */}
          {items.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px,1fr))", gap: 14 }}>
              {items.map((item, idx) => (
                <SrtCameraCard key={idx} index={idx} item={item} host={host} port={port} />
              ))}
            </div>
          ) : (
            <div style={{ background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10, padding: 16, fontSize: 13, color: "#888" }}>
              接続情報がまだ生成されていません
            </div>
          )}

          {/* メール送信フォーム */}
          {items.length > 0 && (
            <SendEmailForm reservationId={reservationId} srt={srt} />
          )}
        </section>
      )}

      {/* ── Windows OBS VM 接続情報 ── */}
      {isObsPlan && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🖥</span> Windows OBS VM 接続情報
          </h2>

          {pollingError && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>⚠️ 状態取得エラー: {pollingError}</div>
          )}

          {(!rdpHost || currentProvisionStatus === "provisioning" || currentProvisionStatus === null) && jobStatus !== null && (
            <PollingStatus jobStatus={jobStatus} jobError={jobError} jobAttempts={jobAttempts} />
          )}

          {rdpHost && currentProvisionStatus === "provisioned" && (
            <RdpInstructions rdpHost={rdpHost} rdpPort={rdpPort} username={username} />
          )}

          {!rdpHost && currentProvisionStatus !== "provisioned" && jobStatus === null && (
            <div style={{ background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10, padding: 16, fontSize: 13, color: "#888" }}>
              ⏳ VM はまだ割り当てられていません。予約開始時刻に自動的に起動されます。
            </div>
          )}

          {currentProvisionStatus === "deprovisioned" && (
            <div style={{ background: "#1a1a24", border: "1px solid #2e2e40", borderRadius: 10, padding: 16, fontSize: 13, color: "#888" }}>
              ✅ 予約終了につき VM は削除されました。
            </div>
          )}
        </section>
      )}
    </div>
  );
}
