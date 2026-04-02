#!/usr/bin/env python3
import os, pathlib, re

ROOT = pathlib.Path(os.getenv("RSP_ROOT", pathlib.Path.home() / "projects" / "race-stream-pro"))
p = ROOT / "apps/web/app/reservations/[id]/live/page.tsx"
txt = p.read_text(encoding="utf-8")

# YouTube live_chat iframe を丸ごと削除（src に live_chat を含む iframe を対象）
pattern = re.compile(r"<iframe[^>]*youtube\.com\/live_chat[^>]*>\s*<\/iframe>\s*", re.IGNORECASE | re.MULTILINE)
new_txt, n = pattern.subn("", txt)

# ついでに placeholder VIDEO_ID が残っていたら除去（将来の誤爆防止）
new_txt = new_txt.replace("live_chat?v=VIDEO_ID", "live_chat?v=${youtubeVideoId}")

# 「YouTube」セクション内に説明文＋リンクを差し込み（最初の YouTube プレイヤー iframe の直後に入れる）
insertion = """
                  <div className="px-3 py-2 text-xs text-neutral-400 bg-neutral-950 border-t border-neutral-800">
                    YouTubeコメントはこのページの「コメントフィード（リアルタイム）」に表示します（Google連携が必要）。
                    <a className="ml-2 text-blue-400 underline" href={`https://www.youtube.com/watch?v=${youtubeVideoId}`} target="_blank" rel="noreferrer">
                      YouTubeでチャットを開く
                    </a>
                  </div>
"""

# YouTube プレイヤー iframe を探して、その直後に挿入
marker = r'(<iframe className="w-full aspect-video" src=\{`https:\/\/www\.youtube\.com\/embed\/\$\{youtubeVideoId\}\?autoplay=1&mute=1`\} allow="autoplay; encrypted-media" \/>[\s\S]*?)'
m = re.search(marker, new_txt)
if not m:
    # 既存の書式違いを考慮して、よりゆるいマーカー
    marker2 = r'(<iframe[^>]*youtube\.com\/embed\/\$\{youtubeVideoId\}[^>]*>?\s*<\/iframe>|<iframe[^>]*/>)'
    m2 = re.search(marker2, new_txt, flags=re.IGNORECASE)
    if m2:
        idx = m2.end()
        new_txt = new_txt[:idx] + insertion + new_txt[idx:]
    else:
        # 見つからない場合は説明を入れず、iframe削除だけ適用
        pass
else:
    idx = m.end()
    new_txt = new_txt[:idx] + insertion + new_txt[idx:]

p.write_text(new_txt, encoding="utf-8")
print(f"✅ patched: {p} (removed live_chat iframes: {n})")
