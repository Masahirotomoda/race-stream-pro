"use client";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { locales } from "../../i18n";

/* ══════════════════════════════════════════
   Hooks
══════════════════════════════════════════ */
function useFadeIn(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function useCountUp(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let t: number | null = null;
    const tick = (ts: number) => {
      if (!t) t = ts;
      const p = Math.min((ts - t) / duration, 1);
      setCount(Math.floor(p * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [start, target, duration]);
  return count;
}

/* ══════════════════════════════════════════
   Primitives
══════════════════════════════════════════ */
function Fade({
  children, delay = 0, y = 50, className = "", as: Tag = "div" as React.ElementType, style: extraStyle,
}: {
  children?: React.ReactNode; delay?: number; y?: number;
  className?: string; as?: React.ElementType; style?: React.CSSProperties;
}) {
  const { ref, visible } = useFadeIn();
  return (
    <Tag
      ref={ref as any}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 1s cubic-bezier(.4,0,.2,1) ${delay}ms,
                     transform 1s cubic-bezier(.4,0,.2,1) ${delay}ms`,
        ...extraStyle,
      }}
    >
      {children}
    </Tag>
  );
}

/* 言語フラグ */
const LANG_META: Record<string, { flag: string; label: string }> = {
  ja: { flag: "🇯🇵", label: "日本語" },
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
  fr: { flag: "🇫🇷", label: "Français" },
};

function LangSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "rgba(255,255,255,.07)",
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 6,
          color: "#fff",
          padding: "6px 12px",
          cursor: "pointer",
          fontSize: ".82rem",
          letterSpacing: ".05em",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {LANG_META[locale]?.flag} {LANG_META[locale]?.label} ▾
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          background: "#111",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 8,
          overflow: "hidden",
          minWidth: 140,
          zIndex: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,.6)",
        }}>
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => { router.push(`/${l}`); setOpen(false); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                background: l === locale ? "rgba(220,38,38,.15)" : "transparent",
                border: "none",
                color: l === locale ? "#ef4444" : "rgba(255,255,255,.75)",
                fontSize: ".85rem",
                cursor: "pointer",
                letterSpacing: ".05em",
                textAlign: "left",
              }}
              onMouseEnter={e => { if (l !== locale) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)"; }}
              onMouseLeave={e => { if (l !== locale) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {LANG_META[l].flag} {LANG_META[l].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   Counter Card
══════════════════════════════════════════ */
function CounterCard({ target, unit, label }: { target: number; unit: string; label: string }) {
  const { ref, visible } = useFadeIn(0.3);
  const n = useCountUp(target, 1800, visible);
  return (
    <div ref={ref} style={{
      textAlign: "center", padding: "32px 24px",
      border: "1px solid rgba(220,38,38,.2)",
      borderRadius: 2,
    }}>
      <div style={{ fontSize: "clamp(2.5rem,5vw,4rem)", fontWeight: 900, letterSpacing: "-.02em", color: "#fff" }}>
        {n}<span style={{ color: "#dc2626" }}>{unit}</span>
      </div>
      <div style={{ fontSize: ".75rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#555", marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main
══════════════════════════════════════════ */
export default function LandingPage() {
  const t = useTranslations();
  const locale = useLocale();

  const navLinks = (tRaw("footer.links") as string[]);
  const steps = (tRaw("steps.items") as {step:string;title:string;desc:string;icon:string}[]);
  const plans = (tRaw("pricing.plans") as {name:string;price:string;unit:string;desc:string;features:string[];recommended?:boolean}[]);
  const f1items = (tRaw("feature1.items") as string[]);
  const f2items = (tRaw("feature2.items") as string[]);
  const f3items = (tRaw("feature3.items") as string[]);

  return (
    <div style={{ background: "#080808", color: "#fff", fontFamily: "'Inter','Noto Sans JP',sans-serif", overflowX: "hidden" }}>

      {/* ── グローバルCSS ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #dc2626; border-radius: 2px; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes pulse-glow {
          0%,100% { box-shadow: 0 0 20px rgba(220,38,38,.4); }
          50% { box-shadow: 0 0 40px rgba(220,38,38,.8), 0 0 80px rgba(220,38,38,.3); }
        }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ── βテスト告知バー ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(0,0,0,.9)",
        borderBottom: "1px solid rgba(220,38,38,.3)",
        overflow: "hidden", height: 32,
        display: "flex", alignItems: "center",
      }}>
        <div style={{
          display: "flex", whiteSpace: "nowrap",
          animation: "marquee 30s linear infinite",
        }}>
          {[0,1].map(i => (
            <span key={i} style={{ padding: "0 48px", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase" }}>
              <span style={{ color: "#dc2626" }}>●</span>
              {" "}{t("banner.text")}{" "}
              <span style={{ color: "rgba(255,255,255,.35)", margin: "0 16px" }}>|</span>
              {t("banner.schedule")}{" "}
              <span style={{ color: "rgba(255,255,255,.35)", margin: "0 16px" }}>|</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── ナビゲーション ── */}
      <nav style={{
        position: "fixed", top: 32, left: 0, right: 0, zIndex: 99,
        padding: "0 40px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(8,8,8,.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: ".08em" }}>
            <span style={{ color: "#dc2626" }}>RACE</span>
            <span style={{ color: "#fff" }}>STREAM</span>
            <span style={{ color: "#555" }}>PRO</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <LangSwitcher />
          <Link href="/login" style={{ color: "rgba(255,255,255,.5)", fontSize: ".85rem", letterSpacing: ".1em", textDecoration: "none", transition: "color .2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.5)")}>
            {t("nav.login")}
          </Link>
          <Link href="/register" style={{
            background: "#dc2626", color: "#fff",
            padding: "8px 20px", borderRadius: 2,
            fontSize: ".82rem", fontWeight: 700, letterSpacing: ".1em",
            textDecoration: "none", textTransform: "uppercase",
            transition: "background .2s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#ef4444")}
            onMouseLeave={e => (e.currentTarget.style.background = "#dc2626")}>
            {t("nav.register")}
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section style={{ position: "relative", height: "100vh", minHeight: 600, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 96 }}>
        {/* YouTube背景 */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <iframe
            src="https://www.youtube.com/embed/RMbAeEmcjjc?autoplay=1&mute=1&loop=1&playlist=RMbAeEmcjjc&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1"
            style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "177.78vh", height: "56.25vw", minWidth: "100%", minHeight: "100%", border: "none", pointerEvents: "none" }}
            allow="autoplay"
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(8,8,8,.3) 0%, rgba(8,8,8,.55) 50%, rgba(8,8,8,1) 100%)" }} />
        </div>

        <div style={{ position: "relative", textAlign: "center", padding: "0 24px", maxWidth: 900, margin: "0 auto" }}>
          <Fade y={30} delay={0}>
            <div style={{ display: "inline-block", fontSize: ".7rem", letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", border: "1px solid rgba(255,255,255,.15)", padding: "6px 16px", marginBottom: 32 }}>
              {t("hero.badge")}
            </div>
          </Fade>
          <Fade y={50} delay={150}>
            <h1 style={{ fontSize: "clamp(2.8rem,7vw,5.5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-.03em", marginBottom: 28 }}>
              {t("hero.h1a")}<br />
              <span style={{ color: "#dc2626" }}>{t("hero.h1b")}</span><br />
              {t("hero.h1c")}
            </h1>
          </Fade>
          <Fade y={30} delay={300}>
            <p style={{ fontSize: "clamp(.95rem,2vw,1.15rem)", color: "rgba(255,255,255,.6)", lineHeight: 1.8, marginBottom: 48, maxWidth: 640, margin: "0 auto 48px" }}>
              {t("hero.sub")}
            </p>
          </Fade>
          <Fade y={20} delay={450}>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
              <Link href="/register" style={{
                background: "#dc2626", color: "#fff",
                padding: "16px 36px", borderRadius: 2,
                fontSize: "1rem", fontWeight: 700, letterSpacing: ".08em",
                textDecoration: "none", textTransform: "uppercase",
                animation: "pulse-glow 3s ease-in-out infinite",
              }}>
                {t("hero.cta")}
              </Link>
              <Link href="/login" style={{
                background: "transparent", color: "rgba(255,255,255,.65)",
                padding: "16px 36px", borderRadius: 2,
                fontSize: "1rem", letterSpacing: ".08em",
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,.2)",
              }}>
                {t("hero.login")}
              </Link>
            </div>
          </Fade>
          <Fade y={10} delay={600}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: ".78rem", color: "rgba(255,255,255,.35)", letterSpacing: ".1em" }}>
              <span style={{ color: "#dc2626", fontSize: ".6rem" }}>●</span>
              {t("hero.betaBadge")}
              <span style={{ color: "rgba(255,255,255,.2)" }}>|</span>
              {t("hero.betaSub")}
            </div>
          </Fade>
          <Fade y={10} delay={750}>
            <a
              href={t("campfire.url")}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                padding: "10px 20px",
                background: "rgba(234,88,12,.12)",
                border: "1px solid rgba(234,88,12,.4)",
                borderRadius: 4,
                color: "#fb923c",
                fontSize: ".8rem",
                fontWeight: 700,
                letterSpacing: ".08em",
                textDecoration: "none",
                transition: "background .2s, border-color .2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(234,88,12,.22)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(234,88,12,.7)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(234,88,12,.12)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(234,88,12,.4)";
              }}
            >
              {t("campfire.badge")}
              <span style={{ opacity: 0.6, fontSize: ".75rem" }}>｜ {t("campfire.link")}</span>
            </a>
          </Fade>
        </div>

        {/* スクロール矢印 */}
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", animation: "float 2s ease-in-out infinite", color: "rgba(255,255,255,.3)", fontSize: "1.5rem" }}>↓</div>
      </section>

      {/* ══════════════════════════════════════
          STATS
      ══════════════════════════════════════ */}
      <section style={{ padding: "80px 40px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
          <CounterCard target={8} unit="" label={t("stats.label_cameras")} />
          <CounterCard target={1} unit="" label={t("stats.label_latency")} />
          <CounterCard target={99} unit="%" label={t("stats.label_uptime")} />
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURE 1
      ══════════════════════════════════════ */}
      <section style={{ padding: "160px 0", position: "relative" }}>
        <div style={{ position: "relative", height: "60vh", minHeight: 400, overflow: "hidden", background: "linear-gradient(135deg,#0a0a0a 0%,#1a0a0a 100%)" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(220,38,38,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(220,38,38,.03) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
          <div style={{ position: "absolute", bottom: 60, left: 60 }}>
            <Fade y={40} delay={0}>
              <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 20 }}>
                {t("feature1.tag")}
              </div>
              <h2 style={{ fontSize: "clamp(1.8rem,4vw,3.5rem)", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.02em" }}>
                {t("feature1.h2a")}<br />{t("feature1.h2b")}
              </h2>
            </Fade>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ display: "flex", gap: 80, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Fade delay={0} style={{ flex: "1 1 300px" }}>
              <p style={{ fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 300, lineHeight: 1.6, color: "rgba(255,255,255,.9)", letterSpacing: ".02em" }}>
                {t("feature1.body").split("\n").map((line, i) => <span key={i}>{line}<br /></span>)}
              </p>
            </Fade>
            <Fade delay={150} style={{ flex: "1 1 280px" }}>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 20 }}>
                {f1items.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, color: "rgba(255,255,255,.55)", fontSize: ".9rem", letterSpacing: ".05em" }}>
                    <span style={{ color: "#dc2626", marginTop: 3, flexShrink: 0 }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Fade>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURE 2
      ══════════════════════════════════════ */}
      <section style={{ padding: "160px 0", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px", display: "flex", gap: 80, alignItems: "center", flexWrap: "wrap" }}>
          <Fade style={{ flex: "1 1 400px" }}>
            <div style={{ aspectRatio: "16/9", background: "linear-gradient(135deg,#111 0%,#1a0808 100%)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(220,38,38,.15)" }}>
              <span style={{ color: "rgba(255,255,255,.15)", fontSize: ".8rem", letterSpacing: ".15em" }}>SCREENSHOT</span>
            </div>
          </Fade>
          <Fade delay={200} style={{ flex: "1 1 340px" }}>
            <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 20 }}>{t("feature2.tag")}</div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.02em", marginBottom: 32 }}>
              {t("feature2.h2a")}<br />{t("feature2.h2b")}
            </h2>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {f2items.map((item, i) => (
                <li key={i} style={{ display: "flex", gap: 14, color: "rgba(255,255,255,.55)", fontSize: ".88rem" }}>
                  <span style={{ color: "#dc2626", flexShrink: 0 }}>—</span>{item}
                </li>
              ))}
            </ul>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURE 3
      ══════════════════════════════════════ */}
      <section style={{ padding: "200px 0", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(220,38,38,.08) 0%, transparent 70%)" }} />
        <div style={{ position: "relative", textAlign: "center", padding: "0 40px" }}>
          <Fade>
            <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 24 }}>{t("feature3.tag")}</div>
            <h2 style={{ fontSize: "clamp(2.5rem,6vw,5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-.03em", marginBottom: 60 }}>
              {t("feature3.h2a")}<br />{t("feature3.h2b")}
            </h2>
          </Fade>
          <Fade delay={200}>
            <ul style={{ listStyle: "none", display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", maxWidth: 800, margin: "0 auto" }}>
              {f3items.map((item, i) => (
                <li key={i} style={{ color: "rgba(255,255,255,.45)", fontSize: ".88rem", letterSpacing: ".05em", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "#dc2626", flexShrink: 0 }}>—</span>{item}
                </li>
              ))}
            </ul>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════════
          STEPS
      ══════════════════════════════════════ */}
      <section style={{ padding: "160px 40px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <Fade>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, letterSpacing: "-.02em", textAlign: "center", marginBottom: 16 }}>
              {t("steps.title")}
            </h2>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: ".9rem", marginBottom: 80 }}>{t("steps.sub")}</p>
          </Fade>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {steps.map((s, i) => (
              <Fade key={i} delay={i * 100}>
                <div style={{ display: "flex", gap: 40, padding: "40px 0", borderBottom: "1px solid rgba(255,255,255,.06)", alignItems: "flex-start" }}>
                  <div style={{ fontSize: "3rem", lineHeight: 1, flexShrink: 0, width: 60, textAlign: "center" }}>{s.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".65rem", letterSpacing: ".2em", color: "#dc2626", marginBottom: 8 }}>{s.step}</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontSize: ".88rem", color: "rgba(255,255,255,.45)", lineHeight: 1.7 }}>{s.desc}</div>
                  </div>
                </div>
              </Fade>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          PRICING
      ══════════════════════════════════════ */}
      <section style={{ padding: "160px 40px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Fade>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, letterSpacing: "-.02em", textAlign: "center", marginBottom: 16 }}>
              {t("pricing.title")}
            </h2>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: ".9rem", marginBottom: 16 }}>{t("pricing.sub")}</p>
            <p style={{ textAlign: "center", color: "#dc2626", fontSize: ".78rem", letterSpacing: ".1em", marginBottom: 64 }}>{t("pricing.note")}</p>
          </Fade>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24, marginBottom: 32 }}>
            {plans.map((plan, i) => (
              <Fade key={i} delay={i * 150}>
                <div style={{
                  padding: "48px 36px",
                  border: plan.recommended ? "1px solid rgba(220,38,38,.5)" : "1px solid rgba(255,255,255,.08)",
                  borderRadius: 4,
                  position: "relative",
                  transition: "border-color .3s, box-shadow .3s",
                  boxShadow: plan.recommended ? "0 0 40px rgba(220,38,38,.15)" : "none",
                }}>
                  {plan.recommended && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#dc2626", color: "#fff", fontSize: ".65rem", fontWeight: 700, letterSpacing: ".15em", padding: "4px 16px", textTransform: "uppercase" }}>
                      RECOMMENDED
                    </div>
                  )}
                  <div style={{ fontSize: ".65rem", letterSpacing: ".2em", color: "#dc2626", textTransform: "uppercase", marginBottom: 16 }}>{plan.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-.02em" }}>{plan.price}</span>
                    <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".85rem" }}>{plan.unit}</span>
                  </div>
                  <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", lineHeight: 1.7, marginBottom: 32, whiteSpace: "pre-line" }}>{plan.desc}</p>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {plan.features.map((f, j) => (
                      <li key={j} style={{ fontSize: ".85rem", color: "rgba(255,255,255,.6)", display: "flex", gap: 10 }}>
                        <span style={{ color: "#dc2626" }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Fade>
            ))}
          </div>
          <Fade delay={300}>
            <div style={{ textAlign: "center", padding: "24px", border: "1px dashed rgba(255,255,255,.12)", borderRadius: 4 }}>
              <span style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", letterSpacing: ".05em" }}>
                {t("pricing.cameraOption")}：{t("pricing.cameraPrice")}
              </span>
            </div>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CTA
      ══════════════════════════════════════ */}
      <section style={{ padding: "200px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,.05)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center bottom, rgba(220,38,38,.1) 0%, transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <Fade>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 40,
              padding: "12px 24px",
              background: "rgba(234,88,12,.1)",
              border: "1px solid rgba(234,88,12,.35)",
              borderRadius: 4,
            }}>
              <span style={{ fontSize: "1rem" }}>🔥</span>
              <span style={{ fontSize: ".82rem", color: "#fb923c", fontWeight: 600, letterSpacing: ".05em", lineHeight: 1.6 }}>
                {t("campfire.badge").replace("🔥 ", "")}
              </span>
              <a
                href={t("campfire.url")}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#fb923c", fontSize: ".78rem", opacity: 0.7, textDecoration: "underline", flexShrink: 0 }}
              >
                {t("campfire.link")}
              </a>
            </div>
            <h2 style={{ fontSize: "clamp(2rem,5vw,4rem)", fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.2, marginBottom: 32 }}>
              {t("cta.h2a")}<br />
              <span style={{ color: "#dc2626" }}>{t("cta.h2b")}</span>
            </h2>
            <p style={{ color: "rgba(255,255,255,.4)", fontSize: ".95rem", lineHeight: 1.8, marginBottom: 48 }}>
              {t("cta.sub1")}<br />{t("cta.sub2")}
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/register" style={{
                background: "#dc2626", color: "#fff",
                padding: "18px 44px", borderRadius: 2,
                fontSize: "1rem", fontWeight: 700, letterSpacing: ".1em",
                textDecoration: "none", textTransform: "uppercase",
                animation: "pulse-glow 3s ease-in-out infinite",
              }}>
                {t("cta.button")}
              </Link>
              <Link href="/login" style={{
                background: "transparent", color: "rgba(255,255,255,.55)",
                padding: "18px 44px", borderRadius: 2,
                fontSize: "1rem", letterSpacing: ".08em",
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,.15)",
              }}>
                {t("cta.login")}
              </Link>
            </div>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER
      ══════════════════════════════════════ */}
      <footer style={{ padding: "40px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <span style={{ fontSize: ".78rem", color: "rgba(255,255,255,.25)", letterSpacing: ".05em" }}>{t("footer.copy")}</span>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/login" style={{ fontSize: ".78rem", color: "rgba(255,255,255,.3)", textDecoration: "none" }}>{navLinks[0]}</Link>
          <a href="mailto:info@rsp.beql.jp" style={{ fontSize: ".78rem", color: "rgba(255,255,255,.3)", textDecoration: "none" }}>{tRaw("footer.links")?.[1] ?? "Contact"}</a>
        </div>
      </footer>
    </div>
  );
}
