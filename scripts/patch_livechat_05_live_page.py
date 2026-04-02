#!/usr/bin/env python3
import os
import pathlib

ROOT = pathlib.Path(os.getenv("RSP_ROOT", pathlib.Path.home() / "projects" / "race-stream-pro"))

def write(rel_path: str, content: str):
    p = ROOT / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("✅ wrote:", p)

write(
  "apps/web/app/reservations/[id]/live/page.tsx",
r'''"use client";

import React, { useEffect, useMemo, useRef, useState, use } from "react";

// Twitch IRC docs: https://dev.twitch.tv/docs/irc/
// YouTube liveChatMessages.list docs: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list

type MonitorResponse = {
  ok?: boolean;
  reservation?: {
    id: string;
    youtube_broadcast_url: string | null;
    twitch_channel_url: string | null;
  };
  youtube?: {
    videoId: string | null;
    live: boolean | null;
    viewerCount: number | null;
    startedAt: string | null;
    note?: string | null;
  } | null;
  twitch?: {
    channel: string | null;
    live: boolean | null;
    viewerCount: number | null;
    startedAt: string | null;
    note?: string | null;
  } | null;
  generatedAt?: string;
};

type ChatMsg = {
  platform: "twitch" | "youtube";
  id: string;
  publishedAt: string;
  authorName: string;
  authorPhotoUrl?: string;
  text: string;
};

function parseTwitchChannel(urlStr: string | null | undefined): string | null {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/").filter(Boolean);
    const ch = parts[0];
    if (!ch) return null;
    return ch.toLowerCase();
  } catch {
    return null;
  }
}

function parseYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    const v = u.searchParams.get("v");
    if (v) return v;

    if (u.hostname === "youtu.be") {
      const p = u.pathname.split("/").filter(Boolean)[0];
      return p || null;
    }

    const parts = u.pathname.split("/").filter(Boolean);
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && liveIdx + 1 < parts.length) return parts[liveIdx + 1];

    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && shortsIdx + 1 < parts.length) return parts[shortsIdx + 1];

    return null;
  } catch {
    return null;
  }
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function playBeep() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 120);
  } catch {}
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 text-neutral-100 px-3 py-2 rounded-md shadow">
      {text}
    </div>
  );
}

export default function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [monitor, setMonitor] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [mentionOnly, setMentionOnly] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [ytLinked, setYtLinked] = useState(false);
  const [ytPageToken, setYtPageToken] = useState<string>("");
  const ytTimer = useRef<number | null>(null);

  const twitchWs = useRef<WebSocket | null>(null);
  const twitchNick = useMemo(() => `justinfan${Math.floor(Math.random() * 1_000_000)}`, []);

  const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const res = await fetch(`/api/reservations/${id}/monitor`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setMonitor(data);
        setLoading(false);
      } catch {
        if (!alive) return;
        setLoading(false);
      }
    }

    tick();
    const t = window.setInterval(tick, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, [id]);

  const twitchChannel = useMemo(() => parseTwitchChannel(monitor?.reservation?.twitch_channel_url ?? null), [monitor?.reservation?.twitch_channel_url]);
  const youtubeVideoId = useMemo(() => parseYouTubeVideoId(monitor?.reservation?.youtube_broadcast_url ?? null), [monitor?.reservation?.youtube_broadcast_url]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const ytStartedAt = monitor?.youtube?.startedAt ? new Date(monitor.youtube.startedAt).getTime() : null;
  const twStartedAt = monitor?.twitch?.startedAt ? new Date(monitor.twitch.startedAt).getTime() : null;

  const elapsedMs = useMemo(() => {
    const candidates = [ytStartedAt, twStartedAt].filter((x): x is number => typeof x === "number");
    if (candidates.length === 0) return 0;
    const start = Math.min(...candidates);
    return Math.max(0, now - start);
  }, [ytStartedAt, twStartedAt, now]);

  function showToast(s: string) {
    setToast(s);
    window.setTimeout(() => setToast(null), 1800);
  }

  function pushNotification(title: string, body: string) {
    if (!notifEnabled) return;
    if (Notification.permission !== "granted") return;
    try { new Notification(title, { body }); } catch {}
  }

  function maybeAlertOnMessage(m: ChatMsg) {
    if (!notifEnabled) return;
    if (mentionOnly && !m.text.includes("@")) return;

    pushNotification(`[${m.platform}] ${m.authorName}`, m.text.slice(0, 120));
    showToast(`新着: [${m.platform}] ${m.authorName}`);
    if (soundEnabled) playBeep();
  }

  useEffect(() => {
    if (!twitchChannel) return;

    if (twitchWs.current) {
      try { twitchWs.current.close(); } catch {}
      twitchWs.current = null;
    }

    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    twitchWs.current = ws;

    const addMsg = (m: ChatMsg) => {
      setChat(prev => {
        const next = [...prev, m];
        return next.slice(Math.max(0, next.length - 300));
      });
      maybeAlertOnMessage(m);
    };

    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK ${twitchNick}`);
      ws.send(`JOIN #${twitchChannel}`);
    };

    ws.onmessage = (ev) => {
      const raw = String(ev.data || "");
      const lines = raw.split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws.send(line.replace("PING", "PONG"));
          continue;
        }
        if (!line.includes(" PRIVMSG ")) continue;

        let tagsPart = "";
        let rest = line;
        if (line.startsWith("@")) {
          const sp = line.indexOf(" ");
          tagsPart = line.slice(1, sp);
          rest = line.slice(sp + 1);
        }

        const displayName = (() => {
          if (!tagsPart) return "TwitchUser";
          const tags = Object.fromEntries(tagsPart.split(";").map(kv => {
            const i = kv.indexOf("=");
            if (i < 0) return [kv, ""];
            return [kv.slice(0, i), kv.slice(i + 1)];
          }));
          return (tags as any)["display-name"] || "TwitchUser";
        })();

        const msgIdx = rest.indexOf(" :");
        const text = msgIdx >= 0 ? rest.slice(msgIdx + 2) : "";
        const publishedAt = new Date().toISOString();

        addMsg({
          platform: "twitch",
          id: `tw_${publishedAt}_${Math.random().toString(16).slice(2)}`,
          publishedAt,
          authorName: displayName,
          text,
        });
      }
    };

    return () => { try { ws.close(); } catch {} };
  }, [twitchChannel, twitchNick]);

  useEffect(() => {
    if (!youtubeVideoId) return;

    let stopped = false;

    async function poll() {
      if (stopped) return;

      try {
        const u = new URL(`/api/reservations/${id}/youtube-chat`, window.location.origin);
        if (ytPageToken) u.searchParams.set("pageToken", ytPageToken);

        const res = await fetch(u.toString(), { cache: "no-store" });
        const data = await res.json();

        if (stopped) return;

        if (data?.linked) {
          setYtLinked(true);

          const msgs: ChatMsg[] = (data.messages || []).map((m: any) => ({
            platform: "youtube",
            id: m.id || `yt_${Math.random().toString(16).slice(2)}`,
            publishedAt: m.publishedAt || new Date().toISOString(),
            authorName: m.authorName || "YouTubeUser",
            authorPhotoUrl: m.authorPhotoUrl || "",
            text: m.text || "",
          }));

          if (msgs.length > 0) {
            setChat(prev => {
              const seen = new Set(prev.map(x => x.id));
              const appended = msgs.filter(x => !seen.has(x.id));
              const next = [...prev, ...appended].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
              return next.slice(Math.max(0, next.length - 300));
            });

            for (const m of msgs.slice(-10)) maybeAlertOnMessage(m);
          }

          setYtPageToken(data.nextPageToken || "");
          const wait = Math.max(2000, Math.min(15000, Number(data.pollingIntervalMillis || 5000)));
          ytTimer.current = window.setTimeout(poll, wait) as unknown as number;
          return;
        } else {
          setYtLinked(false);
          ytTimer.current = window.setTimeout(poll, 10000) as unknown as number;
          return;
        }
      } catch {
        ytTimer.current = window.setTimeout(poll, 10000) as unknown as number;
      }
    }

    poll();

    return () => {
      stopped = true;
      if (ytTimer.current) window.clearTimeout(ytTimer.current);
      ytTimer.current = null;
    };
  }, [id, youtubeVideoId, ytPageToken, notifEnabled, mentionOnly, soundEnabled]);

  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  async function enableNotifications() {
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setNotifEnabled(true);
      showToast("通知を有効化しました");
    } else {
      showToast("通知が許可されませんでした");
    }
  }

  const merged = useMemo(() => [...chat].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)), [chat]);

  if (loading) return <div className="p-6 text-neutral-200">Loading...</div>;

  const ytLive = monitor?.youtube?.live;
  const twLive = monitor?.twitch?.live;

  return (
    <div className="p-6 text-neutral-100 bg-black min-h-screen">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold">配信中ライブ（コメント連携）</h1>
          <div className="text-sm text-neutral-400">Reservation: {id}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-sm" onClick={enableNotifications}>
            通知を許可
          </button>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={notifEnabled} onChange={(e) => setNotifEnabled(e.target.checked)} />通知ON</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={mentionOnly} onChange={(e) => setMentionOnly(e.target.checked)} />メンションのみ</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />通知音</label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-2">配信ステータス</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs border ${ytLive ? "border-red-500 text-red-300" : "border-neutral-700 text-neutral-300"}`}>
              YouTube: {ytLive ? "LIVE" : "OFF"}
            </span>
            <span className={`px-2 py-1 rounded text-xs border ${twLive ? "border-purple-500 text-purple-300" : "border-neutral-700 text-neutral-300"}`}>
              Twitch: {twLive ? "LIVE" : "OFF"}
            </span>
            <span className="px-2 py-1 rounded text-xs border border-neutral-700 text-neutral-300">
              経過: {fmtElapsed(elapsedMs)}
            </span>
          </div>

          <div className="mt-3 text-sm text-neutral-300">
            YouTube 視聴者: <span className="text-neutral-100">{monitor?.youtube?.viewerCount ?? "-"}</span><br />
            Twitch 視聴者: <span className="text-neutral-100">{monitor?.twitch?.viewerCount ?? "-"}</span>
          </div>

          <div className="mt-2 text-xs text-neutral-500">
            {monitor?.youtube?.note ? `YouTube: ${monitor.youtube.note}` : ""}
            {monitor?.twitch?.note ? ` / Twitch: ${monitor.twitch.note}` : ""}
          </div>

          <div className="mt-3">
            {youtubeVideoId && !ytLinked && (
              <a
                className="inline-block px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-sm"
                href={`/api/oauth/youtube/start?reservationId=${encodeURIComponent(id)}&next=${encodeURIComponent(`/reservations/${id}/live`)}`}
              >
                YouTube コメント通知を有効化（Google連携）
              </a>
            )}
          </div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 lg:col-span-2">
          <div className="text-sm text-neutral-400 mb-2">ライブプレビュー / チャット埋め込み</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-neutral-800 rounded-md overflow-hidden">
              <div className="px-3 py-2 text-xs text-neutral-400 bg-neutral-950 border-b border-neutral-800">YouTube</div>
              {youtubeVideoId ? (
                <div className="grid grid-rows-2">
                  <iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&mute=1`} allow="autoplay; encrypted-media" />
                  <iframe className="w-full h-[320px]" src={`https://www.youtube.com/live_chat?v=${youtubeVideoId}&embed_domain=${encodeURIComponent(hostname)}`} />
                </div>
              ) : (
                <div className="p-3 text-sm text-neutral-500">YouTube 配信枠URLが未提出</div>
              )}
            </div>

            <div className="border border-neutral-800 rounded-md overflow-hidden">
              <div className="px-3 py-2 text-xs text-neutral-400 bg-neutral-950 border-b border-neutral-800">Twitch</div>
              {twitchChannel ? (
                <div className="grid grid-rows-2">
                  <iframe className="w-full aspect-video" src={`https://player.twitch.tv/?channel=${encodeURIComponent(twitchChannel)}&parent=${encodeURIComponent(hostname)}&muted=true`} allowFullScreen />
                  <iframe className="w-full h-[320px]" src={`https://www.twitch.tv/embed/${encodeURIComponent(twitchChannel)}/chat?parent=${encodeURIComponent(hostname)}`} />
                </div>
              ) : (
                <div className="p-3 text-sm text-neutral-500">Twitch 配信枠URLが未提出</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-neutral-400">コメントフィード（リアルタイム）</div>
            <div className="text-xs text-neutral-500">表示: 最新300件</div>
          </div>

          <div ref={feedRef} className="h-[360px] overflow-auto rounded-md border border-neutral-800 bg-black">
            {merged.length === 0 ? (
              <div className="p-3 text-sm text-neutral-500">コメント待機中…</div>
            ) : (
              merged.map((m) => (
                <div key={m.id} className="px-3 py-2 border-b border-neutral-900">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-neutral-400">
                      <span className={m.platform === "twitch" ? "text-purple-300" : "text-red-300"}>[{m.platform}]</span>{" "}
                      <span className="text-neutral-200">{m.authorName}</span>
                    </div>
                    <div className="text-[11px] text-neutral-600">{new Date(m.publishedAt).toLocaleTimeString()}</div>
                  </div>
                  <div className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{m.text}</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Twitch はブラウザが IRC WebSocket で直接受信し、YouTube は OAuth 連携後に Live Chat API で取得します。
          </div>
        </div>
      </div>

      {toast && <Toast text={toast} />}
    </div>
  );
}
'''
)
