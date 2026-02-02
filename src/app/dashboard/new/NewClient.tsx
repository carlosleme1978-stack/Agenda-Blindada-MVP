"use client";

import React, { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewClient() {
  const r = useRouter();

  const [phone, setPhone] = useState("+351");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const card = useMemo(
    () => ({
      background: "rgba(255,255,255,0.82)",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: 20,
      boxShadow:
        "0 26px 48px rgba(15, 23, 42, 0.08), 0 8px 18px rgba(15, 23, 42, 0.05)",
      padding: 18,
      maxWidth: 680,
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const sb = supabaseBrowser();

      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return setMsg("Faz login.");

      const res = await fetch("/api/appointments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerPhone: phone,
          customerName: name,
          startISO: start,
          durationMinutes: minutes,
        }),
      });

      const t = await res.text();
      if (!res.ok) return setMsg(t);

      r.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 800px at 20% 20%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(900px 700px at 80% 30%, rgba(236,72,153,0.14), transparent 55%), radial-gradient(900px 700px at 55% 85%, rgba(16,185,129,0.12), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 60%, #ecfeff 100%)",
        padding: 24,
      }}
    >
      <main style={{ maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:14 }}>
        <div>
          <Link href="/dashboard" style={{ textDecoration:"none", fontWeight:800, color:"#0f172a" }}>← Voltar</Link>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Link href="/dashboard/billing" style={{ textDecoration:"none", padding:"10px 12px", borderRadius:12, border:"1px solid rgba(2,6,23,0.10)", background:"rgba(255,255,255,0.85)", color:"#0f172a", fontWeight:700, fontSize:13 }}>Faturação</Link>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>
          Nova marcação
        </h1>
        <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>
          Crie a marcação e inicie o fluxo de confirmação via WhatsApp.
        </p>
      </div>

      <div style={card}>
        <form onSubmit={save}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Telefone</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+351912345678"
            style={{ ...inputStyle, marginTop: 6 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Formato: +351… (o sistema normaliza para WhatsApp automaticamente)
          </div>

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>
            Nome (opcional)
          </label>
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Carlos"
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>Início</label>
          <input
            type="datetime-local"
            style={{ ...inputStyle, marginTop: 6 }}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>Duração (min)</label>
          <input
            type="number"
            style={{ ...inputStyle, marginTop: 6 }}
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value || "30", 10))}
            min={5}
          />

          <div style={{ height: 16 }} />

          <button
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(2, 6, 23, 0.10)",
              cursor: "pointer",
              fontWeight: 800,
              letterSpacing: -0.2,
              color: "white",
              background:
                "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
              boxShadow: "0 14px 26px rgba(59,130,246,0.25)",
              opacity: loading ? 0.85 : 1,
            }}
            disabled={loading}
          >
            {loading ? "A guardar..." : "Guardar e voltar"}
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
    </div>
  );
}
