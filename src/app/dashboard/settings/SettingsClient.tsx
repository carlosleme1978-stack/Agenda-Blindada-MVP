"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";
import { useABTheme } from "@/app/ThemeProvider";


const days = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 7, label: "Dom" },
];

export default function SettingsClient() {
  const sb = supabaseBrowser;
  const { theme, setTheme } = useABTheme();
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [slotStep, setSlotStep] = useState<number>(30);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const card: React.CSSProperties = {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 20,
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(10px)",
    padding: 18,
    maxWidth: 980,
    margin: "0 auto",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--text)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--btn-border)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    color: "white",
    background: "var(--primary-gradient)",
    boxShadow: "0 14px 26px rgba(0,0,0,0.24)",
    opacity: saving ? 0.85 : 1,
  };

  async function load() {
    setLoading(true);
    setMsg(null);
    setOkMsg(null);
    try {
      const res = await ensureAccess(sb, {
        requireActiveSubscription: true,
        requireOnboardingComplete: false,
      });
      if (!res.ok || !res.company) return;

      setCompany(res.company);

      setWorkStart(((res.company as any).work_start ?? "09:00") as string);
      setWorkEnd(((res.company as any).work_end ?? "18:00") as string);
      setSlotStep(((res.company as any).slot_step_minutes ?? 30) as number);
      setWorkDays(((res.company as any).work_days ?? [1, 2, 3, 4, 5]) as number[]);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar horários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDay(v: number) {
    setWorkDays((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b)));
  }

  async function save() {
    setMsg(null);
    setOkMsg(null);
    if (!company?.id) return;

    if (!workStart || !workEnd) return setMsg("Informe horário de início e fim.");
    if (workStart >= workEnd) return setMsg("Horário inicial precisa ser menor que o final.");
    if (!slotStep || slotStep < 5) return setMsg("Intervalo inválido.");
    if (!workDays || workDays.length === 0) return setMsg("Escolha ao menos 1 dia de atendimento.");

    setSaving(true);
    try {
      const { error } = await sb
        .from("companies")
        .update({
          work_start: workStart,
          work_end: workEnd,
          slot_step_minutes: slotStep,
          work_days: workDays,
          timezone: "Europe/Lisbon",
        } as any)
        .eq("id", company.id);

      if (error) throw error;

      setOkMsg("✅ Configurações salvas!");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Horários</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Define os dias e horários que o WhatsApp vai oferecer.</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" style={{ ...btn, textDecoration: "none" }}>Voltar</Link>
          <Link href="/dashboard/services" style={{ ...btn, textDecoration: "none" }}>Serviços</Link>
        </div>
      </div>

      <div style={card}>
        {msg && (
          <div
            style={{
              marginBottom: 12,
              color: "rgba(255,255,255,0.92)",
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        )}

        {okMsg && (
          <div
            style={{
              marginBottom: 12,
              color: "rgba(255,255,255,0.92)",
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.25)",
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {okMsg}
          </div>
        )}

        {loading ? (
          <div style={{ opacity: 0.7 }}>Carregando…</div>
        ) : (
          <>
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>Tema</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Escolha entre Luxury (preto + dourado leve) e Tech (glassmorphism).</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setTheme("luxury")} style={{ ...btn, background: theme === "luxury" ? "rgba(212,175,55,0.18)" : "var(--btn-bg)" }}>
                  Luxury
                </button>
                <button type="button" onClick={() => setTheme("tech")} style={{ ...btn, background: theme === "tech" ? "rgba(59,130,246,0.16)" : "var(--btn-bg)" }}>
                  Tech SaaS
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Início</div>
                <input style={{ ...input, marginTop: 6 }} value={workStart} onChange={(e) => setWorkStart(e.target.value)} placeholder="09:00" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Fim</div>
                <input style={{ ...input, marginTop: 6 }} value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} placeholder="18:00" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Intervalo (min)</div>
                <input
                  style={{ ...input, marginTop: 6 }}
                  type="number"
                  min={5}
                  step={5}
                  value={slotStep}
                  onChange={(e) => setSlotStep(parseInt(e.target.value || "30", 10))}
                />
              </div>
            </div>

            <div style={{ height: 14 }} />

            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Dias de atendimento</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {days.map((d) => {
                const on = workDays.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDay(d.v)}
                    style={{
                      ...btn,
                      background: on ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.85)",
                      borderColor: on ? "rgba(59,130,246,0.35)" : "rgba(2,6,23,0.10)",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <div style={{ height: 16 }} />

            <button disabled={saving} style={primaryBtn} onClick={save} type="button">
              {saving ? "A guardar…" : "Salvar configurações"}
            </button>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Dica: 30 min funciona para quase todos os negócios. Se quiser mais precisão, use 15 min.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
