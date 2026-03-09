from pathlib import Path
import re, time

ROOT = Path("apps/web")

def backup(p: Path):
    if p.exists():
        b = p.with_suffix(p.suffix + f".bak.{int(time.time())}")
        b.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
        print("🧷 backup:", b)

def find_layout():
    # よくある配置を優先
    candidates = [
        ROOT / "app/layout.tsx",
        ROOT / "src/app/layout.tsx",
    ]
    for c in candidates:
        if c.exists():
            return c

    # それ以外は探索
    hits = list(ROOT.glob("**/layout.tsx"))
    if not hits:
        raise SystemExit("ERROR: layout.tsx not found under apps/web")
    return hits[0]

def find_or_create_globals_css(layout_path: Path) -> Path:
    # 1) 既存 globals.css を優先探索
    hits = list(ROOT.glob("**/globals.css"))
    if hits:
        # layout.tsx と同じ階層に近いものを優先
        hits_sorted = sorted(hits, key=lambda p: len(p.parts))
        return hits_sorted[0]

    # 2) 無ければ layout.tsx と同じディレクトリに作る（Nextの定石）
    return layout_path.parent / "globals.css"

def ensure_layout_imports_globals(layout_path: Path, globals_path: Path):
    backup(layout_path)
    s = layout_path.read_text(encoding="utf-8")

    # layout.tsx 内の import './globals.css' を確認
    if re.search(r'from\s+["\']\./globals\.css["\']', s) or re.search(r'import\s+["\']\./globals\.css["\']', s):
        return

    # globals.css が layout と同階層に無い場合でも、まずは同階層に寄せる（相対importが安全）
    # ※globals.css を同階層に作るので import "./globals.css" が必ず成立する
    if globals_path.parent != layout_path.parent:
        # 既存の globals.css が別場所にあった場合の相対計算もできるが、
        # 今回は「無い場合は同階層に作る」方針のため、ここは基本通らない
        pass

    # import 群の末尾に追加
    m = re.search(r"^(?:import .*?\n)+", s)
    if m:
        ins_at = m.end(0)
        s = s[:ins_at] + 'import "./globals.css";\n' + s[ins_at:]
    else:
        s = 'import "./globals.css";\n' + s

    layout_path.write_text(s, encoding="utf-8")
    print("✅ patched imports:", layout_path)

def patch_globals_css(globals_path: Path):
    globals_path.parent.mkdir(parents=True, exist_ok=True)

    if globals_path.exists():
        backup(globals_path)
        css = globals_path.read_text(encoding="utf-8")
    else:
        css = ""

    start = "/* RSP_THEME_TOKENS_START */"
    end   = "/* RSP_THEME_TOKENS_END */"

    block = f"""
{start}
/* Theme tokens (light + dark) - fixes black-on-black across the app */
:root {{
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --muted-foreground: 215.4 16.3% 46.9%;
  color-scheme: light;
}}

@media (prefers-color-scheme: dark) {{
  :root {{
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted-foreground: 215 20.2% 75%;
    color-scheme: dark;
  }}
}}

.dark {{
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --muted-foreground: 215 20.2% 75%;
  color-scheme: dark;
}}

.light {{
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --muted-foreground: 215.4 16.3% 46.9%;
  color-scheme: light;
}}

html, body {{
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  margin: 0;
}}
{end}
""".strip()

    if start in css and end in css:
        css = re.sub(re.escape(start) + r"[\s\S]*?" + re.escape(end), block, css)
    else:
        css = css.rstrip() + "\n\n" + block + "\n"

    globals_path.write_text(css, encoding="utf-8")
    print("✅ patched:", globals_path)

def patch_inline_backgrounds():
    # 直書き "#0a0a0a" を token に置換（あなたの rg 結果に出ていた箇所を中心に）
    # layout.tsx / 各 page.tsx をまとめて置換する
    files = list(ROOT.glob("**/*.tsx"))

    for p in files:
        s = p.read_text(encoding="utf-8")

        if "#0a0a0a" not in s and "#0A0A0A" not in s:
            continue

        backup(p)

        # background 置換
        s = s.replace('background: "#0a0a0a"', 'background: "hsl(var(--background))"')
        s = s.replace('background: "#0A0A0A"', 'background: "hsl(var(--background))"')

        # 既に color を指定している場合は token に
        s = s.replace('color: "#fff"', 'color: "hsl(var(--foreground))"')
        s = s.replace('color: "#ffffff"', 'color: "hsl(var(--foreground))"')
        s = s.replace('color: "#999"', 'color: "hsl(var(--muted-foreground))"')

        # 「背景だけ指定して color が無い」style を雑に補強（今回の layout.tsx がまさにこれ）
        # background: "hsl(var(--background))" がある行の近くに color がなければ追加
        # ※厳密パースではないが、今回のコード形（style={{ ... background: "..." }}}）には十分効く
        s = re.sub(
            r'background:\s*"hsl\(var\(--background\)\)"(?![^}]*color:)',
            'background: "hsl(var(--background))", color: "hsl(var(--foreground))"',
            s
        )

        p.write_text(s, encoding="utf-8")
        print("✅ patched:", p)

def main():
    layout = find_layout()
    globals_css = find_or_create_globals_css(layout)

    # globals.css が無いなら layout と同階層に作る（importも付ける）
    if not globals_css.exists():
        globals_css = layout.parent / "globals.css"

    ensure_layout_imports_globals(layout, globals_css)
    patch_globals_css(globals_css)
    patch_inline_backgrounds()

    print("\n➡️ Done. Now run: docker compose restart web")

main()
