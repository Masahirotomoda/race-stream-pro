"use client";

import { use, useEffect, useMemo, useState } from "react";
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

function fmtSeconds(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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
  } catch {
    return null;
  }
}

function parseTwitchChannel(url: string): string | null {
  try {
    const u = new URL(url);
    const ch = u.pathname.split("/").filter(Boolean)[0];
    if (!ch || ch === "videos") return null;
    return ch.toLowerCase();
  } catch {
    return null;
  }
}

export default function ReservationMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());

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

  useEffect(() => {
    load();
    const t1 = window.setInterval(load, 10000); // 10秒ごとに更新
    const t2 = window.setInterval(() => setNow(Date.now()), 1000); // タイマー更新
    return () => { window.clearInterval(t1); window.clearInterval(t2); };
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
    // “配信時間”は、取得できるならプラットフォームの startedAt を優先
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

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
            配信状態モニター
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            reservation: {id}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href={`/reservations/${id}`} style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 13 }}>
            ← 予約詳細へ
          </a>
          <LogoutButton />
        </div>
      </div>

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

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
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
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
            ※ APIキー未設定の場合は “—”
          </div>
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
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
              YouTube配信枠URLが未提出、または動画IDを解析できません。
            </div>
          )}
          {ytUrl && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)", wordBreak: "break-all" }}>
              URL: {ytUrl}
            </div>
          )}
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
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
              TwitchチャンネルURLが未提出、またはチャンネル名を解析できません。
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            Twitch埋め込みは <code>parent</code> が必須です（この画面では {twitchParent} を自動指定） [Source](https://dev.twitch.tv/docs/embed/video-and-clips/)
          </div>
          {twUrl && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)", wordBreak: "break-all" }}>
              URL: {twUrl}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
        Twitch の視聴者数/開始時刻は Helix Get Streams の <code>viewer_count</code>, <code>started_at</code>, <code>type</code> を利用します [Source](https://dev.twitch.tv/docs/api/reference/#get-streams)
        <br />
        YouTube は Data API の <code>videos.list</code>（<code>liveStreamingDetails</code> など）を利用します [Source](https://developers.google.com/youtube/v3/docs/videos/list)
      </div>
    </div>
  );
}
