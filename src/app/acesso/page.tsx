"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcessoPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const res = await fetch("/api/access/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || !json?.ok) {
      setErr(json?.error || "Código inválido.");
      return;
    }

    // guarda para usar no signup
    localStorage.setItem("access_code", code.trim());
    router.push("/signup");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>Acesso ao Cadastro</h1>
      <p>Digite o seu código de acesso para criar a conta.</p>

      <form onSubmit={onSubmit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ex: AB-2026-0001"
          style={{ width: "100%", padding: 12, marginTop: 12 }}
        />
        <button disabled={loading} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          {loading ? "Validando..." : "Continuar"}
        </button>
      </form>

      {err && <p style={{ marginTop: 12 }}>{err}</p>}
    </div>
  );
}
