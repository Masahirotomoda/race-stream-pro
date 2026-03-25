"use client";

import { useState } from "react";

type SrtItem = {
  streamid: string;
  srt_url: string;
};

type SrtData = {
  items?: SrtItem[];
  srt_url?: string;
  camera_count?: number;
};

type WinData = {
  rdp_host?: string;
  rdp_port?: number;
  username?: string;
  password?: string;
  note?: string;
};

type AppType = "lm-cam" | "larix";

interface ConnectionInfoPanelProps {
  srt: SrtData | null | undefined;
  win?: WinData | null;
  provisionStatus?: string;
  planKey?: string;
}

function parseSrtUrl(srtUrl: string) {
  try {
    const u = new URL(srtUrl);
    return {
      host: u.hostname,
      port: u.port || "20000",
      baseUrl: `srt://${u.hostname}:${u.port || "20000"}`,
      streamid: u.searchParams.get("streamid") ?? "",
      passphrase: u.searchParams.get("passphrase") ?? "",
      mode: u.searchParams.get("mode") ?? "caller",
    };
  } catch {
    return { host: "", port: "", baseUrl: "", streamid: "", passphrase: "", mode: "caller" };
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(value); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"110px 1fr auto", alignItems:"center", gap:8, padding:"7px 0", borderBottom:"1px solid #1a1a1a" }}>
      <div style={{ fontSize:12, color:"#888", textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:13, color:"#e0e0e0", fontFamily:"monospace", wordBreak:"break-all" }}>{value || "—"}</div>
      <button onClick={handleCopy} disabled={!value} style={{ padding:"3px 10px", fontSize:11, fontWeight:600, borderRadius:4, border:"1px solid #333", background:copied?"rgba(34,197,94,0.15)":"#1a1a1a", color:copied?"#22c55e":"#aaa", cursor:value?"pointer":"default", whiteSpace:"nowrap" }}>
        {copied ? "✓ コピー済" : "コピー"}
      </button>
    </div>
  );
}

function CopyInline({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(value); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} style={{ padding:"3px 10px", fontSize:11, fontWeight:600, borderRadius:4, border:"1px solid #333", background:copied?"rgba(34,197,94,0.15)":"#1a1a1a", color:copied?"#22c55e":"#aaa", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
      {copied ? "✓" : "コピー"}
    </button>
  );
}

function LmCamSettings({ parsed }: { parsed: ReturnType<typeof parseSrtUrl> }) {
  return (
    <div>
      <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>LM-CAM の「接続設定」で以下を入力してください。</div>
      <CopyRow label="プロトコル" value="SRT" />
      <CopyRow label="ホスト" value={parsed.host} />
      <CopyRow label="ポート" value={parsed.port} />
      <CopyRow label="Stream ID" value={parsed.streamid} />
      <CopyRow label="Passphrase" value={parsed.passphrase} />
      <CopyRow label="モード" value="Caller" />
      <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:6, fontSize:12, color:"#93c5fd" }}>
        💡 「暗号化」は <strong>AES-128</strong> を選択し、Passphrase を入力してください。
      </div>
    </div>
  );
}

function LarixSettings({ parsed, fullUrl }: { parsed: ReturnType<typeof parseSrtUrl>; fullUrl: string }) {
  return (
    <div>
      <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>Larix Broadcaster の「接続」→「＋」で新規追加し、以下を入力してください。</div>
      <CopyRow label="接続タイプ" value="SRT" />
      <CopyRow label="URL" value={parsed.baseUrl} />
      <CopyRow label="Stream ID" value={parsed.streamid} />
      <CopyRow label="Passphrase" value={parsed.passphrase} />
      <CopyRow label="レイテンシ(ms)" value="200" />
      <div style={{ marginTop:12 }}>
        <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>一括入力 URL</div>
        <div style={{ display:"flex", alignItems:"flex-start", gap:8, background:"#0f0f0f", border:"1px solid #222", borderRadius:6, padding:"8px 12px" }}>
          <code style={{ flex:1, fontSize:12, color:"#fff", wordBreak:"break-all", lineHeight:1.5 }}>{fullUrl}</code>
          <CopyInline value={fullUrl} />
        </div>
      </div>
      <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:6, fontSize:12, color:"#93c5fd" }}>
        💡 「暗号化」は <strong>AES-128</strong> を選択し、Passphrase を必ず入力してください。
      </div>
    </div>
  );
}

function CameraCard({ item, index }: { item: SrtItem; index: number }) {
  const [appType, setAppType] = useState<AppType>("lm-cam");
  const parsed = parseSrtUrl(item.srt_url);
  const larixUrl = (() => {
    try {
      const u = new URL(item.srt_url);
      if (!u.searchParams.has("latency")) u.searchParams.set("latency", "200000");
      return u.toString();
    } catch { return item.srt_url; }
  })();

  return (
    <div style={{ border:"1px solid #2a2a2a", borderRadius:10, overflow:"hidden" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"#161616", borderBottom:"1px solid #222" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
          <span style={{ fontWeight:800, color:"#fff" }}>カメラ {index + 1}</span>
          <span style={{ fontSize:12, color:"#888", fontFamily:"monospace" }}>{item.streamid}</span>
        </div>
        <div style={{ display:"flex", gap:4, background:"#111", borderRadius:6, padding:3 }}>
          {(["lm-cam", "larix"] as AppType[]).map((type) => (
            <label key={type} style={{ cursor:"pointer", padding:"4px 14px", borderRadius:4, fontSize:12, fontWeight:700, background:appType===type?(type==="lm-cam"?"rgba(96,165,250,0.25)":"rgba(245,158,11,0.25)"):"transparent", color:appType===type?(type==="lm-cam"?"#60a5fa":"#f59e0b"):"#666", border:appType===type?`1px solid ${type==="lm-cam"?"rgba(96,165,250,0.4)":"rgba(245,158,11,0.4)"}`:"1px solid transparent", transition:"all 0.15s" }}>
              <input type="radio" name={`app-${item.streamid}`} value={type} checked={appType===type} onChange={() => setAppType(type)} style={{ display:"none" }} />
              {type === "lm-cam" ? "LM-CAM" : "Larix"}
            </label>
          ))}
        </div>
      </div>
      <div style={{ padding:"14px 14px", background:"#111" }}>
        {appType === "lm-cam" ? <LmCamSettings parsed={parsed} /> : <LarixSettings parsed={parsed} fullUrl={larixUrl} />}
      </div>
    </div>
  );
}

function ObsCard({ items }: { items: SrtItem[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const item = items[selectedIdx];
  const obsUrl = (() => {
    try {
      const u = new URL(item.srt_url);
      if (!u.searchParams.has("latency")) u.searchParams.set("latency", "200000");
      return u.toString();
    } catch { return item.srt_url; }
  })();

  return (
    <div style={{ border:"1px solid #2a2a2a", borderRadius:10, overflow:"hidden" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"#161616", borderBottom:"1px solid #222" }}>
        <div>
          <span style={{ fontWeight:800, color:"#fff" }}>OBS 設定</span>
          <span style={{ marginLeft:8, fontSize:12, color:"#888" }}>（受信・モニタリング）</span>
        </div>
        {items.length > 1 && (
          <div style={{ display:"flex", gap:4 }}>
            {items.map((it, i) => (
              <button key={it.streamid} onClick={() => setSelectedIdx(i)} style={{ padding:"3px 12px", borderRadius:4, fontSize:12, fontWeight:700, border:"1px solid #333", background:selectedIdx===i?"rgba(34,197,94,0.15)":"#1a1a1a", color:selectedIdx===i?"#22c55e":"#666", cursor:"pointer" }}>
                カメラ {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding:"14px 14px", background:"#111" }}>
        <div style={{ fontSize:12, color:"#888", marginBottom:10 }}>OBSの「ソース」→「メディアソース」を追加し、以下を設定してください。</div>
        <CopyRow label="入力形式" value="mpegts" />
        <CopyRow label="入力 URL" value={obsUrl} />
        <div style={{ marginTop:12, padding:"10px 14px", background:"#0f0f0f", border:"1px solid #1e1e1e", borderRadius:8, fontSize:12, color:"#ccc" }}>
          <div style={{ fontWeight:700, color:"#e0e0e0", marginBottom:8 }}>📋 OBS 設定手順</div>
          <ol style={{ margin:0, paddingLeft:18, lineHeight:2 }}>
            <li>「ソース」→「＋」→「メディアソース」を選択</li>
            <li>「ローカルファイル」のチェックを <strong style={{ color:"#f59e0b" }}>外す</strong></li>
            <li>「入力」に上記 URL を貼り付ける</li>
            <li>「入力形式」に <code style={{ background:"#1a1a1a", padding:"1px 6px", borderRadius:3 }}>mpegts</code> を入力</li>
            <li>「OK」で確定</li>
          </ol>
        </div>
        <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:6, fontSize:12, color:"#fcd34d" }}>
          ⚠️ このメディアソースは<strong>受信・モニタリング専用</strong>です。
        </div>
      </div>
    </div>
  );
}

export default function ConnectionInfoPanel({ srt, win, provisionStatus, planKey }: ConnectionInfoPanelProps) {
  const items: SrtItem[] = srt?.items ?? [];
  const hasSingleUrl = !items.length && !!srt?.srt_url;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {provisionStatus !== "ready" && (
        <div style={{ color:"#bbb" }}>
          現在の状態: <b style={{ color:"#e63946" }}>{provisionStatus}</b><br />
          {provisionStatus === "queued" || provisionStatus === "running"
            ? "準備中です。しばらく待ってから再読み込みしてください。"
            : provisionStatus === "failed"
            ? "準備に失敗しました。管理者に連絡してください。"
            : "未準備です（確定後に準備が開始されます）。"}
        </div>
      )}
      {items.length > 0 ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:13, color:"#aaa", marginBottom:2 }}>
            ※ スマートフォン／ネットワークカメラ側の SRT 送信先として設定してください（{srt?.camera_count ?? items.length} 台）
          </div>
          {items.map((item, idx) => (
            <CameraCard key={item.streamid ?? idx} item={item} index={idx} />
          ))}
        </div>
      ) : hasSingleUrl ? (
        <div style={{ background:"#0f0f0f", border:"1px solid #222", borderRadius:10, padding:"14px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#999", marginBottom:8 }}>SRT URL（ワンライナー）</div>
          <code style={{ display:"block", fontSize:13, color:"#fff", wordBreak:"break-all" }}>{srt!.srt_url}</code>
          <div style={{ fontSize:13, color:"#aaa", marginTop:8 }}>※ SRT 送信先として貼り付けてください</div>
        </div>
      ) : (
        <div style={{ color:"#bbb" }}>SRT 情報はまだ発行されていません。</div>
      )}
      {items.length > 0 && <ObsCard items={items} />}
      {provisionStatus === "ready" && win && (
        <div style={{ background:"#0f0f0f", border:"1px solid #222", borderRadius:10, padding:"14px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#999", marginBottom:8 }}>Windows（OBS）接続</div>
          <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:"8px 10px", fontSize:13 }}>
            <div style={{ color:"#aaa" }}>RDP Host</div><div style={{ color:"#fff", fontFamily:"monospace" }}>{win.rdp_host}:{win.rdp_port}</div>
            <div style={{ color:"#aaa" }}>Username</div><div style={{ color:"#fff", fontFamily:"monospace" }}>{win.username}</div>
            <div style={{ color:"#aaa" }}>Password</div><div style={{ color:"#fff", fontFamily:"monospace" }}>{win.password}</div>
          </div>
          {win.note && <div style={{ fontSize:13, color:"#aaa", marginTop:10 }}>{win.note}</div>}
        </div>
      )}
    </div>
  );
}
