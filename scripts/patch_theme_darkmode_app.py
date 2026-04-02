from pathlib import Path
import re, time

LAYOUT = Path("apps/web/app/layout.tsx")
GLOBALS = Path("apps/web/app/globals.css")

def backup(p: Path):
    if p.exists():
        b = p.with_suffix(p.suffix + f".bak.{int(time.time())}")
        b.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
        print("🧷 backup:", b)

def ensure_globals_css():
    GLOBALS.parent.mkdir(parents=True, exist_ok=True)
    if GLOBALS.exists():
        backup(GLOBALS)
        css = GLOBALS.read_text(encoding="utf-8")
    else:
        css = ""

    start = "/* RSP_THEME_TOKENS_START */"
    end   = "/* RSP_THEME_TOKENS_END */"

    block = f"""
{start}
/* Theme tokens (light + dark). Fix black-on-black reliably. */
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

    GLOBALS.write_text(css, encoding="utf-8")
    print("✅ patched:", GLOBALS)

def ensure_layout_import():
    if not LAYOUT.exists():
        raise SystemExit(f"ERROR: {LAYOUT} not found")
    backup(LAYOUT)
    s = LAYOUT.read_text(encoding="utf-8")

    if 'import "./globals.css";' in s:
        return

    # import 群の最後に追加
    m = re.search(r"^(?:import .*?\n)+", s)
    if m:
        ins = m.end(0)
        s = s[:ins] + 'import "./globals.css";\n' + s[ins:]
    else:
        s = 'import "./globals.css";\n' + s

    LAYOUT.write_text(s, encoding="utf-8")
    print("✅ patched imports:", LAYOUT)

def patch_inline_colors():
    # apps/web/app 配下の TSX を対象に、直書きカラーをトークンへ置換
    base = Path("apps/web/app")
    files = list(base.glob("**/*.tsx"))
    for p in files:
        txt = p.read_text(encoding="utf-8")
        if "#0a0a0a" not in txt and "#0A0A0A" not in txt and "#fff" not in txt and "#999" not in txt:
            continue
        backup(p)

        txt = txt.replace('background: "#0a0a0a"', 'background: "hsl(var(--background))"')
        txt = txt.replace('background: "#0A0A0A"', 'background: "hsl(var(--background))"')
        txt = txt.replace('color: "#fff"', 'color: "hsl(var(--foreground))"')
        txt = txt.replace('color: "#ffffff"', 'color: "hsl(var(--foreground))"')
        txt = txt.replace('color: "#999"', 'color: "hsl(var(--muted-foreground))"')

        # 背景だけ指定して color が無い style を補強（layout.tsx 対策）
        txt = re.sub(
            r'background:\s*"hsl\(var\(--background\)\)"(?![^}]*color:)',
            'background: "hsl(var(--background))", color: "hsl(var(--foreground))"',
            txt
        )

        p.write_text(txt, encoding="utf-8")
        print("✅ patched:", p)

def main():
    ensure_globals_css()
    ensure_layout_import()
    patch_inline_colors()
    print("\n➡️ Next: docker compose restart web")

main()
