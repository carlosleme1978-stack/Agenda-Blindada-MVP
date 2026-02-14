"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const r = useRouter();

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: 400,
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
    fontWeight: 800,
    letterSpacing: -0.2,
    color: "white",
    background:
      "linear-gradient(135deg, rgba(15, 23, 42, 1), rgba(59,130,246,1))",
    boxShadow: "0 16px 30px rgba(59,130,246,0.22)",
  } as const;

  async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setMsg(null);
  setLoading(true);

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(json?.error || "Falha no login");
      return;
    }

    r.push("/dashboard");
    r.refresh(); // garante que cookies SSR sejam lidos
  } finally {
    setLoading(false);
  }
}


  return (
    <main
      className="wrap"
      style={{
        minHeight: "calc(100vh - 40px)",
        display: "grid",
        placeItems: "center",
        padding: "20px 0",
      }}
    >
      <div className="container" style={{ width: "100%", maxWidth: 980, padding: "0 18px" }}>
        <div className="layoutGrid">
          {/* Left: Brand / value */}
          <div className="brandPanel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, rgba(16,185,129,1), rgba(59,130,246,1))",
                  boxShadow: "0 10px 18px rgba(59,130,246,0.28)",
                }}
              />
              <strong style={{ letterSpacing: -0.2 }}>
                {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}
              </strong>
            </div>

            <h1
              style={{
                margin: "18px 0 10px",
                fontSize: 34,
                lineHeight: 1.05,
                letterSpacing: -1.0,
              }}
            >
              Acesso ao painel
            </h1>

            <p style={{ margin: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.6 }}>
              Gerencie sua agenda e confirmações via WhatsApp com um fluxo simples e
              seguro. Sem conflitos de horário e com rastreabilidade no sistema.
            </p>

            <div style={{ height: 14 }} />

            <div className="pillGrid">
              {[
                { t: "Confirmação", s: "SIM / NÃO" },
                { t: "Agenda", s: "Sem sobreposição" },
                { t: "Controle", s: "Logs & status" },
              ].map((b) => (
                <div key={b.t} className="pill">
                  <div style={{ fontWeight: 900, letterSpacing: -0.2 }}>{b.t}</div>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>{b.s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Login form */}
          <div className="loginCard" style={cardStyle}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                Entrar
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4 }}>
                Faça login para continuar
              </div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
                Use as credenciais fornecidas para acessar o painel.
              </div>
            </div>

           <form onSubmit={onSubmit}>
  {/* EMAIL */}
  <label style={{ fontSize: 13, fontWeight: 800 }}>Email</label>
  <input
    style={{ ...inputStyle, marginTop: 6 }}
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    placeholder="seu@email.com"
    autoComplete="email"
  />

  <div style={{ height: 16 }} />

  {/* PASSWORD */}
  <label style={{ fontSize: 13, fontWeight: 800 }}>Password</label>
  <input
    type="password"
    style={{ ...inputStyle, marginTop: 6 }}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    placeholder="••••••••"
    autoComplete="current-password"
  />

  {/* LINK ESQUECI SENHA */}
  <div
    style={{
      marginTop: 6,
      display: "flex",
      justifyContent: "flex-end",
    }}
  >
    <Link
      href="/forgot-password"
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "#2563eb",
        textDecoration: "none",
      }}
    >
      Esqueci a senha
    </Link>
  </div>

  <div style={{ height: 18 }} />

  {/* BOTÃO */}
  <button
    style={{
      ...buttonStyle,
      opacity: loading ? 0.85 : 1,
    }}
    disabled={loading}
  >
    {loading ? "A entrar..." : "Entrar"}
  </button>

  {/* MENSAGEM DE ERRO */}
  {msg && (
    <p
      className="msg"
      style={{
        marginTop: 14,
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
            
            <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>
              Ainda não tem conta? <a href="/signup" style={{ fontWeight: 900 }}>Criar conta</a>
            </div>

<div style={{ marginTop: 14, fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>
              Ao acessar, você concorda com as políticas internas de uso do sistema.
            </div>
          </div>
        </div>

        <div className="footerNote">
          © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}.
        </div>
      </div>

      <style jsx>{`
        .wrap {
          width: 100%;
          overflow-x: hidden;
        }

        .container {
          overflow-x: hidden;
        }

        /* ✅ aqui estava o “problema”: 2 colunas fixas sem media query */
        .layoutGrid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 18px;
          align-items: stretch;
        }

        .brandPanel {
          border-radius: 22px;
          padding: 28px;
          border: 1px solid rgba(2, 6, 23, 0.06);
          background: linear-gradient(
            135deg,
            rgba(15, 23, 42, 0.92),
            rgba(2, 132, 199, 0.88)
          );
          color: rgba(255, 255, 255, 0.95);
          box-shadow: 0 40px 80px rgba(2, 6, 23, 0.12),
            0 12px 26px rgba(2, 6, 23, 0.1);
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .pillGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .pill {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          padding: 12px;
          min-width: 0;
        }

        .loginCard {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .msg {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .footerNote {
          margin-top: 14px;
          text-align: center;
          font-size: 12px;
          opacity: 0.65;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* ✅ Responsivo WhatsApp / mobile */
        @media (max-width: 900px) {
          .layoutGrid {
            grid-template-columns: 1fr;
          }
          .pillGrid {
            grid-template-columns: 1fr;
          }
        }

        /* Melhor ainda em telas bem pequenas */
        @media (max-width: 420px) {
          .brandPanel {
            padding: 20px;
          }
        }
      `}</style>
    </main>
  );
}
