"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type ApptRow = {
  id: string;
  start_time: string;
  status: string | null;
  status_v2?: string | null;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
  service_price_cents_snapshot?: number | null;
  service_currency_snapshot?: string | null;
};

type SvcRow = {
  appointment_id: string;
  service_name_snapshot: string | null;
  duration_minutes_snapshot: number | null;
  price_cents_snapshot: number | null;
  currency_snapshot: string | null;
};

type ClientAgg = {
  key: string;
  name: string;
  phone: string | null;
  totalCents: number;
  visits: number;
  noShows: number;
  lastVisit: string | null;
  firstVisit: string | null;
  avgGapDays: number | null;
  appts: {
    id: string;
    start: string;
    status: string;
    totalCents: number;
    servicesLabel: string;
  }[];
};

function toDigits(phone: string | null | undefined) {
  return String(phone || "").replace(/\D/g, "");
}

function eurFromCents(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `€ ${v}`;
}

function fmtDatePt(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function fmtDateTimePt(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} - ${hh}:${mi}`;
}

function normStatus(s: string | null | undefined, v2?: string | null) {
  const raw = String(v2 || s || "").toUpperCase();
  if (raw === "NO_SHOW") return "NO_SHOW";
  if (raw === "CANCELLED" || raw === "CANCELED") return "CANCELLED";
  if (raw === "CONFIRMED" || raw === "BOOKED" || raw === "ATTENDED" || raw === "COMPLETED") return "CONFIRMED";
  return raw || "—";
}

function pillStyle(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED") return { bg: "rgba(16,185,129,0.14)", bd: "rgba(16,185,129,0.35)", fg: "var(--text)", label: "Confirmado" };
  if (s === "CANCELLED") return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.32)", fg: "var(--text)", label: "Cancelado" };
  if (s === "NO_SHOW") return { bg: "rgba(245,158,11,0.14)", bd: "rgba(245,158,11,0.35)", fg: "var(--text)", label: "Não compareceu" };
  return { bg: "rgba(255,255,255,0.08)", bd: "rgba(255,255,255,0.16)", fg: "var(--text)", label: s };
}

function cardStyle(strong?: boolean): React.CSSProperties {
  return {
    background: strong ? "var(--card-bg-strong)" : "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 18,
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(14px)",
  };
}

export default function Clientes360Page() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientAgg[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
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

      try {
        // 1) Carrega marcações (últimos ~12 meses; suficiente para histórico e métricas)
        const from = new Date();
        from.setDate(from.getDate() - 370);

        const { data: apptsRaw, error } = await supabase
          .from("appointments")
          .select("id,start_time,status,status_v2,customer_name_snapshot,customers(name,phone),service_price_cents_snapshot,service_currency_snapshot")
          .eq("owner_id", ownerId)
          .gte("start_time", from.toISOString())
          .order("start_time", { ascending: false })
          .limit(1000);

        if (error) throw error;

        const appts = (apptsRaw ?? []) as unknown as ApptRow[];
        const ids = appts.map((a) => a.id).filter(Boolean);

        // 2) Carrega serviços por marcação (para total e rótulo de serviços) — sem quebrar se não existir
        const svcByAppt: Record<string, SvcRow[]> = {};
        if (ids.length) {
          const chunk = 200;
          for (let i = 0; i < ids.length; i += chunk) {
            const slice = ids.slice(i, i + chunk);
            const { data: svc, error: svcErr } = await supabase
              .from("appointment_services")
              .select("appointment_id,service_name_snapshot,duration_minutes_snapshot,price_cents_snapshot,currency_snapshot")
              .in("appointment_id", slice)
              .order("created_at", { ascending: true });

            if (svcErr) {
              // fallback (snapshots no appointments) — não derruba a página
              break;
            }
            for (const row of (svc ?? []) as any[]) {
              const k = String(row.appointment_id);
              (svcByAppt[k] ||= []).push(row as SvcRow);
            }
          }
        }

        // 3) Agrega por cliente
        const map: Record<string, ClientAgg> = {};

        function addApptToClient(key: string, name: string, phone: string | null, appt: ApptRow) {
          const st = normStatus(appt.status, appt.status_v2);

          const svcRows = svcByAppt[appt.id] ?? [];
          let totalCents = 0;
          let servicesLabel = "";

          if (svcRows.length) {
            totalCents = svcRows.reduce((acc, r) => acc + Number(r.price_cents_snapshot || 0), 0);
            servicesLabel = svcRows
              .map((r) => r.service_name_snapshot)
              .filter(Boolean)
              .join(", ");
          } else {
            totalCents = Number(appt.service_price_cents_snapshot || 0);
            servicesLabel = String(appt.customers?.name || appt.customer_name_snapshot || "").trim() ? "Serviço" : "";
          }

          const c = (map[key] ||= {
            key,
            name,
            phone,
            totalCents: 0,
            visits: 0,
            noShows: 0,
            lastVisit: null,
            firstVisit: null,
            avgGapDays: null,
            appts: [],
          });

          // Atualiza nome/telefone (mantém o mais completo)
          if (name && name.length > (c.name || "").length) c.name = name;
          if (!c.phone && phone) c.phone = phone;

          // Total e contagens
          if (st === "CONFIRMED") {
            c.visits += 1;
            c.totalCents += totalCents;
          } else if (st === "NO_SHOW") {
            c.noShows += 1;
          }

          // Datas
          const t = appt.start_time;
          if (!c.lastVisit || new Date(t) > new Date(c.lastVisit)) c.lastVisit = t;
          if (!c.firstVisit || new Date(t) < new Date(c.firstVisit)) c.firstVisit = t;

          // Histórico (mostra tudo; total só aparece nos confirmados)
          c.appts.push({
            id: appt.id,
            start: appt.start_time,
            status: st,
            totalCents,
            servicesLabel,
          });
        }

        for (const a of appts) {
          const phone = a.customers?.phone ?? null;
          const name = (a.customers?.name || a.customer_name_snapshot || "Cliente").trim();
          const key = toDigits(phone) || name.toLowerCase();

          addApptToClient(key, name, phone, a);
        }

        // 4) Calcula frequência média (gap entre visitas confirmadas)
        for (const k of Object.keys(map)) {
          const c = map[k];
          const confirmed = c.appts
            .filter((x) => x.status === "CONFIRMED")
            .map((x) => x.start)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          if (confirmed.length >= 2) {
            let sum = 0;
            let n = 0;
            for (let i = 1; i < confirmed.length; i++) {
              const d1 = new Date(confirmed[i - 1]).getTime();
              const d2 = new Date(confirmed[i]).getTime();
              const gap = Math.max(0, (d2 - d1) / (1000 * 60 * 60 * 24));
              sum += gap;
              n += 1;
            }
            c.avgGapDays = n ? Math.round(sum / n) : null;
          } else {
            c.avgGapDays = null;
          }

          // Ordena histórico do cliente (desc)
          c.appts.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
        }

        const list = Object.values(map).sort((a, b) => b.totalCents - a.totalCents);

        if (!alive) return;
        setClients(list);
        setSelectedKey(list[0]?.key ?? null);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setErr("Não consegui carregar clientes.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return clients;
    return clients.filter((c) => (c.name || "").toLowerCase().includes(qq) || toDigits(c.phone || "").includes(toDigits(qq)));
  }, [clients, q]);

  const selected = useMemo(() => filtered.find((c) => c.key === selectedKey) ?? filtered[0] ?? null, [filtered, selectedKey]);

  const pageWrap: React.CSSProperties = {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "28px 18px 34px",
  };

  return (
    <div style={pageWrap}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 6 }}>Clientes</div>
          <h1 style={{ margin: 0, fontSize: 44, letterSpacing: -0.6, lineHeight: 1.05 }}>Clientes 360°</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18, alignItems: "start" }}>
        {/* LEFT: table */}
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cliente..."
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 40px",
                  borderRadius: 14,
                  border: "1px solid var(--input-border)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.75 }}>⌕</div>
            </div>
            <button
              type="button"
              style={{
                padding: "11px 14px",
                borderRadius: 14,
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--btn-fg)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
              title="Filtrar (em breve)"
              onClick={() => {}}
            >
              ⌁ <span style={{ opacity: 0.9 }}>Filtrar</span>
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 18, opacity: 0.8 }}>Carregando…</div>
          ) : err ? (
            <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)" }}>{err}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ opacity: 0.8, fontSize: 13 }}>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>Cliente</th>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>Total gasto</th>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>Visitas</th>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>No-shows</th>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>Última visita</th>
                    <th style={{ textAlign: "left", padding: "10px 10px" }}>Média</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const active = selected?.key === c.key;
                    return (
                      <tr
                        key={c.key}
                        onClick={() => setSelectedKey(c.key)}
                        style={{
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.06)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>
                          <div style={{ fontWeight: 650 }}>{c.name}</div>
                        </td>
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>
                          <div style={{ fontWeight: 650 }}>{eurFromCents(c.totalCents)}</div>
                        </td>
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>{c.visits}</td>
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>
                          {c.noShows > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span style={{ opacity: 0.9 }}>{c.noShows}</span>
                              <span style={{ opacity: 0.7 }}>faltas</span>
                            </span>
                          ) : (
                            <span style={{ opacity: 0.7 }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>
                          {c.lastVisit ? fmtDatePt(c.lastVisit) : "—"}
                        </td>
                        <td style={{ padding: "12px 10px", borderTop: "1px solid var(--table-border)" }}>
                          {c.avgGapDays ? `${c.avgGapDays} dias` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT: detail */}
        <div style={{ ...cardStyle(true), padding: 18, minHeight: 520 }}>
          {!selected ? (
            <div style={{ padding: 12, opacity: 0.8 }}>Selecione um cliente.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid var(--card-border)",
                    background: "rgba(255,255,255,0.06)",
                    fontWeight: 800,
                  }}
                >
                  {selected.name?.trim()?.slice(0, 1).toUpperCase() || "C"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 750 }}>{selected.name}</div>
                  <div style={{ opacity: 0.72, fontSize: 13 }}>{selected.phone ? `+${toDigits(selected.phone)}` : "—"}</div>
                </div>
              </div>

              <div style={{ ...cardStyle(), padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ opacity: 0.75, fontSize: 13 }}>Total gasto</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{eurFromCents(selected.totalCents)}</div>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, opacity: 0.9, fontSize: 13 }}>
                  <div>
                    <div style={{ opacity: 0.75 }}>Visitas</div>
                    <div style={{ fontWeight: 700 }}>{selected.visits}</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.75 }}>Faltas</div>
                    <div style={{ fontWeight: 700 }}>{selected.noShows}</div>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle(), padding: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 750, marginBottom: 10 }}>Histórico de Agendamentos</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflow: "auto", paddingRight: 4 }}>
                  {selected.appts.slice(0, 12).map((a) => {
                    const p = pillStyle(a.status);
                    return (
                      <div key={a.id} style={{ borderTop: "1px solid var(--table-border)", paddingTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ opacity: 0.9, fontSize: 13 }}>{fmtDateTimePt(a.start)}</div>
                          <span style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, fontSize: 12, fontWeight: 700 }}>
                            {p.label}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>{a.servicesLabel || "—"}</div>
                        {a.status === "CONFIRMED" ? (
                          <div style={{ marginTop: 6, fontWeight: 750, fontSize: 13 }}>{eurFromCents(a.totalCents)}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ ...cardStyle(), padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9 }}>
                  <div>Total gastado</div>
                  <div style={{ fontWeight: 800 }}>{eurFromCents(selected.totalCents)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9, marginTop: 8 }}>
                  <div>Total visitas</div>
                  <div style={{ fontWeight: 800 }}>{selected.visits}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9, marginTop: 8 }}>
                  <div>Total faltas</div>
                  <div style={{ fontWeight: 800 }}>{selected.noShows}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9, marginTop: 8 }}>
                  <div>Primeira visita</div>
                  <div style={{ fontWeight: 800 }}>{selected.firstVisit ? fmtDatePt(selected.firstVisit) : "—"}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9, marginTop: 8 }}>
                  <div>Frequência média (a cada)</div>
                  <div style={{ fontWeight: 800 }}>{selected.avgGapDays ? `${selected.avgGapDays} dias` : "—"}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18, opacity: 0.65, fontSize: 12 }}>
        {loading ? "" : `Clientes: ${filtered.length}`}
      </div>
    </div>
  );
}
