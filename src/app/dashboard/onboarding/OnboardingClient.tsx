"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
  active: boolean;
};

const days = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 7, label: "Dom" },
];

export default function OnboardingClient() {
  const sb = useMemo(() => supabaseBrowser, []);
  const r = useRouter();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [companyName, setCompanyName] = useState<string>("");
  const [duration, setDuration] = useState<number>(30);

  // Step 2 (services)
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcMin, setNewSvcMin] = useState<number>(30);
  const [newSvcPrice, setNewSvcPrice] = useState<string>("");

  // Step 3 (hours)
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [slotStep, setSlotStep] = useState<number>(30);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await ensureAccess(sb, {
        requireActiveSubscription: true,
        requireOnboardingComplete: false,
      });
      if (!res.ok || !res.company) return;

      setCompany(res.company);
      setCompanyName(res.company.name ?? "");
      setDuration((res.company.default_duration_minutes ?? 30) as number);

      // carregar configs de horários (se existirem)
      setWorkStart((res.company as any).work_start ?? "09:00");
      setWorkEnd((res.company as any).work_end ?? "18:00");
      setSlotStep((res.company as any).slot_step_minutes ?? 30);
      setWorkDays((res.company as any).work_days ?? [1, 2, 3, 4, 5]);

      // carregar serviços
      const s = await sb
        .from("services")
        .select("id,name,duration_minutes,price_cents,active")
        .eq("company_id", res.company.id)
        .order("created_at", { ascending: true });

      if (s.error) throw s.error;
      setServices((s.data ?? []) as any);

      if (res.company.onboarding_complete) r.replace("/dashboard");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar onboarding.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function uiError(t: string) {
    setMsg(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveStep1() {
    setMsg(null);
    if (!company?.id) return;
    if (!companyName.trim()) return uiError("Informe o nome do negócio.");
    if (!Number.isFinite(duration) || duration < 5) return uiError("Duração inválida.");

    setSaving(true);
    try {
      const { error } = await sb
        .from("companies")
        .update({
          name: companyName.trim(),
          default_duration_minutes: duration,
        } as any)
        .eq("id", company.id);

      if (error) throw error;
      setStep(2);
    } catch (e: any) {
      uiError(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function addService() {
    setMsg(null);
    if (!company?.id) return;
    const name = newSvcName.trim();
    if (!name) return uiError("Informe o nome do serviço.");
    if (!newSvcMin || newSvcMin < 5) return uiError("Duração do serviço inválida.");

    const priceCents =
      newSvcPrice.trim() === "" ? null : Math.max(0, Math.round(Number(newSvcPrice.replace(",", ".")) * 100));

    setSaving(true);
    try {
      const ins = await sb
        .from("services")
        .insert({
          company_id: company.id,
          name,
          duration_minutes: newSvcMin,
          price_cents: Number.isFinite(priceCents as any) ? priceCents : null,
          active: true,
        })
        .select("id,name,duration_minutes,price_cents,active")
        .single();

      if (ins.error) throw ins.error;

      setServices((prev) => [...prev, ins.data as any]);
      setNewSvcName("");
      setNewSvcMin(duration || 30);
      setNewSvcPrice("");
    } catch (e: any) {
      uiError(e?.message ?? "Erro ao adicionar serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function removeService(id: string) {
    setMsg(null);
    setSaving(true);
    try {
      // não apaga: só desativa
      const { error } = await sb.from("services").update({ active: false }).eq("id", id);
      if (error) throw error;
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, active: false } : s)));
    } catch (e: any) {
      uiError(e?.message ?? "Erro ao remover serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function saveFinish() {
    setMsg(null);
    if (!company?.id) return;

    const activeCount = services.filter((s) => s.active).length;
    if (activeCount === 0) return uiError("Crie pelo menos 1 serviço ativo.");

    if (!workStart || !workEnd) return uiError("Informe horário de início e fim.");
    if (workStart >= workEnd) return uiError("Horário inicial precisa ser menor que o final.");
    if (!slotStep || slotStep < 5) return uiError("Intervalo de agenda inválido.");
    if (!workDays || workDays.length === 0) return uiError("Escolha ao menos 1 dia de atendimento.");

    setSaving(true);
    try {
      const { error } = await sb
        .from("companies")
        .update({
          work_start: workStart,
          work_end: workEnd,
          slot_step_minutes: slotStep,
          work_days: workDays,
          onboarding_complete: true,
        } as any)
        .eq("id", company.id);

      if (error) throw error;

      r.push("/dashboard");
    } catch (e: any) {
      uiError(e?.message ?? "Erro ao finalizar onboarding.");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(v: number) {
    setWorkDays((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b)));
  }

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 800px at 20% 20%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(900px 700px at 80% 30%, rgba(236,72,153,0.14), transparent 55%), radial-gradient(900px 700px at 55% 85%, rgba(16,185,129,0.12), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 60%, #ecfeff 100%)",
    padding: 24,
  };

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.86)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 20,
    boxShadow: "0 30px 60px rgba(15, 23, 42, 0.08), 0 8px 18px rgba(15, 23, 42, 0.05)",
    padding: 18,
    maxWidth: 820,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.12)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.95)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    background: "rgba(255,255,255,0.85)",
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    color: "white",
    background: "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
    boxShadow: "0 14px 26px rgba(59,130,246,0.25)",
    opacity: saving ? 0.85 : 1,
  };

  return (
    <div style={wrap}>
      <main style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>Configuração inicial</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>Deixe sua Agenda Blindada pronta em poucos minutos.</p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link
              href="/dashboard/billing"
              style={{
                textDecoration: "none",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(2,6,23,0.10)",
                background: "rgba(255,255,255,0.85)",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Faturação
            </Link>
          </div>
        </div>

        <div style={card}>
          {msg && (
            <p
              style={{
                marginTop: 0,
                marginBottom: 12,
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

          {loading ? (
            <div style={{ padding: 10, opacity: 0.7 }}>Carregando…</div>
          ) : (
            <>
              {/* Stepper */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button style={{ ...btn, opacity: step === 1 ? 1 : 0.65 }} onClick={() => setStep(1)} type="button">
                  1) Negócio
                </button>
                <button style={{ ...btn, opacity: step === 2 ? 1 : 0.65 }} onClick={() => setStep(2)} type="button">
                  2) Serviços
                </button>
                <button style={{ ...btn, opacity: step === 3 ? 1 : 0.65 }} onClick={() => setStep(3)} type="button">
                  3) Horários
                </button>
              </div>

              {/* STEP 1 */}
              {step === 1 && (
                <div>
                  <div style={{ fontWeight: 950, letterSpacing: -0.3, fontSize: 18, marginBottom: 8 }}>O mínimo para funcionar</div>

                  <label style={{ fontSize: 13, fontWeight: 800 }}>Nome do negócio</label>
                  <input
                    style={{ ...input, marginTop: 6 }}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Barbearia Central"
                  />

                  <div style={{ height: 12 }} />

                  <label style={{ fontSize: 13, fontWeight: 800 }}>Tempo padrão por atendimento (min)</label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    style={{ ...input, marginTop: 6 }}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value || "30", 10))}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Recomendado: 30, 45 ou 60 minutos.</div>

                  <div style={{ height: 16 }} />

                  <button disabled={saving} style={primaryBtn} onClick={saveStep1} type="button">
                    {saving ? "A guardar…" : "Continuar"}
                  </button>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div>
                  <div style={{ fontWeight: 950, letterSpacing: -0.3, fontSize: 18, marginBottom: 8 }}>Serviços</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
                    Crie pelo menos 1 serviço. É isso que o WhatsApp vai listar.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                    <input
                      style={input}
                      value={newSvcName}
                      onChange={(e) => setNewSvcName(e.target.value)}
                      placeholder="Ex: Corte, Unhas, Barba…"
                    />
                    <input
                      style={input}
                      type="number"
                      min={5}
                      step={5}
                      value={newSvcMin}
                      onChange={(e) => setNewSvcMin(parseInt(e.target.value || "30", 10))}
                      placeholder="min"
                    />
                    <input
                      style={input}
                      value={newSvcPrice}
                      onChange={(e) => setNewSvcPrice(e.target.value)}
                      placeholder="Preço (€) opcional"
                    />
                  </div>

                  <div style={{ height: 10 }} />

                  <button disabled={saving} style={btn} onClick={addService} type="button">
                    {saving ? "A adicionar…" : "+ Adicionar serviço"}
                  </button>

                  <div style={{ height: 14 }} />

                  <div style={{ display: "grid", gap: 8 }}>
                    {services.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>Nenhum serviço ainda.</div>
                    ) : (
                      services.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(2,6,23,0.10)",
                            background: "rgba(255,255,255,0.85)",
                            opacity: s.active ? 1 : 0.55,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 900 }}>{s.name}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              {s.duration_minutes} min {s.price_cents != null ? `· €${(s.price_cents / 100).toFixed(2)}` : ""}
                            </div>
                          </div>

                          {s.active ? (
                            <button style={btn} disabled={saving} onClick={() => removeService(s.id)} type="button">
                              Desativar
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, opacity: 0.7 }}>inativo</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ height: 16 }} />

                  <button style={primaryBtn} onClick={() => setStep(3)} type="button">
                    Continuar
                  </button>
                </div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <div>
                  <div style={{ fontWeight: 950, letterSpacing: -0.3, fontSize: 18, marginBottom: 8 }}>Horário de atendimento</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 800 }}>Início</label>
                      <input style={{ ...input, marginTop: 6 }} value={workStart} onChange={(e) => setWorkStart(e.target.value)} placeholder="09:00" />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 800 }}>Fim</label>
                      <input style={{ ...input, marginTop: 6 }} value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} placeholder="18:00" />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 800 }}>Intervalo (min)</label>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        style={{ ...input, marginTop: 6 }}
                        value={slotStep}
                        onChange={(e) => setSlotStep(parseInt(e.target.value || "30", 10))}
                      />
                    </div>
                  </div>

                  <div style={{ height: 12 }} />

                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Dias de atendimento</div>
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

                  <button disabled={saving} style={primaryBtn} onClick={saveFinish} type="button">
                    {saving ? "A guardar…" : "Finalizar e ir ao painel"}
                  </button>

                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                    Depois você pode ajustar tudo no painel (em versões futuras).
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
