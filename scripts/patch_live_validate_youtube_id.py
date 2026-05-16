#!/usr/bin/env python3
import os, pathlib, re

ROOT = pathlib.Path(os.getenv("RSP_ROOT", pathlib.Path.home() / "projects" / "race-stream-pro"))
p = ROOT / "apps/web/app/reservations/[id]/live/page.tsx"
txt = p.read_text(encoding="utf-8")

# parseYouTubeVideoId の直後で「11文字IDのみ許可」にする1行を注入
needle = "const youtubeVideoId = useMemo(() => parseYouTubeVideoId(monitor?.reservation?.youtube_broadcast_url ?? null), [monitor?.reservation?.youtube_broadcast_url]);"
if needle not in txt:
    raise SystemExit("❌ target line not found. Please paste the part around youtubeVideoId useMemo.")

replacement = """const youtubeVideoIdRaw = useMemo(
    () => parseYouTubeVideoId(monitor?.reservation?.youtube_broadcast_url ?? null),
    [monitor?.reservation?.youtube_broadcast_url]
  );
  const youtubeVideoId = useMemo(() => {
    if (!youtubeVideoIdRaw) return null;
    // YouTube videoId is typically 11 chars [A-Za-z0-9_-]
    if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoIdRaw)) return null;
    return youtubeVideoIdRaw;
  }, [youtubeVideoIdRaw]);"""

txt = txt.replace(needle, replacement)
p.write_text(txt, encoding="utf-8")
print("✅ patched:", p)
