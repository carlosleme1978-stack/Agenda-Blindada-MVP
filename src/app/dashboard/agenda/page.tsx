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

function pill(status: string) {
  const s = String(status || "").toUpperCase();
  if (["BOOKED", "CONFIRMED", "PENDING", "ATTENDED", "COMPLETED"].includes(s)) return { bg: "rgba(16,185,129,0.14)", bd: "rgba(16,185,129,0.35)", fg: "#065f46", label: s };
  if (["CANCELLED"].includes(s)) return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.30)", fg: "#991b1b", label: s };
  if (["NO_SHOW"].includes(s)) return { bg: "rgba(245,158,11,0.14)", bd: "rgba(245,158,11,0.35)", fg: "#92400e", label: s };
  return { bg: "rgba(2,6,23,0.06)", bd: "rgba(2,6,23,0.10)", fg: "rgba(2,6,23,0.75)", label: s || "—" };
}

function fmt(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function labelForDay(key: string) {
  const d = new Date(key + "T00:00:00");
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((d0 - t0) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
      const ownerId = uid;

      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);

      const { data, error } = await supabase
        .from("appointments")
        .select("id,start_time,end_time,status,status_v2,customer_name_snapshot,customers(name,phone)")
        .eq("owner_id", ownerId)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true })
        .limit(500);

      if (error) setErr("Não consegui carregar marcações.");
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = dayKey(r.start_time);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    // dias: hoje + próximos 14 (já é o range do fetch)
    const days: string[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i <= 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const k = `${yyyy}-${mm}-${dd}`;
      days.push(k);
    }
    return { map: m, days };
  }, [rows]);

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
        <div style={{ marginTop: 18, color: "rgba(255,255,255,0.92)", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}>{err}</div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {grouped.days.map((k) => {
            const list = grouped.map.get(k) ?? [];
            const isToday = labelForDay(k) === "Hoje";
            return (
              <div key={k} className="ab-card" style={{ overflow: "hidden" }}>
                <div className="ab-card-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 950 }}>{labelForDay(k)}</div>
                    <div className="ab-muted" style={{ fontSize: 12 }}>{k}</div>
                  </div>
                  <div className="ab-muted" style={{ fontSize: 12, fontWeight: 900 }}>{list.length} marcação(ões)</div>
                </div>

                <div className="ab-table" style={{ borderLeft: 0, borderRight: 0, borderBottom: 0, borderRadius: 0 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 140px", gap: 12, padding: "12px 14px", fontSize: 12, fontWeight: 900, opacity: 0.75, borderBottom: "1px solid var(--table-border)" }}>
                    <div>Início</div>
                    <div>Cliente</div>
                    <div>Status</div>
                    <div style={{ textAlign: "right" }}>Ações</div>
                  </div>

                  {list.length === 0 ? (
                    <div style={{ padding: 14, opacity: 0.75 }}>Sem marcações.</div>
                  ) : (
                    list.map((r) => {
                      const s = pill(String(r.status_v2 ?? r.status));
                      const canCancel = !["CANCELLED"].includes(String(r.status_v2 ?? r.status).toUpperCase());
                      return (
                        <div key={r.id} className="ab-row" style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 140px", gap: 12, padding: "12px 14px" }}>
                          <div style={{ fontWeight: 950 }} className={isToday ? "ab-pulse-green" : ""}>
                            {fmt(r.start_time)}
                          </div>
                          <div style={{ fontWeight: 850 }}>{r.customer_name_snapshot ?? r.customers?.name ?? "—"}</div>
                          <div>
                            <span className="ab-pill" style={{ background: s.bg, border: `1px solid ${s.bd}`, color: "rgba(255,255,255,0.92)" }}>
                              {s.label}
                            </span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <button
                              disabled={!canCancel}
                              onClick={async () => {
                                if (!confirm("Cancelar esta marcação?") ) return;
                                try {
                                  const { data: sess2 } = await supabase.auth.getSession();
                                  const token = sess2.session?.access_token;
                                  const res = await fetch("/api/appointments/cancel", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                    body: JSON.stringify({ appointmentId: r.id }),
                                  });
                                  if (!res.ok) throw new Error(await res.text());
                                  setRows((prev) => prev.map((x) => (x.id === r.id ? ({ ...x, status: "CANCELLED", status_v2: "CANCELLED" } as any) : x)));
                                } catch {
                                  alert("Não consegui cancelar. Verifique permissões/RLS.");
                                }
                              }}
                              className="ab-btn"
                              style={{
                                padding: "8px 10px",
                                opacity: canCancel ? 1 : 0.55,
                                cursor: canCancel ? "pointer" : "not-allowed",
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
