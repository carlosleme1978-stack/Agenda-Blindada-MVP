"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  status_v2?: string | null;
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

function normStatus(r: Row) {
  const s2 = String(r.status_v2 ?? "").toUpperCase();
  const s1 = String(r.status ?? "").toUpperCase();
  return s2 || s1 || "—";
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, []);

  async function cancelAppt(id: string) {
    if (!confirm("Cancelar esta marcação?")) return;

    setBusyId(id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setErr("Faz login.");
        return;
      }

      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appointment_id: id }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Falha ao cancelar.");
        return;
      }

      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Agenda</div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Marcações</div>
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
        <div style={{ marginTop: 18, border: "1px solid rgba(2,6,23,0.10)", borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.85)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "220px 1fr 160px 140px",
              gap: 12,
              padding: "12px 14px",
              fontSize: 12,
              fontWeight: 900,
              opacity: 0.7,
              borderBottom: "1px solid rgba(2,6,23,0.08)",
            }}
          >
            <div>Início</div>
            <div>Cliente</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Ações</div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Sem marcações neste período.</div>
          ) : (
            rows.map((r) => {
              const st = normStatus(r);
              const isGreen = st === "CONFIRMED" || st === "BOOKED";
              const isCancelled = st === "CANCELLED";
              const canCancel = !isCancelled;

              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr 160px 140px",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: "1px solid rgba(2,6,23,0.06)",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{fmt(r.start_time)}</div>
                  <div style={{ fontWeight: 800 }}>{r.customer_name_snapshot ?? r.customers?.name ?? "—"}</div>
                  <div
                    style={{
                      fontWeight: 950,
                      color: isCancelled ? "#b91c1c" : isGreen ? "#16a34a" : "rgba(2,6,23,0.75)",
                    }}
                  >
                    {st}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <button
                      onClick={() => cancelAppt(r.id)}
                      disabled={!canCancel || busyId === r.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(185,28,28,0.25)",
                        background: canCancel ? "rgba(185,28,28,0.08)" : "rgba(2,6,23,0.05)",
                        fontWeight: 950,
                        cursor: canCancel ? "pointer" : "not-allowed",
                        color: canCancel ? "#b91c1c" : "rgba(2,6,23,0.45)",
                      }}
                    >
                      {busyId === r.id ? "…" : "Cancelar"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
