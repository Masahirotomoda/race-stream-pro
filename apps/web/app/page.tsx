"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

function Stat({ value, unit, label, delay }: {
  value: number; unit: string; label: string; delay: number;
}) {
  const { ref, visible } = useFadeIn();
  const n = useCountUp(value, 1800, visible);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(30px)",
      transition: `opacity .9s ease ${delay}ms, transform .9s ease ${delay}ms`,
      textAlign: "center",
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
   Page
══════════════════════════════════════════ */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #000; color: #fff; font-family: -apple-system, 'Helvetica Neue', sans-serif; }

        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scrollBounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(8px); }
        }
        @keyframes glowPulse {
          0%,100% { box-shadow: 0 0 24px rgba(220,38,38,.5); }
          50%      { box-shadow: 0 0 48px rgba(220,38,38,.9), 0 0 80px rgba(220,38,38,.3); }
        }
        .btn-primary {
          display: inline-block;
          padding: 18px 56px;
          background: #dc2626;
          color: #fff;
          font-weight: 700;
          font-size: .95rem;
          letter-spacing: .12em;
          text-transform: uppercase;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: background .2s, transform .2s;
          animation: glowPulse 3s ease-in-out infinite;
        }
        .btn-primary:hover { background: #b91c1c; transform: scale(1.03); }
        .btn-ghost {
          display: inline-block;
          padding: 17px 48px;
          border: 1px solid rgba(255,255,255,.25);
          color: rgba(255,255,255,.7);
          font-size: .9rem;
          letter-spacing: .1em;
          text-decoration: none;
          transition: border-color .2s, color .2s;
        }
        .btn-ghost:hover { border-color: #fff; color: #fff; }
        .feature-img {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
        }
        .feature-img-placeholder {
          width: 100%;
          aspect-ratio: 16/9;
          background: #111;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 12px;
          color: #333;
          font-size: .8rem;
          letter-spacing: .1em;
        }
        .divider {
          width: 40px;
          height: 1px;
          background: #dc2626;
          margin: 0 auto 48px;
        }
        @media (max-width: 768px) {
          .feature-reverse { flex-direction: column !important; }
          .hide-sp { display: none !important; }
        }
      `}</style>

      {/* ══════════════════════════════════
          βテスト告知バー（マーキー）
      ══════════════════════════════════ */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        overflow: "hidden", height: 36,
        background: "#dc2626",
      }}>
        <div style={{
          display: "flex", whiteSpace: "nowrap", height: "100%", alignItems: "center",
          animation: "marquee 22s linear infinite",
        }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} style={{ padding: "0 48px", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase" }}>
              現在：招待制クローズドテスト中 &nbsp;／&nbsp; 2026年8月 βテスター募集開始予定 &nbsp;／&nbsp; 事前登録受付中
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════
          ナビゲーション
      ══════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 36, left: 0, right: 0, zIndex: 99,
        height: 64,
        background: scrolled ? "rgba(0,0,0,.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,.06)" : "none",
        transition: "background .4s, backdrop-filter .4s, border-color .4s",
        display: "flex", alignItems: "center",
        padding: "0 40px",
        animation: "fadeDown .6s ease both",
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: ".08em" }}>
            <span style={{ color: "#dc2626" }}>RACE</span>
            <span style={{ color: "#fff" }}>STREAM</span>
            <span style={{ color: "#555" }}>PRO</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <Link href="/login" style={{ color: "rgba(255,255,255,.5)", fontSize: ".85rem", letterSpacing: ".1em", textDecoration: "none", transition: "color .2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.5)")}>
            LOGIN
          </Link>
          <Link href="/register" style={{ color: "#fff", fontSize: ".85rem", letterSpacing: ".1em", textDecoration: "none", borderBottom: "1px solid #dc2626", paddingBottom: 2 }}>
            REGISTER
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════
          HERO — 全画面動画
      ══════════════════════════════════ */}
      <section style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#000" }}>
        {/* YouTube 全画面 */}
        <div style={{
          position: "absolute", inset: "-10%",
          pointerEvents: "none",
        }}>
          <iframe
            src="https://www.youtube.com/embed/RMbAeEmcjjc?autoplay=1&mute=1&loop=1&playlist=RMbAeEmcjjc&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1"
            allow="autoplay; encrypted-media"
            style={{ width: "100%", height: "100%", border: "none", objectFit: "cover" }}
          />
        </div>

        {/* オーバーレイ */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,.3) 0%, rgba(0,0,0,.55) 60%, rgba(0,0,0,.95) 100%)",
        }} />

        {/* 中央コンテンツ */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "0 24px",
        }}>
          <Fade y={30}>
            <div style={{ fontSize: ".7rem", letterSpacing: ".3em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 32 }}>
              Motorsport Streaming Platform
            </div>
          </Fade>

          <Fade y={40} delay={150}>
            <h1 style={{
              fontSize: "clamp(3rem,8vw,7rem)",
              fontWeight: 900,
              letterSpacing: "-.02em",
              lineHeight: 1.0,
              marginBottom: 8,
            }}>
              <span style={{ color: "#fff" }}>RACE</span>
              <span style={{ color: "#dc2626" }}>STREAM</span>
            </h1>
            <h1 style={{
              fontSize: "clamp(3rem,8vw,7rem)",
              fontWeight: 900,
              letterSpacing: "-.02em",
              lineHeight: 1.0,
              marginBottom: 40,
            }}>
              <span style={{ color: "#fff" }}>PRO</span>
            </h1>
          </Fade>

          <Fade y={30} delay={300}>
            <p style={{
              fontSize: "clamp(.9rem,1.5vw,1.1rem)",
              color: "rgba(255,255,255,.55)",
              letterSpacing: ".08em",
              lineHeight: 1.9,
              marginBottom: 48,
            }}>
              スマートフォン1台で、レース映像をプロ品質で届ける。<br className="hide-sp" />
              機材不要。初期費用ゼロ。
            </p>
          </Fade>

          <Fade y={20} delay={450}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "10px 20px",
              border: "1px solid rgba(234,179,8,.3)",
              background: "rgba(234,179,8,.05)",
              marginBottom: 48,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#facc15", display: "inline-block", animation: "glowPulse 2s ease infinite" }} />
              <span style={{ fontSize: ".75rem", color: "#facc15", letterSpacing: ".15em", textTransform: "uppercase" }}>
                2026.08 — β Tester Registration Opening
              </span>
            </div>
          </Fade>

          <Fade y={20} delay={550}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/register" className="btn-primary">事前登録する</Link>
              <Link href="/login" className="btn-ghost">ログイン</Link>
            </div>
          </Fade>
        </div>

        {/* スクロール矢印 */}
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          animation: "scrollBounce 2s ease infinite",
          color: "rgba(255,255,255,.3)", fontSize: ".65rem", letterSpacing: ".2em",
        }}>
          <span>SCROLL</span>
          <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
            <path d="M8 0v20M1 13l7 7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════
          NUMBERS
      ══════════════════════════════════ */}
      <section style={{ background: "#000", padding: "120px 40px", borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Fade className="divider" />
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 60,
          }}>
            <Stat value={8}  unit="台" label="Max Cameras"      delay={0}   />
            <Stat value={15} unit="分" label="Min Rental Unit"  delay={120} />
            <Stat value={0}  unit="円" label="Initial Cost"     delay={240} />
            <Stat value={5}  unit="分" label="Setup Time"       delay={360} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURE 01 — マルチカメラ
      ══════════════════════════════════ */}
      <section style={{ background: "#000" }}>
        {/* 全幅画像 */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div className="feature-img-placeholder" style={{ aspectRatio: "21/9" }}>
            <span style={{ fontSize: "2rem" }}>📷</span>
            <span>monitor-overview.png</span>
            <span style={{ fontSize: ".65rem", color: "#222" }}>1920×822 推奨</span>
          </div>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, rgba(0,0,0,.8) 0%, transparent 60%)",
            display: "flex", alignItems: "flex-end", padding: "60px 80px",
          }}>
            <Fade y={30}>
              <div>
                <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 20 }}>
                  Feature 01
                </div>
                <h2 style={{ fontSize: "clamp(1.8rem,4vw,3.5rem)", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.02em" }}>
                  複数カメラを、<br />一画面で。
                </h2>
              </div>
            </Fade>
          </div>
        </div>

        {/* テキスト説明 */}
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ display: "flex", gap: 80, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Fade delay={0} className="" style={{ flex: "1 1 300px" }}>
              <p style={{ fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 300, lineHeight: 1.6, color: "rgba(255,255,255,.9)", letterSpacing: ".02em" }}>
                最大8台のスマートフォンを<br />SRTプロトコルで同時受信。<br />
                ビットレート・パケットロスを<br />リアルタイムで可視化。
              </p>
            </Fade>
            <Fade delay={150} style={{ flex: "1 1 280px" }}>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 20 }}>
                {[
                  "最大8台のカメラを同時配信",
                  "ビットレートグラフをリアルタイム表示",
                  "パケットロス率の継続モニタリング",
                  "カメラ接続状態を一覧で管理",
                ].map((t, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, color: "rgba(255,255,255,.55)", fontSize: ".9rem", letterSpacing: ".05em" }}>
                    <span style={{ color: "#dc2626", marginTop: 3, flexShrink: 0 }}>—</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Fade>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURE 02 — 予約システム
      ══════════════════════════════════ */}
      <section style={{ background: "#050505" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "120px 40px" }}>
          <div style={{ display: "flex", gap: 80, alignItems: "center", flexWrap: "wrap" }}>
            {/* テキスト側 */}
            <div style={{ flex: "1 1 340px" }}>
              <Fade>
                <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 24 }}>
                  Feature 02
                </div>
                <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, lineHeight: 1.2, letterSpacing: "-.02em", marginBottom: 40 }}>
                  予約して、<br />あとは任せる。
                </h2>
              </Fade>
              <Fade delay={150}>
                <p style={{ color: "rgba(255,255,255,.5)", lineHeight: 1.9, fontSize: ".95rem", marginBottom: 40 }}>
                  配信日時とプランを選ぶだけ。<br />
                  指定時刻にサーバーが自動起動し、<br />
                  終了時刻には自動停止します。
                </p>
              </Fade>
              <Fade delay={250}>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    "ブラウザだけで予約完結",
                    "SRTサーバー自動起動・自動停止",
                    "接続情報を自動発行",
                    "予約期間外はアクセス制限",
                  ].map((t, i) => (
                    <li key={i} style={{ display: "flex", gap: 16, color: "rgba(255,255,255,.5)", fontSize: ".85rem", letterSpacing: ".05em", alignItems: "flex-start" }}>
                      <span style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }}>—</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </Fade>
            </div>

            {/* 画像側 */}
            <Fade delay={100} style={{ flex: "1 1 400px" }}>
              <div className="feature-img-placeholder" style={{ border: "1px solid #1a1a1a" }}>
                <span style={{ fontSize: "2rem" }}>📅</span>
                <span>reservation-form.png</span>
              </div>
            </Fade>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURE 03 — モニタリング（全幅）
      ══════════════════════════════════ */}
      <section style={{ background: "#000" }}>
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div className="feature-img-placeholder" style={{ aspectRatio: "21/9" }}>
            <span style={{ fontSize: "2rem" }}>📊</span>
            <span>obs-monitor.png</span>
          </div>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(270deg, rgba(0,0,0,.85) 0%, transparent 55%)",
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "60px 80px",
          }}>
            <Fade y={30}>
              <div style={{ textAlign: "right", maxWidth: 480 }}>
                <div style={{ fontSize: ".65rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#dc2626", marginBottom: 20 }}>
                  Feature 03
                </div>
                <h2 style={{ fontSize: "clamp(1.8rem,4vw,3.5rem)", fontWeight: 900, lineHeight: 1.15 }}>
                  サーバーの今を、<br />手元で知る。
                </h2>
                <p style={{ color: "rgba(255,255,255,.45)", fontSize: ".9rem", lineHeight: 1.8, marginTop: 24 }}>
                  CPU・メモリ・GPU・ネットワーク。<br />
                  OBSサーバーの状態をブラウザでリアルタイム確認。
                </p>
              </div>
            </Fade>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════ */}
      <section style={{ background: "#050505", padding: "160px 40px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Fade style={{ textAlign: "center", marginBottom: 100 }}>
            <div style={{ fontSize: ".65rem", letterSpacing: ".3em", textTransform: "uppercase", color: "#555", marginBottom: 20 }}>
              How It Works
            </div>
            <h2 style={{ fontSize: "clamp(1.6rem,3vw,2.5rem)", fontWeight: 900, letterSpacing: "-.02em" }}>
              最短5分で配信準備。
            </h2>
          </Fade>

          {[
            { n: "01", title: "事前登録",     sub: "メールアドレスだけで即時登録。βテスト開始時に優先案内。" },
            { n: "02", title: "日時・プランを予約", sub: "配信時間とプランを選択。料金は自動計算。" },
            { n: "03", title: "SRTアプリで接続", sub: "発行された接続情報をLarix等のアプリに入力するだけ。" },
            { n: "04", title: "配信スタート", sub: "モニター画面でビットレートを確認しながらライブ配信。" },
            { n: "05", title: "自動停止",     sub: "終了時刻にサーバーが自動停止。後作業は一切不要。" },
          ].map((s, i) => (
            <Fade key={i} delay={i * 100}>
              <div style={{
                display: "flex", gap: 40, alignItems: "flex-start",
                padding: "40px 0",
                borderBottom: i < 4 ? "1px solid #111" : "none",
              }}>
                <div style={{
                  fontSize: ".7rem", fontWeight: 900, letterSpacing: ".1em",
                  color: "#dc2626", flexShrink: 0, paddingTop: 4, width: 32,
                }}>
                  {s.n}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 700, letterSpacing: ".03em", marginBottom: 10, color: "#fff" }}>
                    {s.title}
                  </h3>
                  <p style={{ color: "rgba(255,255,255,.4)", fontSize: ".88rem", lineHeight: 1.7, letterSpacing: ".04em" }}>
                    {s.sub}
                  </p>
                </div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          PRICING
      ══════════════════════════════════ */}
      <section style={{ background: "#000", padding: "160px 40px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Fade style={{ textAlign: "center", marginBottom: 100 }}>
            <div style={{ fontSize: ".65rem", letterSpacing: ".3em", textTransform: "uppercase", color: "#555", marginBottom: 20 }}>
              Pricing
            </div>
            <h2 style={{ fontSize: "clamp(1.6rem,3vw,2.5rem)", fontWeight: 900, letterSpacing: "-.02em", marginBottom: 16 }}>
              使った分だけ。
            </h2>
            <p style={{ color: "rgba(255,255,255,.3)", fontSize: ".85rem", letterSpacing: ".08em" }}>
              15分単位のレンタル。初期費用・月額費用なし。
            </p>
          </Fade>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 2 }}>
            {/* SRT サーバー */}
            <Fade delay={0}>
              <div style={{
                padding: "60px 48px",
                background: "#0a0a0a",
                border: "1px solid #1a1a1a",
                transition: "border-color .3s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#333")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")}
              >
                <div style={{ fontSize: ".65rem", letterSpacing: ".2em", textTransform: "uppercase", color: "#555", marginBottom: 32 }}>
                  Plan A
                </div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#60a5fa", marginBottom: 12, letterSpacing: ".05em" }}>
                  SRT Server
                </h3>
                <p style={{ color: "#333", fontSize: ".8rem", lineHeight: 1.7, marginBottom: 48, minHeight: 52 }}>
                  SRT受信サーバーのみ。<br />自前のOBS等から送信する方向け。
                </p>
                <div style={{ marginBottom: 48 }}>
                  <span style={{ fontSize: "clamp(2.5rem,5vw,3.5rem)", fontWeight: 900, letterSpacing: "-.03em" }}>¥165</span>
                  <span style={{ color: "#333", fontSize: ".8rem", marginLeft: 8 }}>/ 15分</span>
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
                  {["SRT受信サーバー", "最大4カメラ（固定）", "ビットレート監視", "自動起動・停止"].map((f, i) => (
                    <li key={i} style={{ fontSize: ".82rem", color: "#444", display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ color: "#60a5fa", fontSize: ".7rem" }}>✓</span> {f}
                    </li>
                  ))}
                  <li style={{ fontSize: ".82rem", color: "#222", display: "flex", gap: 12 }}>
                    <span style={{ fontSize: ".7rem" }}>✕</span> OBS Windows VM なし
                  </li>
                </ul>
                <Link href="/register" style={{
                  display: "block", textAlign: "center", padding: "16px",
                  border: "1px solid #60a5fa22", color: "#60a5fa",
                  fontSize: ".8rem", letterSpacing: ".12em", textTransform: "uppercase",
                  textDecoration: "none", transition: "background .2s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(96,165,250,.08)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  事前登録
                </Link>
              </div>
            </Fade>

            {/* SRT + OBS */}
            <Fade delay={150}>
              <div style={{
                padding: "60px 48px",
                background: "#0d0000",
                border: "1px solid #dc262633",
                position: "relative",
                transition: "border-color .3s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#dc2626")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#dc262633")}
              >
                <div style={{
                  position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                  background: "#dc2626", padding: "4px 20px",
                  fontSize: ".65rem", fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>
                  Recommended
                </div>
                <div style={{ fontSize: ".65rem", letterSpacing: ".2em", textTransform: "uppercase", color: "#555", marginBottom: 32 }}>
                  Plan B
                </div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#ef4444", marginBottom: 12, letterSpacing: ".05em" }}>
                  SRT + OBS
                </h3>
                <p style={{ color: "#333", fontSize: ".8rem", lineHeight: 1.7, marginBottom: 48, minHeight: 52 }}>
                  SRTサーバー + Windows VM<br />（OBSインストール済み）。
                </p>
                <div style={{ marginBottom: 48 }}>
                  <span style={{ fontSize: "clamp(2.5rem,5vw,3.5rem)", fontWeight: 900, letterSpacing: "-.03em" }}>¥495</span>
                  <span style={{ color: "#333", fontSize: ".8rem", marginLeft: 8 }}>/ 15分</span>
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
                  {["SRT受信サーバー", "最大4カメラ（固定）", "OBS Windows VM 付き", "ビットレート監視", "リソースモニター", "自動起動・停止"].map((f, i) => (
                    <li key={i} style={{ fontSize: ".82rem", color: "#555", display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ color: "#ef4444", fontSize: ".7rem" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="btn-primary" style={{ display: "block", textAlign: "center", padding: "16px", textDecoration: "none" }}>
                  事前登録
                </Link>
              </div>
            </Fade>
          </div>

          {/* カメラ追加オプション */}
          <Fade delay={200}>
            <div style={{ marginTop: 2, padding: "32px 48px", background: "#0a0a0a", border: "1px solid #1a1a1a", textAlign: "center" }}>
              <span style={{ color: "#555", fontSize: ".8rem", letterSpacing: ".08em" }}>
                5台目以降のカメラ追加 &nbsp;
              </span>
              <span style={{ color: "#facc15", fontWeight: 700, fontSize: ".9rem" }}>+¥55 / 台 / 15分</span>
              <span style={{ color: "#333", fontSize: ".75rem", marginLeft: 16 }}>最大8台まで / 両プラン共通</span>
            </div>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════
          β CTA — 最終
      ══════════════════════════════════ */}
      <section style={{
        position: "relative", overflow: "hidden",
        background: "#000",
        padding: "180px 40px",
        textAlign: "center",
        borderTop: "1px solid #0f0f0f",
      }}>
        {/* 背景グロー */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: "60vw", height: "60vw", maxWidth: 800, maxHeight: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(220,38,38,.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative" }}>
          <Fade>
            <div style={{ fontSize: ".65rem", letterSpacing: ".3em", textTransform: "uppercase", color: "#555", marginBottom: 32 }}>
              Join the Beta
            </div>
            <h2 style={{
              fontSize: "clamp(2rem,6vw,5rem)",
              fontWeight: 900, letterSpacing: "-.03em",
              lineHeight: 1.1, marginBottom: 24,
            }}>
              レースの感動を、<br />
              <span style={{ color: "#dc2626" }}>世界に届けよう。</span>
            </h2>
            <p style={{
              color: "rgba(255,255,255,.3)", fontSize: ".95rem",
              letterSpacing: ".06em", lineHeight: 1.9, marginBottom: 64,
            }}>
              2026年8月のβテスター募集開始に合わせて、<br />
              優先的にご案内いたします。
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/register" className="btn-primary">
                事前登録する（無料）
              </Link>
              <Link href="/login" className="btn-ghost">
                招待済みの方はログイン
              </Link>
            </div>
          </Fade>
        </div>
      </section>

      {/* ══════════════════════════════════
          Footer
      ══════════════════════════════════ */}
      <footer style={{
        background: "#000", borderTop: "1px solid #111",
        padding: "48px 40px",
        display: "flex", flexWrap: "wrap",
        justifyContent: "space-between", alignItems: "center", gap: 24,
      }}>
        <span style={{ fontWeight: 900, fontSize: ".9rem", letterSpacing: ".1em", color: "#333" }}>
          RACESTREAM<span style={{ color: "#dc2626" }}>PRO</span>
        </span>
        <div style={{ display: "flex", gap: 32 }}>
          {[["LOGIN", "/login"], ["REGISTER", "/register"]].map(([label, href]) => (
            <Link key={href} href={href} style={{
              color: "#333", fontSize: ".75rem", letterSpacing: ".15em",
              textDecoration: "none", textTransform: "uppercase", transition: "color .2s",
            }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#333")}
            >
              {label}
            </Link>
          ))}
        </div>
        <span style={{ color: "#222", fontSize: ".72rem", letterSpacing: ".08em" }}>
          © 2026 RaceStreamPro
        </span>
      </footer>

    </>
  );
}
