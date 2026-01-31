"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const r = useRouter();

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: 440,
      background: "rgba(255,255,255,0.78)",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: 18,
      boxShadow:
        "0 30px 60px rgba(15, 23, 42, 0.10), 0 8px 18px rgba(15, 23, 42, 0.06)",
      padding: 22,
    }),
    []
  );

  const inputStyle = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.12)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.9)",
  } as const;

  const buttonStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    cursor: "pointer",
    fontWeight: 700,
    letterSpacing: -0.2,
    color: "white",
    background:
      "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
    boxShadow: "0 14px 26px rgba(59,130,246,0.25)",
  } as const;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return setMsg(error.message);
      r.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "calc(100vh - 40px)",
        display: "grid",
        placeItems: "center",
        padding: "18px 0",
      }}
    >
      <div style={cardStyle}>
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(15, 23, 42, 0.04)",
              border: "1px solid rgba(2,6,23,0.06)",
              fontSize: 12,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background:
                  "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
                boxShadow: "0 8px 18px rgba(59,130,246,0.35)",
              }}
            />
            <strong style={{ letterSpacing: -0.2 }}>
              {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}
            </strong>
          </div>

          <h1 style={{ margin: "14px 0 6px", fontSize: 26, letterSpacing: -0.6 }}>
            Entrar no painel
          </h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>
            Acesse sua agenda e confirme marcações via WhatsApp.
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
          <input
            type="password"
            style={{ ...inputStyle, marginTop: 6 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <div style={{ height: 14 }} />

          <button style={buttonStyle} disabled={loading}>
            {loading ? "A entrar..." : "Entrar"}
          </button>

          {msg && (
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                color: "#b91c1c",
                background: "rgba(185, 28, 28, 0.07)",
                border: "1px solid rgba(185, 28, 28, 0.18)",
                padding: "10px 12px",
                borderRadius: 12,
                fontSize: 13,
              }}
            >
              {msg}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
