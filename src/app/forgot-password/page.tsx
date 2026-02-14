"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: 420,
      background: "rgba(255,255,255,0.82)",
      border: "1px solid rgba(2,6,23,0.08)",
      borderRadius: 20,
      boxShadow:
        "0 40px 80px rgba(2,6,23,0.12), 0 10px 24px rgba(2,6,23,0.08)",
      padding: 24,
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
    background: "rgba(255,255,255,0.95)",
  } as const;

  const buttonStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    color: "white",
    background:
      "linear-gradient(135deg, rgba(15, 23, 42, 1), rgba(59,130,246,1))",
    boxShadow: "0 16px 30px rgba(59,130,246,0.22)",
  } as const;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
      const appUrl = raw.replace(/\/$/, "");
      if (!appUrl) {
        setMsg("Configuração ausente: NEXT_PUBLIC_APP_URL não está definida.");
        return;
      }

      const redirectTo = `${appUrl}/reset-password`;

      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );

      if (error) {
        setMsg(error.message || "Não consegui enviar o email. Tente novamente.");
        return;
      }

      setMsg("✅ Link enviado. Abra o email e redefina sua senha.");
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
        padding: "20px 0",
      }}
    >
      <div style={{ width: "100%", maxWidth: 980, padding: "0 18px" }}>
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
              Recuperação
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4 }}>
              Esqueci a senha
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
              Informe seu email e enviaremos um link para criar uma nova senha.
            </div>
          </div>

          <form onSubmit={handleSend}>
            <label style={{ fontSize: 13, fontWeight: 800 }}>Email</label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="seu@email.com"
              autoComplete="email"
            />

            <div style={{ height: 14 }} />

            <button
              style={{ ...buttonStyle, opacity: loading ? 0.85 : 1 }}
              disabled={loading}
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
              <Link href="/login" style={{ fontWeight: 900, textDecoration: "none" }}>
                Voltar ao login
              </Link>
            </div>

            {msg && (
              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  color: msg.startsWith("✅") ? "#166534" : "#b91c1c",
                  background: msg.startsWith("✅")
                    ? "rgba(22, 101, 52, 0.08)"
                    : "rgba(185, 28, 28, 0.07)",
                  border: msg.startsWith("✅")
                    ? "1px solid rgba(22, 101, 52, 0.18)"
                    : "1px solid rgba(185, 28, 28, 0.18)",
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

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, opacity: 0.65 }}>
          © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}.
        </div>
      </div>
    </main>
  );
}
