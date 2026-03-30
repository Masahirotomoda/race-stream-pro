"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import LogoutButton from "@/app/components/LogoutButton";

type ApiResp = any;

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
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginBottom: 8 }}>{title}</div>
      <div style={{ color: "rgba(255,255,255,0.92)" }}>{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, disabled = false }: any) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background: disabled ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.35)",
          color: "rgba(255,255,255,0.92)",
          outline: "none",
        }}
      />
    </div>
  );
}

function KeyRow({
  label,
  value,
  onChange,
  reveal,
  onToggleReveal,
  onCopy,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type={reveal ? "text" : "password"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.35)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
          }}
        />
        <button
          onClick={onToggleReveal}
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.9)",
            padding: "10px 12px",
            borderRadius: 10,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="15秒後に自動で非表示になります"
        >
          {reveal ? "非表示" : "表示"}
        </button>
        <button
          onClick={onCopy}
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.9)",
            padding: "10px 12px",
            borderRadius: 10,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          コピー
        </button>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", marginTop: 6 }}>
        ※ 表示中は覗き見に注意（自動で非表示に戻ります）
      </div>
    </div>
  );
}

async function copyToClipboard(text: string) {
  const v = (text ?? "").trim();
  if (!v) throw new Error("空のためコピーできません");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(v);
    return;
  }
  // fallback
  const ta = document.createElement("textarea");
  ta.value = v;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("コピーに失敗しました");
}

export default function AdminReservationOutputsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string>("");

  const [ytKey, setYtKey] = useState("");
  const [twKey, setTwKey] = useState("");
  const [twIngest, setTwIngest] = useState("");

  const [revealYt, setRevealYt] = useState(false);
  const [revealTw, setRevealTw] = useState(false);

  const revealTimerRef = useRef<number | null>(null);

  function startAutoHide(which: "yt" | "tw") {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      setRevealYt(false);
      setRevealTw(false);
    }, 15000);
    if (which === "yt") setRevealYt(true);
    if (which === "tw") setRevealTw(true);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2000);
  }

  async function load() {
    setErr("");
    const res = await fetch(`/api/admin/reservations/${id}/outputs`, { cache: "no-store" });
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (!res.ok) return setErr(`HTTP ${res.status}: ${raw.slice(0, 240)}`);
    if (!ct.includes("application/json")) return setErr(`Non-JSON: ${raw.slice(0, 240)}`);

    const json = JSON.parse(raw);
    setData(json);

    setYtKey(json.outputs?.youtube_stream_key ?? "");
    setTwKey(json.outputs?.twitch_stream_key ?? "");
    setTwIngest(json.outputs?.twitch_ingest_server ?? json.defaults?.twitch_default_ingest_server ?? "rtmp://live.twitch.tv/app");

    // 読み込みのたびに非表示へ
    setRevealYt(false);
    setRevealTw(false);
  }

  useEffect(() => {
    load();
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  const youtubeServer = data?.defaults?.youtube_server_url ?? "rtmps://a.rtmps.youtube.com/live2";

  const twitchRtmpUrl = useMemo(() => {
    const base = (twIngest ?? "").trim();
    const key = (twKey ?? "").trim();
    if (!base || !key) return "";
    return `${base.replace(/\/+$/, "")}/${key}`;
  }, [twIngest, twKey]);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/reservations/${id}/outputs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtube_stream_key: ytKey,
          twitch_stream_key: twKey,
          twitch_ingest_server: twIngest,
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 240)}`);
      if (!ct.includes("application/json")) throw new Error(`Non-JSON: ${raw.slice(0, 240)}`);
      await load();
      showToast("保存しました");
    } catch (e: any) {
      setErr(e?.message ?? "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
            配信設定（YouTube / Twitch）
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            reservation: {id}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={`/admin/reservations/${id}`}
            style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 13 }}
          >
            ← 予約詳細へ
          </a>
          <LogoutButton />
        </div>
      </div>

      {toast && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(120,220,120,0.35)",
            background: "rgba(120,220,120,0.10)",
            color: "rgba(220,255,220,0.92)",
          }}
        >
          {toast}
        </div>
      )}

      {err && (
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
          {err}
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <Card title="予約者が提出した配信枠URL（Keyなし）">
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
            <div>
              YouTube:{" "}
              {data?.reservation?.youtube_broadcast_url ? (
                <a
                  href={data.reservation.youtube_broadcast_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "rgba(160,220,255,0.95)" }}
                >
                  {data.reservation.youtube_broadcast_url}
                </a>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.55)" }}>（未提出）</span>
              )}
            </div>
            <div style={{ marginTop: 6 }}>
              Twitch:{" "}
              {data?.reservation?.twitch_channel_url ? (
                <a
                  href={data.reservation.twitch_channel_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "rgba(160,220,255,0.95)" }}
                >
                  {data.reservation.twitch_channel_url}
                </a>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.55)" }}>（未提出）</span>
              )}
            </div>
          </div>
        </Card>

        <Card title="管理者：Stream Key入力（秘匿情報）">
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800 }}>この画面のKeyは予約者には表示しません。</span>
            <br />
            表示ボタンは15秒で自動的に非表示へ戻ります。
          </div>

          <Input
            label="YouTube Server URL（固定。通常これでOK）"
            value={youtubeServer}
            onChange={() => {}}
            placeholder="rtmps://a.rtmps.youtube.com/live2"
            disabled
          />

          <KeyRow
            label="YouTube Stream Key"
            value={ytKey}
            onChange={setYtKey}
            reveal={revealYt}
            onToggleReveal={() => (revealYt ? setRevealYt(false) : startAutoHide("yt"))}
            onCopy={async () => {
              try {
                await copyToClipboard(ytKey);
                showToast("YouTube key をコピーしました");
              } catch (e: any) {
                setErr(e?.message ?? "copy failed");
              }
            }}
            placeholder="YouTubeのストリームキー"
          />

          <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 14 }}>
            <Input
              label="Twitch ingest server（地域別推奨を使用）"
              value={twIngest}
              onChange={setTwIngest}
              placeholder="例: rtmp://sfo.contribute.live-video.net/app"
            />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
              ingestの選定:{" "}
              <a
                href="https://help.twitch.tv/s/twitch-ingest-recommendation?language=en_US"
                target="_blank"
                rel="noreferrer"
                style={{ color: "rgba(160,220,255,0.95)" }}
              >
                Twitch Ingest Recommendation
              </a>
            </div>

            <KeyRow
              label="Twitch Stream Key"
              value={twKey}
              onChange={setTwKey}
              reveal={revealTw}
              onToggleReveal={() => (revealTw ? setRevealTw(false) : startAutoHide("tw"))}
              onCopy={async () => {
                try {
                  await copyToClipboard(twKey);
                  showToast("Twitch key をコピーしました");
                } catch (e: any) {
                  setErr(e?.message ?? "copy failed");
                }
              }}
              placeholder="Twitchのストリームキー"
            />

            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              生成されるRTMP URL（参考）:
              <div style={{ marginTop: 6, color: "rgba(255,255,255,0.9)", wordBreak: "break-all" }}>
                {twitchRtmpUrl || "（ingest と key を入れると表示）"}
              </div>
              {twitchRtmpUrl && (
                <button
                  onClick={async () => {
                    try {
                      await copyToClipboard(twitchRtmpUrl);
                      showToast("Twitch RTMP URL をコピーしました");
                    } catch (e: any) {
                      setErr(e?.message ?? "copy failed");
                    }
                  }}
                  style={{
                    marginTop: 8,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    padding: "8px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  RTMP URLをコピー
                </button>
              )}
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            style={{
              marginTop: 14,
              border: "1px solid rgba(255,255,255,0.16)",
              background: saving ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </Card>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
        YouTubeは「Server URL と Stream key をエンコーダに入れる」方式です [Source](https://support.google.com/youtube/answer/2907883?hl=en)
        <br />
        Twitchは `rtmp://&lt;ingest-server&gt;/app/&lt;stream-key&gt;` 形式です [Source](https://dev.twitch.tv/docs/video-broadcast/)
      </div>
    </div>
  );
}
