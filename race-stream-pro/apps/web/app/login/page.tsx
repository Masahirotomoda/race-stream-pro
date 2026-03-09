"use client";
import { createClient } from "@/app/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/reservations";
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (authError) {
      setError("メールアドレスまたはパスワードが違います");
    } else {
      router.push(next);
      router.refresh();
    }
  };

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%",
    padding: "11px 14px",
    background: "#0f0f0f",
    border: `1px solid ${focusedField === name ? "#e63946" : "#2a2a2a"}`,
    borderRadius: 6,
    fontSize: 14,
    color: "hsl(var(--foreground))",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--background))", color: "hsl(var(--foreground))", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ position: "absolute", top: `${10 + i * 20}%`, left: "-10%", width: "120%", height: 1,
            background: "linear-gradient(90deg, transparent, #e6394608, transparent)", transform: `rotate(${-8 + i * 2}deg)` }} />
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 380, background: "#111", border: "1px solid #222",
        borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", position: "relative" }}>
        <div style={{ height: 3, background: "linear-gradient(90deg, #e63946, #ff6b6b, #e63946)" }} />

        <div style={{ padding: "36px 36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }}>🏁</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "0.12em", color: "hsl(var(--foreground))" }}>RACE STREAM PRO</div>
          <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 6, letterSpacing: "0.05em" }}>LIVE COMMENTARY RESERVATION</div>
        </div>

        <div style={{ padding: "0 36px 36px" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 700,
                color: "#aaa", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Email
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                required autoComplete="email" placeholder="admin@example.com"
                style={inputStyle("email")} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 700,
                color: "#aaa", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Password
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
                required autoComplete="current-password"
                style={inputStyle("password")} />
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#ef4444" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              marginTop: 4, padding: "12px",
              background: loading ? "#7f1d1d" : "linear-gradient(135deg, #e63946, #c1121f)",
              color: "hsl(var(--foreground))", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700,
              letterSpacing: "0.06em", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1, transition: "opacity 0.2s" }}>
              {loading ? "SIGNING IN..." : "SIGN IN →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
