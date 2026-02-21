"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type ApptRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  status_v2?: string | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot?: string | null;
  customers?: { name: string | null; phone: string | null } | null;
  service_name_snapshot?: string | null;
  service_duration_minutes_snapshot?: number | null;
  service_price_cents_snapshot?: number | null;
  service_currency_snapshot?: string | null;
};

type ServiceLine = {
  service_name_snapshot: string | null;
  duration_minutes_snapshot: number | null;
  price_cents_snapshot: number | null;
  currency_snapshot: string | null;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtBR(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtHM(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function weekDayLabel(d: Date) {
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
}

function pill(status: string) {
  const s = String(status || "").toUpperCase();
  if (["BOOKED", "CONFIRMED", "ATTENDED", "COMPLETED"].includes(s)) return { bg: "rgba(16,185,129,0.14)", bd: "rgba(16,185,129,0.35)", fg: "rgba(255,255,255,0.95)", label: "Confirmado" };
  if (["CANCELLED"].includes(s)) return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.30)", fg: "rgba(255,255,255,0.95)", label: "Cancelado" };
  if (["NO_SHOW"].includes(s)) return { bg: "rgba(245,158,11,0.14)", bd: "rgba(245,158,11,0.35)", fg: "rgba(255,255,255,0.95)", label: "Não compareceu" };
  return { bg: "rgba(255,255,255,0.08)", bd: "rgba(255,255,255,0.14)", fg: "rgba(255,255,255,0.92)", label: s || "—" };
}

function centsToEUR(cents?: number | null) {
  const v = Math.round(Number(cents ?? 0));
  return (v / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function MiniCalendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  useEffect(() => {
    setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value]);

  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(days.slice(i * 7, i * 7 + 7));
    return rows;
  }, [month]);

  return (
    <div className="ab-card" style={{ overflow: "hidden" }}>
      <div className="ab-card-inner" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button className="ab-btn" style={{ width: 34, height: 34, borderRadius: 10, fontWeight: 950 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mês anterior">
            ‹
          </button>
          <div style={{ fontWeight: 950, letterSpacing: -0.2, textTransform: "capitalize" }}>
            {month.toLocaleString("pt-PT", { month: "long" })} {month.getFullYear()}
          </div>
          <button className="ab-btn" style={{ width: 34, height: 34, borderRadius: 10, fontWeight: 950 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Próximo mês">
            ›
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 10, fontSize: 11, opacity: 0.75, fontWeight: 900 }}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} style={{ textAlign: "center" }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateRows: "repeat(6, 1fr)", gap: 6, marginTop: 8 }}>
          {weeks.map((row, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {row.map((d) => {
                const inMonth = d.getMonth() === month.getMonth();
                const isSel = ymd(d) === ymd(value);
                const isToday = ymd(d) === ymd(new Date());
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => onChange(startOfDay(d))}
                    className="ab-btn"
                    style={{
                      height: 34,
                      borderRadius: 10,
                      padding: 0,
                      fontWeight: 950,
                      opacity: inMonth ? 1 : 0.45,
                      border: isSel ? "1px solid rgba(212,175,55,0.55)" : "1px solid rgba(255,255,255,0.10)",
                      background: isSel ? "rgba(212,175,55,0.12)" : isToday ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.0)",
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppointmentModal({ appt, services, loading, onClose }: { appt: ApptRow; services: ServiceLine[] | null; loading: boolean; onClose: () => void }) {
  const d = new Date(appt.start_time);
  const end = appt.end_time ? new Date(appt.end_time) : null;
  const name = appt.customer_name_snapshot || appt.customers?.name || "Cliente";
  const phone = appt.customers?.phone || appt.customer_phone_snapshot || "";
  const status = pill(appt.status_v2 || appt.status);

  const fallbackLines: ServiceLine[] = appt.service_name_snapshot
    ? [
        {
          service_name_snapshot: appt.service_name_snapshot ?? null,
          duration_minutes_snapshot: appt.service_duration_minutes_snapshot ?? null,
          price_cents_snapshot: appt.service_price_cents_snapshot ?? null,
          currency_snapshot: appt.service_currency_snapshot ?? "EUR",
        },
      ]
    : [];

  const lines = services && services.length > 0 ? services : fallbackLines;
  const totalCents = lines.reduce((acc, it) => acc + Math.round(Number(it.price_cents_snapshot ?? 0)), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} className="ab-card" style={{ width: "100%", maxWidth: 560, overflow: "hidden" }}>
        <div className="ab-card-inner" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Agendamento</div>
              <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: -0.3 }}>{name}</div>
              {phone ? <div className="ab-muted" style={{ fontSize: 12, marginTop: 2 }}>{phone}</div> : null}
            </div>
            <button className="ab-btn" onClick={onClose} style={{ borderRadius: 12, fontWeight: 950 }}>
              Fechar
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${status.bd}`, background: status.bg, color: status.fg, fontWeight: 950, fontSize: 12 }}>
              {status.label}
            </div>
            <div className="ab-muted" style={{ fontSize: 12, fontWeight: 900 }}>
              {fmtBR(d)} • {fmtHM(d)}{end ? ` – ${fmtHM(end)}` : ""}
            </div>
          </div>

          <div className="ab-card" style={{ marginTop: 12, borderRadius: 16 }}>
            <div className="ab-card-inner" style={{ padding: 12 }}>
              <div style={{ fontWeight: 950 }}>O que foi marcado</div>
              {loading ? (
                <div className="ab-muted" style={{ marginTop: 8 }}>Carregando serviços…</div>
              ) : lines.length === 0 ? (
                <div className="ab-muted" style={{ marginTop: 8 }}>Sem detalhes de serviço.</div>
              ) : (
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {lines.map((it, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{it.service_name_snapshot || "Serviço"}</div>
                        <div className="ab-muted" style={{ fontSize: 12 }}>{it.duration_minutes_snapshot ? `${it.duration_minutes_snapshot}min` : ""}</div>
                      </div>
                      <div style={{ fontWeight: 950 }}>{centsToEUR(it.price_cents_snapshot)}</div>
                    </div>
                  ))}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.10)", marginTop: 4 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 950 }}>
                    <div>Total</div>
                    <div>{centsToEUR(totalCents)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState<ApptRow | null>(null);
  const [openServices, setOpenServices] = useState<ServiceLine[] | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const range = useMemo(() => {
    const a = startOfDay(selected);
    const b = addDays(a, 3);
    return { from: a, to: b };
  }, [selected]);

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
      // Appointments are company-scoped. owner_id can be NULL (e.g. WhatsApp flow), so we filter by company_id.
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", uid)
        .maybeSingle();

      if (profileErr) {
        console.error("Profile load error:", profileErr);
        setErr("Não consegui carregar sua empresa.");
        setLoading(false);
        return;
      }

      const companyId = profile?.company_id;
      if (!companyId) {
        setErr("Sua empresa não está configurada.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,start_time,end_time,status,status_v2,customer_name_snapshot,customers(name,phone),service_name_snapshot,service_duration_minutes_snapshot,service_price_cents_snapshot,service_currency_snapshot"
        )
        .eq("company_id", companyId)
        .gte("start_time", range.from.toISOString())
        .lt("start_time", range.to.toISOString())
        .order("start_time", { ascending: true })
        .limit(500);

      if (error) {
        console.error("Agenda load error:", error);
        setErr("Não consegui carregar marcações.");
        setRows([]);
      } else {
        setRows((data ?? []) as any);
      }
      setLoading(false);
    })();
  }, [range.from, range.to, supabase]);

  useEffect(() => {
    (async () => {
      if (!open) {
        setOpenServices(null);
        setOpenLoading(false);
        return;
      }
      setOpenLoading(true);
      setOpenServices(null);
      try {
        const { data, error } = await supabase
          .from("appointment_services")
          .select("service_name_snapshot,duration_minutes_snapshot,price_cents_snapshot,currency_snapshot")
          .eq("appointment_id", open.id)
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("appointment_services load failed (fallback to snapshots):", error);
          setOpenServices([]);
        } else {
          setOpenServices((data ?? []) as any);
        }
      } catch (e) {
        console.warn("appointment_services load threw (fallback to snapshots):", e);
        setOpenServices([]);
      } finally {
        setOpenLoading(false);
      }
    })();
  }, [open, supabase]);

  const days = useMemo(() => {
    const d0 = startOfDay(selected);
    return [d0, addDays(d0, 1), addDays(d0, 2)];
  }, [selected]);

  const timeSlots = useMemo(() => {
    const start = 9;
    const end = 19;
    const slots: { label: string; minutes: number }[] = [];
    for (let h = start; h <= end; h++) slots.push({ label: `${pad2(h)}:00`, minutes: h * 60 });
    return slots;
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, ApptRow[]>();
    for (const r of rows) {
      const k = ymd(new Date(r.start_time));
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [rows]);

  const pxPerMin = 1.6;
  const dayStartMin = 9 * 60;
  const dayEndMin = 19 * 60;
  const gridHeight = (dayEndMin - dayStartMin) * pxPerMin;

  function topFor(iso: string) {
    const d = new Date(iso);
    const mins = d.getHours() * 60 + d.getMinutes();
    return (mins - dayStartMin) * pxPerMin;
  }
  function heightFor(r: ApptRow) {
    const s = new Date(r.start_time);
    const e = r.end_time ? new Date(r.end_time) : null;
    const minsS = s.getHours() * 60 + s.getMinutes();
    const minsE = e ? e.getHours() * 60 + e.getMinutes() : minsS + Math.max(15, Number(r.service_duration_minutes_snapshot ?? 30));
    return Math.max(28, (minsE - minsS) * pxPerMin);
  }

  return (
    <main style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Agenda</div>
          <div style={{ fontSize: 32, fontWeight: 980, letterSpacing: -0.6 }}>Agenda</div>
        </div>
        <Link href="/dashboard" style={{ fontWeight: 900, textDecoration: "none" }}>
          ← Voltar ao Command Center
        </Link>
      </div>

      {err ? (
        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.92)", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}>{err}</div>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <MiniCalendar value={selected} onChange={setSelected} />
          <Link
            href="/dashboard/new"
            className="ab-btn"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: 48, borderRadius: 16, fontWeight: 950, border: "1px solid rgba(212,175,55,0.45)", background: "rgba(212,175,55,0.10)", textDecoration: "none" }}
          >
            + Nova Marcação
          </Link>
        </div>

        <div className="ab-card" style={{ overflow: "hidden" }}>
          <div className="ab-card-inner" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="ab-muted" style={{ fontSize: 12, fontWeight: 900 }}>Semana</div>
                <div style={{ fontWeight: 950 }}>{fmtBR(selected)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="ab-btn" onClick={() => setSelected(addDays(selected, -1))} style={{ borderRadius: 14, fontWeight: 950 }}>
                  ←
                </button>
                <button className="ab-btn" onClick={() => setSelected(startOfDay(new Date()))} style={{ borderRadius: 14, fontWeight: 950 }}>
                  Hoje
                </button>
                <button className="ab-btn" onClick={() => setSelected(addDays(selected, 1))} style={{ borderRadius: 14, fontWeight: 950 }}>
                  →
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "72px repeat(3, 1fr)", gap: 0, marginTop: 12 }}>
              <div />
              {days.map((d) => (
                <button
                  key={ymd(d)}
                  className="ab-btn"
                  onClick={() => setSelected(startOfDay(d))}
                  style={{ textAlign: "left", borderRadius: 14, padding: "10px 12px", fontWeight: 950, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                >
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{weekDayLabel(d)}</div>
                  <div style={{ fontSize: 14 }}>{fmtBR(d)}</div>
                </button>
              ))}

              <div style={{ paddingTop: 10 }}>
                <div style={{ position: "relative", height: gridHeight }}>
                  {timeSlots.map((t) => {
                    const top = (t.minutes - 9 * 60) * pxPerMin;
                    return (
                      <div key={t.label} style={{ position: "absolute", top: top - 8, left: 0, right: 6, fontSize: 11, opacity: 0.7, fontWeight: 900 }}>
                        {t.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {days.map((d) => {
                const k = ymd(d);
                const list = byDay.get(k) ?? [];
                return (
                  <div key={k} style={{ position: "relative", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ position: "relative", height: gridHeight }}>
                      {timeSlots.map((t) => {
                        const top = (t.minutes - 9 * 60) * pxPerMin;
                        return <div key={t.label} style={{ position: "absolute", top, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.06)" }} />;
                      })}

                      {list
                        .filter((r) => {
                          const dd = new Date(r.start_time);
                          const mins = dd.getHours() * 60 + dd.getMinutes();
                          return mins >= 9 * 60 && mins <= 19 * 60;
                        })
                        .map((r) => {
                          const top = topFor(r.start_time);
                          const h = heightFor(r);
                          const name = r.customer_name_snapshot || r.customers?.name || "Cliente";
                          const svc = String(r.service_name_snapshot || "Serviço")
                          .replace(/\s*\n\s*/g, " + ")
                          .replace(/\s{2,}/g, " ")
                          .trim();
                          const st = pill(r.status_v2 || r.status);
                          const end = r.end_time ? new Date(r.end_time) : null;
                          const time = `${fmtHM(new Date(r.start_time))}${end ? ` – ${fmtHM(end)}` : ""}`;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setOpen(r)}
                              className="ab-btn"
                              style={{ position: "absolute", top, left: 10, right: 10, height: h, borderRadius: 14, padding: "10px 12px", textAlign: "left", border: "1px solid rgba(212,175,55,0.20)", background: "rgba(212,175,55,0.07)", boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}
                              title="Clique para ver detalhes"
                            >
                              {/* status badge (top-right) */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: 10,
                                  right: 12,
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  border: `1px solid ${st.bd}`,
                                  background: st.bg,
                                  color: st.fg,
                                  fontWeight: 950,
                                  fontSize: 11,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {st.label}
                              </div>

                              {/* stacked content (Nome -> Serviço -> Horário) */}
                              <div style={{ paddingRight: 10 }}>
                                <div style={{ fontWeight: 980, letterSpacing: -0.2, lineHeight: 1.1 }}>{name}</div>
                                <div
                                  className="ab-muted"
                                  style={{
                                    fontSize: 12,
                                    marginTop: 6,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {svc}
                                </div>
                                <div className="ab-muted" style={{ fontSize: 12, marginTop: 8, fontWeight: 950, whiteSpace: "nowrap" }}>
                                  {time}
                                </div>
                              </div>
                            </button>
                          );
                        })}

                      {!loading && list.length === 0 ? (
                        <div className="ab-muted" style={{ position: "absolute", top: 14, left: 14, fontWeight: 900, opacity: 0.55 }}>Sem marcações</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {loading ? <div className="ab-muted" style={{ marginTop: 10 }}>Carregando…</div> : null}
          </div>
        </div>
      </div>

      {open ? <AppointmentModal appt={open} services={openServices} loading={openLoading} onClose={() => setOpen(null)} /> : null}
    </main>
  );
}
