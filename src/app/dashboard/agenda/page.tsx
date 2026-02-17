"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  status_v2?: string | null;
  staff_id?: string | null;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
  staff?: { name: string | null } | null;
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

function effStatus(r: Row) {
  const v2 = String((r as any).status_v2 ?? "").trim();
  if (v2) return v2;
  const st = String(r.status ?? "").trim();
  return st === "BOOKED" ? "PENDING" : st || "—";
}

function pillStyle(st: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(2,6,23,0.10)",
    fontWeight: 950,
    fontSize: 12,
  };
  if (st === "CONFIRMED") return { ...base, background: "rgba(34,197,94,0.12)", color: "#14532d" };
  if (st === "PENDING") return { ...base, background: "rgba(59,130,246,0.12)", color: "#1e3a8a" };
  if (st === "COMPLETED" || st === "ATTENDED") return { ...base, background: "rgba(16,185,129,0.12)", color: "#064e3b" };
  if (st === "CANCELLED") return { ...base, background: "rgba(239,68,68,0.12)", color: "#7f1d1d" };
  if (st === "NO_SHOW") return { ...base, background: "rgba(245,158,11,0.14)", color: "#7c2d12" };
  return { ...base, background: "rgba(2,6,23,0.06)", color: "rgba(2,6,23,0.75)" };
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setUid(userId);

    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const cid = (prof as any)?.company_id ? String((prof as any).company_id) : null;
    setCompanyId(cid);
    if (!cid) {
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
      .select("id,start_time,end_time,status,status_v2,staff_id,customer_name_snapshot,customers(name,phone),staff(name)")
      .eq("company_id", cid)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelAppt(id: string) {
    if (!companyId || !uid) return;
    if (!confirm("Cancelar esta marcação?")) return;

    setBusyCancel(id);
    setErr(null);
    try {
      const payload: any = {
        status: "CANCELLED",
        status_v2: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_by: uid,
      };

      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw error;
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Não consegui cancelar.");
    } finally {
      setBusyCancel(null);
    }
  }

  return (
    <main style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Agenda</div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Marcações (empresa)</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/dashboard/new"
            style={{
              fontWeight: 950,
              textDecoration: "none",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(2,6,23,0.10)",
              background: "rgba(34,197,94,0.12)",
            }}
          >
            + Nova marcação
          </Link>
          <Link href="/dashboard" style={{ fontWeight: 900, textDecoration: "none" }}>
            ← Voltar ao Command Center
          </Link>
        </div>
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
              gridTemplateColumns: "220px 1fr 160px 160px 140px",
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
            <div>Staff</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Ações</div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Sem marcações neste período.</div>
          ) : (
            rows.map((r) => {
              const st = effStatus(r);
              const canCancel = st !== "CANCELLED" && new Date(r.start_time).getTime() > Date.now() - 5 * 60_000;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr 160px 160px 140px",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: "1px solid rgba(2,6,23,0.06)",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 950 }}>{fmt(r.start_time)}</div>
                  <div style={{ fontWeight: 800 }}>{r.customer_name_snapshot ?? r.customers?.name ?? "—"}</div>
                  <div style={{ fontWeight: 900, opacity: 0.9 }}>{(r as any).staff?.name ?? "—"}</div>
                  <div>
                    <span style={pillStyle(st)}>{st}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button
                      onClick={() => cancelAppt(r.id)}
                      disabled={!canCancel || busyCancel === r.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(2,6,23,0.10)",
                        background: canCancel ? "rgba(239,68,68,0.12)" : "rgba(2,6,23,0.04)",
                        fontWeight: 950,
                        cursor: canCancel ? "pointer" : "not-allowed",
                        opacity: canCancel ? 1 : 0.6,
                      }}
                    >
                      {busyCancel === r.id ? "Cancelando…" : "Cancelar"}
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
