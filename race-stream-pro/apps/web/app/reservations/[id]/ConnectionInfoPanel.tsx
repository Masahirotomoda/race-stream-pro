"use client";

import { useState } from "react";

type CamMode = "lmcam" | "larix";

interface SrtCam {
  host: string;
  port: number;
  stream_id?: string;
  streamId?: string;
  passphrase: string;
  mode?: string;
}

interface Props {
  srt?: SrtCam | SrtCam[] | null;
  win?: { ip?: string; username?: string; password?: string } | null;
  provisionStatus?: string;
  planKey?: string;
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        marginLeft: 8, padding: "2px 10px", fontSize: 11,
        background: copied ? "#16a34a" : "#2a2a2a",
        color: copied ? "#fff" : "#aaa",
        border: `1px solid ${copied ? "#16a34a" : "#444"}`,
        borderRadius: 4, cursor: "pointer", flexShrink: 0,
      }}
    >
      {copied ? "✓ コピー済" : "コピー"}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a1a1a" }}>
      <span style={{ width: 140, fontSize: 11, color: "#666", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#ddd", wordBreak: "break-all", flex: 1 }}>
        {value}
      </span>
      <CopyBtn value={value} />
    </div>
  );
}

export default function ConnectionInfoPanel({ srt, win, provisionStatus, planKey }: Props) {
  const cams: SrtCam[] = !srt ? [] : Array.isArray(srt) ? srt : [srt];

  const [modes, setModes] = useState<Record<number, CamMode>>(
    Object.fromEntries(cams.map((_, i) => [i, "lmcam" as CamMode]))
  );
  const setMode = (i: number, m: CamMode) =>
    setModes(prev => ({ ...prev, [i]: m }));

  if (cams.length === 0 && !win?.ip) {
    return (
      <div style={{ padding: "16px 0", color: "#555", fontSize: 13 }}>
        {provisionStatus === "pending"
          ? "⏳ プロビジョニング中... しばらくお待ちください"
          : "接続情報はまだ準備されていません"}
      </div>
    );
  }

  return (
    <div>
      {cams.map((cam, i) => {
        const sid = cam.stream_id ?? cam.streamId ?? "";
        const mode = cam.mode ?? "caller";
        const srtUrl = `srt://${cam.host}:${cam.port}?streamid=${sid}&passphrase=${cam.passphrase}&mode=${mode}`;
        const t = modes[i] ?? "lmcam";

        return (
          <div key={i} style={{ marginBottom: 16, padding: "14px 16px", background: "#0a0a0a", borderRadius: 8, border: "1px solid #1e1e1e" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#bbb" }}>📷 カメラ {i + 1}</span>
              {(["lmcam", "larix"] as CamMode[]).map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: t === opt ? "#60a5fa" : "#666", cursor: "pointer", fontWeight: t === opt ? 700 : 400 }}>
                  <input type="radio" name={`cam-${i}`} checked={t === opt} onChange={() => setMode(i, opt)} style={{ accentColor: "#60a5fa" }} />
                  {opt === "lmcam" ? "LM-CAM" : "Larix"}
                </label>
              ))}
            </div>

            {t === "lmcam" ? (
              <>
                <Row label="HOST"       value={cam.host} />
                <Row label="PORT"       value={String(cam.port)} />
                <Row label="STREAM ID"  value={sid} />
                <Row label="PASSPHRASE" value={cam.passphrase} />
                <Row label="MODE"       value={mode} />
              </>
            ) : (
              <>
                <Row label="URL"        value={srtUrl} />
                <Row label="STREAM ID"  value={sid} />
                <Row label="PASSPHRASE" value={cam.passphrase} />
                <Row label="LATENCY"    value="200" />
              </>
            )}
          </div>
        );
      })}

      {planKey === "srt_obs" && cams.length > 0 && (
        <div style={{ marginBottom: 16, padding: "14px 16px", background: "#0a0a0a", borderRadius: 8, border: "1px solid #1e1e1e" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#bbb", marginBottom: 10 }}>🎬 OBS 設定</div>
          {cams.map((cam, i) => {
            const sid = cam.stream_id ?? cam.streamId ?? "";
            const obsUrl = `srt://${cam.host}:${cam.port}?streamid=${sid}&passphrase=${cam.passphrase}&mode=listener&latency=200000`;
            return (
              <div key={i} style={{ marginBottom: i < cams.length - 1 ? 12 : 0 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  カメラ {i + 1}
                </div>
                <Row label="入力形式" value="mpegts" />
                <Row label="入力URL"  value={obsUrl} />
              </div>
            );
          })}
        </div>
      )}

      {win?.ip && (
        <div style={{ padding: "14px 16px", background: "#0a0a0a", borderRadius: 8, border: "1px solid #1e1e1e" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#bbb", marginBottom: 10 }}>🖥️ Windows RDP</div>
          {win.ip       && <Row label="IP"         value={win.ip} />}
          {win.username && <Row label="ユーザー名" value={win.username} />}
          {win.password && <Row label="パスワード" value={win.password} />}
        </div>
      )}
    </div>
  );
}
