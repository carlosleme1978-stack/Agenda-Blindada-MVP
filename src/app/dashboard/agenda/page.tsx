"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  start_time: string;
  end_time: string | null;
  status_v2?: string | null;
  status?: string | null;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
};

function fmt(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

function ymd(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

function statusTone(s: string) {
  const x = String(s || "").toUpperCase();
  if (["CONFIRMED", "BOOKED", "ATTENDED", "COMPLETED"].includes(x)) return "ok";
  if (x === "PENDING") return "info";
  if (x === "CANCELLED" || x === "NO_SHOW") return "danger";
  return "muted";
}

function labelStatus(r: Row) {
  return String((r.status_v2 ?? r.status ?? "—") as any);
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle();
      const companyId = (prof as any)?.company_id;
      if (!companyId) {
        setErr("Sem company_id no perfil.");
        setLoading(false);
        return;
      }

      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);

      const { data, error } = await supabase
        .from("appointments")
        .select("id,start_time,end_time,status,status_v2,customer_name_snapshot,customers(name,phone)")
        .eq("company_id", companyId)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true })
        .limit(500);

      if (error) setErr("Não consegui carregar marcações.");
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  async function cancelAppt(id: string) {
    if (!confirm("Cancelar esta marcação?")) return;
    setBusyId(id);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({ status_v2: "CANCELLED", status: "CANCELLED", cancelled_at: nowIso })
      .eq("id", id);
    if (error) {
      alert("Não consegui cancelar. Verifique permissões/RLS.");
      setBusyId(null);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status_v2: "CANCELLED", status: "CANCELLED" } : r)));
    setBusyId(null);
  }

  const now = new Date();
  const todayKey = ymd(now.toISOString());
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = ymd(tomorrow.toISOString());

  const nextUp = rows.find((r) => {
    const st = new Date(r.start_time);
    const s = labelStatus(r);
    return st > now && ["PENDING", "CONFIRMED", "BOOKED"].includes(String(s).toUpperCase());
  });

  const grouped = useMemo(() => {
    const g = { today: [] as Row[], tomorrow: [] as Row[], later: [] as Row[] };
    for (const r of rows) {
      const k = ymd(r.start_time);
      if (k === todayKey) g.today.push(r);
      else if (k === tomorrowKey) g.tomorrow.push(r);
      else g.later.push(r);
    }
    return g;
  }, [rows, todayKey, tomorrowKey]);

  return (
    <main style={{ padding: 22 }}>
      <style jsx global>{`
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.35); }
          70% { box-shadow: 0 0 0 12px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Agenda</div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Marcações (empresa)</div>
        </div>

        <Link href="/dashboard" style={{ fontWeight: 900, textDecoration: "none" }}>
          ← Voltar ao Command Center
        </Link>
      </div>

      {loading ? (
        <div style={{ marginTop: 18, opacity: 0.75 }}>Carregando…</div>
      ) : err ? (
        <div style={{ marginTop: 18, color: "#b91c1c", fontWeight: 800 }}>{err}</div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {nextUp ? (
            <div
              style={{
                marginBottom: 14,
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(2,6,23,0.10)",
                background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.08))",
                animation: "pulseGlow 1.8s ease-out infinite",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.75 }}>Próxima marcação</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{fmt(nextUp.start_time)} • {nextUp.customer_name_snapshot ?? nextUp.customers?.name ?? "—"}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Dica: mantenha esta página aberta — ela vira seu “painel ao vivo”.</div>
            </div>
          ) : null}

          <div style={{ border: "1px solid rgba(2,6,23,0.10)", borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 140px", gap: 12, padding: "12px 14px", fontSize: 12, fontWeight: 950, opacity: 0.7, borderBottom: "1px solid rgba(2,6,23,0.08)" }}>
              <div>Início</div>
              <div>Cliente</div>
              <div>Status</div>
              <div style={{ textAlign: "right" }}>Ações</div>
            </div>

            {rows.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.7 }}>Sem marcações neste período.</div>
            ) : (
              <>
                {([
                  { title: "Hoje", items: grouped.today },
                  { title: "Amanhã", items: grouped.tomorrow },
                  { title: "Próximos dias", items: grouped.later },
                ] as const)
                  .filter((x) => x.items.length > 0)
                  .map((block) => (
                    <div key={block.title}>
                      <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 950, opacity: 0.75, background: "rgba(2,6,23,0.03)", borderTop: "1px solid rgba(2,6,23,0.06)" }}>
                        {block.title}
                      </div>
                      {block.items.map((r) => {
                        const s = labelStatus(r);
                        const tone = statusTone(s);
                        const pillBg = tone === "ok" ? "rgba(16,185,129,0.12)" : tone === "danger" ? "rgba(239,68,68,0.10)" : tone === "info" ? "rgba(59,130,246,0.10)" : "rgba(2,6,23,0.06)";
                        const pillColor = tone === "ok" ? "#047857" : tone === "danger" ? "#b91c1c" : tone === "info" ? "#1d4ed8" : "rgba(2,6,23,0.65)";

                        return (
                          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 140px", gap: 12, padding: "12px 14px", borderTop: "1px solid rgba(2,6,23,0.06)", alignItems: "center" }}>
                            <div style={{ fontWeight: 950 }}>{fmt(r.start_time)}</div>
                            <div style={{ fontWeight: 900 }}>{r.customer_name_snapshot ?? r.customers?.name ?? "—"}</div>
                            <div>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 950, padding: "6px 10px", borderRadius: 999, background: pillBg, color: pillColor, border: "1px solid rgba(2,6,23,0.08)" }}>
                                {String(s).toUpperCase()}
                              </span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <button
                                onClick={() => cancelAppt(r.id)}
                                disabled={busyId === r.id || ["CANCELLED"].includes(String(s).toUpperCase())}
                                style={{
                                  cursor: busyId === r.id ? "wait" : "pointer",
                                  fontWeight: 950,
                                  padding: "8px 12px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(239,68,68,0.30)",
                                  background: "rgba(239,68,68,0.08)",
                                  color: "#b91c1c",
                                  opacity: ["CANCELLED"].includes(String(s).toUpperCase()) ? 0.35 : 1,
                                }}
                              >
                                {busyId === r.id ? "Cancelando…" : "Cancelar"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
