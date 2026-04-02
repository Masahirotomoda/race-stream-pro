#!/usr/bin/env python3
import os, pathlib

ROOT = pathlib.Path(os.getenv("RSP_ROOT", pathlib.Path.home() / "projects" / "race-stream-pro"))
p = ROOT / "apps/web/app/reservations/[id]/live/page.tsx"

txt = p.read_text(encoding="utf-8")

if "live_chat?v=VIDEO_ID" not in txt and "v=VIDEO_ID" not in txt:
    raise SystemExit("❌ 'VIDEO_ID' placeholder not found in live page. Please paste the iframe src lines around live_chat.")

# 代表パターンをまとめて置換
txt2 = txt.replace("live_chat?v=VIDEO_ID", "live_chat?v=${youtubeVideoId}")
txt2 = txt2.replace("v=VIDEO_ID&embed_domain=", "v=${youtubeVideoId}&embed_domain=")

p.write_text(txt2, encoding="utf-8")
print("✅ patched:", p)
