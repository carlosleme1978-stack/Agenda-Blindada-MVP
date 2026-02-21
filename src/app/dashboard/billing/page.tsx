"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";
import { getCompanyForCurrentUser } from "@/lib/access";

type Company = {
  id: string;
  name: string | null;
  plan: "basic" | "pro";
  staff_limit: number;
  sub_basic_status: string;
  sub_pro_status: string;
};

export default function BillingPage() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<null | "basic" | "pro">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const wrapStyle = useMemo(
    () => ({
      minHeight: "100vh",
      background:
        "radial-gradient(1200px 800px at 20% 20%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(900px 700px at 80% 30%, rgba(236,72,153,0.22), transparent 55%), radial-gradient(900px 700px at 55% 85%, rgba(16,185,129,0.18), transparent 55%), linear-gradient(180deg, #0b1020 0%, #070a14 100%)",
      color: "#e5e7eb",
      padding: "clamp(12px, 3vw, 24px)",
    }),
    []
  );

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: 820,
      margin: "0 auto",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 20,
      boxShadow:
        "0 40px 80px rgba(0,0,0,0.45), 0 10px 24px rgba(0,0,0,0.25)",
      padding: 20,
      backdropFilter: "blur(10px)",
    }),
    []
  );

  const pill = (ok: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800 as const,
    letterSpacing: -0.2,
    border: `1px solid ${ok ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
    background: ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.10)",
    color: ok ? "#d1fae5" : "#fee2e2",
  });

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await getCompanyForCurrentUser(sb);
      if (!res.ok) {
        location.href = "/login";
        return;
      }
      setCompany(res.company as any);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar faturação.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkout(plan: "basic" | "pro") {
    if (!company?.id) return;
    setPaying(plan);
    setMsg(null);
    try {
      const { data: sessionRes } = await sb.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch(`/api/stripe/checkout/${plan}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: company.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao iniciar pagamento.");

      if (!data?.url) throw new Error("Stripe URL não retornou.");
      window.location.href = data.url;
    } catch (e: any) {
      setMsg(e?.message ?? "Erro no checkout.");
    } finally {
      setPaying(null);
    }
  }

  async function openPortal() {
    setMsg(null);
    try {
      const res = await fetch(`/api/stripe/portal`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao abrir portal');
      if (!data?.url) throw new Error('Portal URL não retornou');
      window.location.href = data.url;
    } catch (e: any) {
      setMsg(e?.message ?? 'Erro ao abrir portal');
    }
  }


  const topBar = (
    <div className="billTop" style={{ maxWidth: 820, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4 }}>Plano e faturação</div>
        <div style={{ fontSize: 13, color: "rgba(229,231,235,0.75)" }}>
          Controle do Basic (19€) e upgrade PRO (27€).
        </div>
      </div>
      <Link href="/dashboard" style={{ color: "rgba(229,231,235,0.85)", fontSize: 13, textDecoration: "none" }}>
        ← Voltar ao Dashboard
      </Link>
    </div>
  );

  return (
    <div style={wrapStyle as any}>
      {topBar}

      <div style={{ height: 16 }} />

      <div style={cardStyle as any}>
        {loading ? (
          <div style={{ padding: 18, color: "rgba(229,231,235,0.8)" }}>Carregando…</div>
        ) : !company ? (
          <div style={{ padding: 18, color: "rgba(229,231,235,0.8)" }}>{msg ?? "Sem dados."}</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 14, color: "rgba(229,231,235,0.75)" }}>Empresa</div>
                <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.3 }}>
                  {company.name ?? "Agenda Blindada"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={pill(company.sub_basic_status === "active") as any}>
                  BASIC: {company.sub_basic_status === "active" ? "ativo" : "inativo"}
                </span>
                <span style={pill(company.sub_pro_status === "active") as any}>
                  PRO: {company.sub_pro_status === "active" ? "ativo" : "inativo"}
                </span>
              </div>
            </div>

            <div className="planGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 13, color: "rgba(229,231,235,0.72)" }}>Plano atual</div>
                <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.6, marginTop: 4 }}>
                  {company.plan === "pro" ? "PRO (27€)" : "BASIC (19€)"}
                </div>
                <div style={{ fontSize: 13, color: "rgba(229,231,235,0.72)", marginTop: 6 }}>
                  Funcionários permitidos: <strong style={{ color: "#fff" }}>{company.staff_limit}</strong>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 13, color: "rgba(229,231,235,0.72)" }}>Ações</div>

                {company.sub_basic_status !== "active" ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: "rgba(254,226,226,0.95)", fontWeight: 800 }}>Assinatura BASIC em atraso</div>
                    <div style={{ color: "rgba(229,231,235,0.72)", fontSize: 13, marginTop: 6 }}>
                      Regularize para continuar a usar o sistema.
                    </div>
                    <button
                      onClick={() => checkout("basic")}
                      disabled={paying === "basic"}
                      style={{
                        marginTop: 12,
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(236,72,153,0.75))",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {paying === "basic" ? "Redirecionando…" : "Pagar BASIC (19€)"}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <button
                      onClick={() => openPortal()}
                      style={{
                        width: "100%",
                        padding: "11px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(229,231,235,0.9)",
                        fontWeight: 850,
                        cursor: "pointer",
                      }}
                    >
                      Gerenciar assinatura (Portal)
                    </button>

                    <button
                      onClick={() => checkout("pro")}
                      disabled={company.plan === "pro" || paying === "pro"}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background:
                          company.plan === "pro"
                            ? "rgba(255,255,255,0.08)"
                            : "linear-gradient(135deg, rgba(16,185,129,0.85), rgba(59,130,246,0.78))",
                        color: company.plan === "pro" ? "rgba(229,231,235,0.75)" : "#fff",
                        fontWeight: 900,
                        cursor: company.plan === "pro" ? "not-allowed" : "pointer",
                      }}
                    >
                      {company.plan === "pro"
                        ? "PRO já ativo"
                        : paying === "pro"
                        ? "Redirecionando…"
                        : "Ativar PRO (27€)"}
                    </button>

                    <button
                      onClick={() => load()}
                      style={{
                        width: "100%",
                        padding: "11px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(229,231,235,0.9)",
                        fontWeight: 850,
                        cursor: "pointer",
                      }}
                    >
                      Recarregar status
                    </button>
                  </div>
                )}
              </div>
            </div>

            {msg && (
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "rgba(254,226,226,0.95)", fontWeight: 700 }}>
                {msg}
              </div>
            )}

            <div style={{ color: "rgba(229,231,235,0.68)", fontSize: 12, lineHeight: 1.35 }}>
              * O plano PRO é um add-on. Se o PRO falhar, o sistema volta ao BASIC automaticamente.
              O sistema só bloqueia totalmente se o BASIC estiver inativo.
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        @media (max-width: 720px){
          .billTop{ justify-content:flex-start; }
          .backBtn{ width: 100%; text-align:center; justify-content:center; display:inline-flex; }
        }
        @media (max-width: 720px){
          .planGrid{ grid-template-columns: 1fr !important; }
        }
      `}</style>

    </div>
  );
}
