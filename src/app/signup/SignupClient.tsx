"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupClient() {
  const r = useRouter();
  const sp = useSearchParams();

  const sessionId = useMemo(() => {
    return (sp.get("session_id") || "").trim();
  }, [sp]);

  const [accessCode, setAccessCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionId) {
      setAccessCode("");
      return;
    }

    const code = localStorage.getItem("access_code") || "";
    if (!code.trim()) {
      r.replace("/planos");
      return;
    }
    setAccessCode(code.trim());
  }, [r, sessionId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const code = accessCode.trim();
    if (!sessionId && !code) {
      setMsg("Sem pagamento (session_id) e sem código de acesso. Volte para /planos.");
      r.push("/planos");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          accessCode: code,
          companyName,
          ownerName,
          email,
          password,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error || "Falha ao criar conta");
        return;
      }

      localStorage.removeItem("access_code");

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const j2 = await login.json().catch(() => ({}));
      if (!login.ok) {
        setMsg(j2?.error || "Conta criada, mas falha no login. Vá para Login.");
        return;
      }

      r.push("/dashboard");
      r.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "calc(100vh - 72px)", display: "grid", placeItems: "center", padding: "18px" }}>
      <div className="ab-card" style={{ width: "100%", maxWidth: 520 }}>
        <div className="ab-card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ letterSpacing: -0.2 }}>Criar conta</strong>
          <Link href="/login" style={{ fontSize: 13, opacity: 0.8, color: "var(--text)" }}>
            Já tenho conta
          </Link>
        </div>

        <h1 style={{ margin: "12px 0 6px", fontSize: 26, letterSpacing: -0.6 }}>Ativar o painel</h1>

        <p style={{ margin: 0, opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
          {sessionId ? (
            <>Pagamento detectado. Agora finalize sua conta.</>
          ) : (
            <>
              Cadastro protegido por código. Seu código atual: <b>{accessCode || "—"}</b>
            </>
          )}
        </p>

        <div style={{ height: 14 }} />

        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 13, fontWeight: 800 }}>Nome da empresa</label>
          <input
            className="ab-input"
            style={{ marginTop: 6 }}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 800 }}>Seu nome (opcional)</label>
          <input
            className="ab-input"
            style={{ marginTop: 6 }}
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 800 }}>Email</label>
          <input
            className="ab-input"
            style={{ marginTop: 6 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 800 }}>Password</label>
          <input
            type="password"
            className="ab-input"
            style={{ marginTop: 6 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <div style={{ height: 16 }} />

          <button
            disabled={loading}
            className="ab-btn ab-btn-primary"
            style={{ width: "100%", padding: "12px 14px", opacity: loading ? 0.85 : 1 }}
          >
            {loading ? "A criar..." : "Criar conta"}
          </button>

          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <Link href="/acesso" style={{ fontSize: 13, opacity: 0.8 }}>
              Trocar código
            </Link>
          </div>

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
      </div>
    </main>
  );
}