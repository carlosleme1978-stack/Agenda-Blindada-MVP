"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";

/**
 * V1 Onboarding (Professional & Minimal):
 * - Company name
 * - Default service duration (minutes)
 * - Marks onboarding_complete = true
 *
 * We keep it simple to minimize owner's work.
 */
export default function OnboardingClient() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const r = useRouter();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState<string>("");
  const [duration, setDuration] = useState<number>(30);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      // Needs an active subscription, but onboarding itself can be incomplete.
      const res = await ensureAccess(sb, {
        requireActiveSubscription: true,
        requireOnboardingComplete: false,
      });
      if (!res.ok || !res.company) return;

      setCompany(res.company);
      setCompanyName(res.company.name ?? "");
      setDuration((res.company.default_duration_minutes ?? 30) as number);

      // If already done, go to dashboard.
      if (res.company.onboarding_complete) {
        r.replace("/dashboard");
      }
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!company?.id) return;
    if (!companyName.trim()) return setMsg("Informe o nome do negócio.");
    if (!Number.isFinite(duration) || duration < 5) return setMsg("Duração inválida.");

    setSaving(true);
    try {
      const { error } = await sb
        .from("companies")
        .update({
          name: companyName.trim(),
          default_duration_minutes: duration,
          onboarding_complete: true,
        } as any)
        .eq("id", company.id);

      if (error) throw error;

      r.push("/dashboard");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar onboarding.");
    } finally {
      setSaving(false);
    }
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
    maxWidth: 720,
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

  return (
    <div style={wrap}>
      <main style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>Configuração inicial</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>
              Deixe sua Agenda Blindada pronta em menos de 2 minutos.
            </p>
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
          {loading ? (
            <div style={{ padding: 10, opacity: 0.7 }}>Carregando…</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.3, fontSize: 18 }}>O mínimo para funcionar</div>
                <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.6 }}>
                  Definimos um <strong>tempo padrão</strong> para evitar conflitos e reduzir trabalho. No plano PRO você poderá ajustar tempo por serviço.
                </div>
              </div>

              <form onSubmit={save}>
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
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  Recomendado para começar: 30, 45 ou 60 minutos.
                </div>

                <div style={{ height: 16 }} />

                <button
                  disabled={saving}
                  style={{
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
                  }}
                >
                  {saving ? "A guardar…" : "Salvar e ir ao painel"}
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
