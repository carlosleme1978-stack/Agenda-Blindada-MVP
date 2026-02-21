"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function parseHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash || "";
  return new URLSearchParams(hash);
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
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

  // ✅ Suporta link com ?code= (PKCE) e também links antigos com #access_token=
  useEffect(() => {
    (async () => {
      setMsg(null);

      // 1) Se vier com ?code=
      const code = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("code")
        : null;

      try {
        if (code) {
          const { error } = await supabaseBrowser().auth.exchangeCodeForSession(code);
          if (error) {
            setMsg("O link é inválido ou expirou. Peça um novo link.");
            setReady(false);
            return;
          }
        } else {
          // 2) Fallback para #access_token=
          const hp = parseHashParams();

          const errorCode = hp.get("error_code");
          const error = hp.get("error");
          const errorDesc = hp.get("error_description");

          if (error || errorCode) {
            setMsg(
              decodeURIComponent(errorDesc || "") ||
                (errorCode === "otp_expired"
                  ? "O link expirou. Peça um novo link."
                  : "Não foi possível validar o link. Peça um novo.")
            );
            setReady(false);
            return;
          }

          const access_token = hp.get("access_token");
          const refresh_token = hp.get("refresh_token");

          if (access_token && refresh_token) {
            const { error: setErr } = await supabaseBrowser().auth.setSession({
              access_token,
              refresh_token,
            });
            if (setErr) {
              setMsg("O link é inválido ou expirou. Peça um novo link.");
              setReady(false);
              return;
            }
          }
        }

        const { data } = await supabaseBrowser().auth.getSession();
        const ok = !!data.session;
        setReady(ok);
        if (!ok) {
          setMsg("Abra esta página usando o link recebido no email (o link pode expirar).");
        }
      } catch {
        setReady(false);
        setMsg("Não foi possível validar o link. Peça um novo link.");
      }
    })();
  }, []);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setMsg("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) {
        setMsg("Não consegui atualizar a senha. Peça um novo link e tente novamente.");
        return;
      }
      setMsg("✅ Senha atualizada! Agora você pode entrar com a nova senha.");
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
              Redefinir senha
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
              Crie uma nova senha para sua conta.
            </div>
          </div>

          <form onSubmit={handleUpdate}>
            <label style={{ fontSize: 13, fontWeight: 800 }}>Nova senha</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              style={{ ...inputStyle, marginTop: 6 }}
              disabled={!ready}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            <div style={{ height: 14 }} />

            <label style={{ fontSize: 13, fontWeight: 800 }}>Confirmar senha</label>
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              type="password"
              required
              style={{ ...inputStyle, marginTop: 6 }}
              disabled={!ready}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            <div style={{ height: 16 }} />

            <button
              disabled={!ready || loading}
              style={{ ...buttonStyle, opacity: !ready || loading ? 0.85 : 1 }}
            >
              {loading ? "Salvando..." : "Salvar nova senha"}
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
