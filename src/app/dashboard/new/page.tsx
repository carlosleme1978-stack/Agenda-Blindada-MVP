"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function New() {
  const [sb, setSb] = useState<ReturnType<typeof supabaseBrowser> | null>(null);
  const r = useRouter();

  const [phone, setPhone] = useState("+351");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);

  // cria o client só no browser (evita crash no prerender)
  useEffect(() => {
    setSb(supabaseBrowser());
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!sb) return setMsg("A iniciar… tenta novamente.");

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
  }

  return (
    <main style={{ maxWidth: 520 }}>
      <h2>Nova marcação</h2>

      <form onSubmit={save}>
        <label>Telefone</label>
        <input
          type="tel"
          inputMode="tel"
          placeholder="+351912345678"
          style={{ width: "100%", padding: 8 }}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
          Formato: +351…
        </div>

        <div style={{ height: 8 }} />

        <label>Nome (opcional)</label>
        <input
          style={{ width: "100%", padding: 8 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div style={{ height: 8 }} />

        <label>Início</label>
        <input
          type="datetime-local"
          style={{ width: "100%", padding: 8 }}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />

        <div style={{ height: 8 }} />

        <label>Duração (min)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 8 }}
          value={minutes}
          onChange={(e) => setMinutes(parseInt(e.target.value || "30", 10))}
        />

        <div style={{ height: 12 }} />

        <button style={{ padding: "8px 12px" }}>
          Guardar e enviar confirmação
        </button>
      </form>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}
    </main>
  );
}
