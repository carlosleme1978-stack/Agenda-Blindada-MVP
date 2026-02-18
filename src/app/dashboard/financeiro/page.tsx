"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type ApptRow = {
  id: string;
  start_time: string;
  status: string | null;
  status_v2?: string | null;
  service_price_cents_snapshot?: number | null;
  service_currency_snapshot?: string | null;
};

type SvcRow = {
  appointment_id: string;
  service_name_snapshot: string | null;
  price_cents_snapshot: number | null;
};

function eurFromCents(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `€ ${v}`;
}

function pct(n: number) {
  const v = (Number.isFinite(n) ? n : 0).toFixed(1).replace(".", ",");
  return `${v}%`;
}

function normStatus(s: string | null | undefined, v2?: string | null) {
  const raw = String(v2 || s || "").toUpperCase();
  if (raw === "NO_SHOW") return "NO_SHOW";
  if (raw === "CANCELLED" || raw === "CANCELED") return "CANCELLED";
  if (raw === "CONFIRMED" || raw === "BOOKED" || raw === "ATTENDED" || raw === "COMPLETED") return "CONFIRMED";
  return raw || "—";
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

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function FinanceiroPage() {
  const supabase = supabaseBrowser;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [monthCents, setMonthCents] = useState(0);
  const [prevMonthCents, setPrevMonthCents] = useState(0);
  const [ticketAvgCents, setTicketAvgCents] = useState(0);

  const [svcMostSold, setSvcMostSold] = useState<{ name: string; pct: number } | null>(null);
  const [svcMostRevenue, setSvcMostRevenue] = useState<{ name: string; cents: number } | null>(null);

  const [byDow, setByDow] = useState<{ dow: number; cents: number }[]>([]);
  const [byHour, setByHour] = useState<{ hour: number; cents: number }[]>([]);

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
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

        // Carrega marcações (2 meses + buffer)
        const from = new Date(prevMonthStart);
        from.setDate(from.getDate() - 7);

        const { data: apptsRaw, error } = await supabase
          .from("appointments")
          .select("id,start_time,status,status_v2,service_price_cents_snapshot,service_currency_snapshot")
          .eq("owner_id", ownerId)
          .gte("start_time", from.toISOString())
          .lt("start_time", nextMonthStart.toISOString())
          .order("start_time", { ascending: true })
          .limit(2000);

        if (error) throw error;

        const apptsAll = (apptsRaw ?? []) as unknown as ApptRow[];
        const ids = apptsAll.map((a) => a.id).filter(Boolean);

        // Serviços por marcação (para receita real e ranking)
        const svcByAppt: Record<string, SvcRow[]> = {};
        if (ids.length) {
          const chunk = 200;
          for (let i = 0; i < ids.length; i += chunk) {
            const slice = ids.slice(i, i + chunk);
            const { data: svc, error: svcErr } = await supabase
              .from("appointment_services")
              .select("appointment_id,service_name_snapshot,price_cents_snapshot")
              .in("appointment_id", slice)
              .order("created_at", { ascending: true });

            if (svcErr) {
              // Se não existir / RLS, seguimos com snapshots no appointments (sem quebrar a página)
              break;
            }
            (svc ?? []).forEach((r) => {
              const row = r as unknown as SvcRow;
              if (!svcByAppt[row.appointment_id]) svcByAppt[row.appointment_id] = [];
              svcByAppt[row.appointment_id].push(row);
            });
          }
        }

        const isRevenueStatus = (a: ApptRow) => normStatus(a.status, a.status_v2) === "CONFIRMED";

        const apptsThisMonth = apptsAll.filter((a) => {
          const t = new Date(a.start_time).getTime();
          return t >= monthStart.getTime() && t < nextMonthStart.getTime();
        });

        const apptsPrevMonth = apptsAll.filter((a) => {
          const t = new Date(a.start_time).getTime();
          return t >= prevMonthStart.getTime() && t < monthStart.getTime();
        });

        const apptTotalCents = (a: ApptRow) => {
          const svcs = svcByAppt[a.id] || [];
          const sum = svcs.reduce((acc, s) => acc + (Number(s.price_cents_snapshot) || 0), 0);
          if (sum > 0) return sum;
          return Number(a.service_price_cents_snapshot) || 0;
        };

        const sumRevenue = (arr: ApptRow[]) =>
          arr.filter(isRevenueStatus).reduce((acc, a) => acc + apptTotalCents(a), 0);

        const monthSum = sumRevenue(apptsThisMonth);
        const prevSum = sumRevenue(apptsPrevMonth);

        const monthCount = apptsThisMonth.filter(isRevenueStatus).length;
        const tAvg = monthCount ? Math.round(monthSum / monthCount) : 0;

        // Serviços (mês atual)
        const svcCount: Record<string, number> = {};
        const svcRevenue: Record<string, number> = {};

        apptsThisMonth.filter(isRevenueStatus).forEach((a) => {
          const svcs = svcByAppt[a.id] || [];
          if (svcs.length) {
            svcs.forEach((s) => {
              const name = (s.service_name_snapshot || "Serviço").trim();
              svcCount[name] = (svcCount[name] || 0) + 1;
              svcRevenue[name] = (svcRevenue[name] || 0) + (Number(s.price_cents_snapshot) || 0);
            });
          } else {
            const name = "Serviço";
            svcCount[name] = (svcCount[name] || 0) + 1;
            svcRevenue[name] = (svcRevenue[name] || 0) + (Number(a.service_price_cents_snapshot) || 0);
          }
        });

        const totalSvcCount = Object.values(svcCount).reduce((a, b) => a + b, 0) || 1;
        const mostSold = Object.entries(svcCount).sort((a, b) => b[1] - a[1])[0];
        const mostRev = Object.entries(svcRevenue).sort((a, b) => b[1] - a[1])[0];

        // Receita por dia da semana + por horário (mês atual)
        const dowAgg = new Array(7).fill(0);
        const hourAgg = new Array(24).fill(0);

        apptsThisMonth.filter(isRevenueStatus).forEach((a) => {
          const d = new Date(a.start_time);
          const dow = d.getDay(); // 0 dom
          const hour = d.getHours();
          const cents = apptTotalCents(a);
          dowAgg[dow] += cents;
          hourAgg[hour] += cents;
        });

        const dowList = dowAgg.map((cents, dow) => ({ dow, cents })).filter((x) => x.cents > 0);
        const hourList = hourAgg.map((cents, hour) => ({ hour, cents })).filter((x) => x.cents > 0);

        if (!alive) return;

        setMonthCents(monthSum);
        setPrevMonthCents(prevSum);
        setTicketAvgCents(tAvg);

        setSvcMostSold(mostSold ? { name: mostSold[0], pct: (mostSold[1] / totalSvcCount) * 100 } : null);
        setSvcMostRevenue(mostRev ? { name: mostRev[0], cents: mostRev[1] } : null);

        setByDow(dowList);
        setByHour(hourList);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setErr("Não consegui carregar o financeiro.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  const growthPct = useMemo(() => {
    if (!prevMonthCents) return monthCents ? 100 : 0;
    return ((monthCents - prevMonthCents) / prevMonthCents) * 100;
  }, [monthCents, prevMonthCents]);

  const bestDow = useMemo(() => {
    if (!byDow.length) return null;
    return byDow.reduce((best, cur) => (cur.cents > best.cents ? cur : best), byDow[0]);
  }, [byDow]);

  const bestHour = useMemo(() => {
    if (!byHour.length) return null;
    return byHour.reduce((best, cur) => (cur.cents > best.cents ? cur : best), byHour[0]);
  }, [byHour]);

  return (
    <div style={{
      maxWidth: 1250,
      margin: "0 auto",
      padding: "28px 18px 36px",
    }}>
      <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 6 }}>Financeiro</div>
      <h1 style={{ margin: 0, fontSize: 44, letterSpacing: -0.6, lineHeight: 1.05 }}>Financeiro</h1>

      {err && (
        <div style={{
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid rgba(239,68,68,0.35)",
          background: "rgba(239,68,68,0.12)",
        }}>
          {err}
        </div>
      )}

      {/* Top cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 14,
        marginTop: 16,
      }}>
        <div style={{ ...cardStyle(true), padding: 18 }}>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Receita</div>
          <div style={{ fontSize: 34, marginTop: 8, letterSpacing: -0.4 }}>
            {loading ? "—" : eurFromCents(monthCents)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.14)",
              fontSize: 12,
              fontWeight: 700,
            }}>
              ↗ {loading ? "—" : pct(growthPct)}
            </div>
            <div style={{ opacity: 0.65, fontSize: 12 }}>comparado ao mês anterior</div>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Receita Mês Atual</div>
          <div style={{ fontSize: 30, marginTop: 10, letterSpacing: -0.3 }}>
            {loading ? "—" : eurFromCents(monthCents)}
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Receita Mês Anterior</div>
          <div style={{ fontSize: 30, marginTop: 10, letterSpacing: -0.3 }}>
            {loading ? "—" : eurFromCents(prevMonthCents)}
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Ticket Médio</div>
          <div style={{ fontSize: 30, marginTop: 10, letterSpacing: -0.3 }}>
            {loading ? "—" : eurFromCents(ticketAvgCents)}
          </div>
        </div>
      </div>

      {/* Middle */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.25fr 1fr",
        gap: 14,
        marginTop: 14,
      }}>
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2 }}>Serviços</div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}>
            <div style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid var(--card-border)",
              background: "rgba(255,255,255,0.03)",
            }}>
              <div style={{ opacity: 0.75, fontSize: 13 }}>Serviço Mais Vendido</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>
                {loading ? "—" : (svcMostSold?.name || "—")}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
                {loading ? "" : (svcMostSold ? `${pct(svcMostSold.pct)}` : "")}
              </div>
            </div>

            <div style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid var(--card-border)",
              background: "rgba(255,255,255,0.03)",
            }}>
              <div style={{ opacity: 0.75, fontSize: 13 }}>Serviço que Mais Gerou Receita</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>
                {loading ? "—" : (svcMostRevenue?.name || "—")}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
                {loading ? "" : (svcMostRevenue ? eurFromCents(svcMostRevenue.cents) : "")}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2 }}>Análise</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>Receita por Dia da Semana</div>

          <div style={{ marginTop: 10 }}>
            {loading && <div style={{ opacity: 0.7 }}>Carregando…</div>}
            {!loading && !byDow.length && <div style={{ opacity: 0.7 }}>Sem dados no mês atual.</div>}

            {!loading && byDow.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {byDow
                  .slice()
                  .sort((a, b) => {
                    // manter Seg..Dom
                    const order = (d: number) => (d === 0 ? 7 : d);
                    return order(a.dow) - order(b.dow);
                  })
                  .map((r) => {
                    const isBest = bestDow && r.dow === bestDow.dow;
                    return (
                      <div key={r.dow} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid var(--card-border)",
                        background: "rgba(255,255,255,0.03)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 44, opacity: 0.9 }}>{DOW[r.dow]}</div>
                          {isBest && (
                            <div style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 9px",
                              borderRadius: 999,
                              border: "1px solid rgba(212,175,55,0.45)",
                              background: "rgba(212,175,55,0.16)",
                            }}>
                              Mais lucrativo
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 800 }}>{eurFromCents(r.cents)}</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.2 }}>Análise</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>Receita por Dia da Semana</div>

          <div style={{ marginTop: 10 }}>
            {!loading && !byDow.length && <div style={{ opacity: 0.7 }}>Sem dados.</div>}
            {!loading && byDow.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {byDow
                  .slice()
                  .sort((a, b) => {
                    const order = (d: number) => (d === 0 ? 7 : d);
                    return order(a.dow) - order(b.dow);
                  })
                  .map((r) => (
                    <div key={r.dow} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid var(--card-border)",
                      background: "rgba(255,255,255,0.03)",
                    }}>
                      <div style={{ opacity: 0.9 }}>{DOW[r.dow]}</div>
                      <div style={{ fontWeight: 800 }}>{eurFromCents(r.cents)}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.2 }}>Análise</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>Receita por Horário</div>

          <div style={{ marginTop: 10 }}>
            {!loading && !byHour.length && <div style={{ opacity: 0.7 }}>Sem dados.</div>}
            {!loading && byHour.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {byHour
                  .slice()
                  .sort((a, b) => a.hour - b.hour)
                  .map((r) => {
                    const isBest = bestHour && r.hour === bestHour.hour;
                    return (
                      <div key={r.hour} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid var(--card-border)",
                        background: "rgba(255,255,255,0.03)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 56, opacity: 0.9 }}>{String(r.hour).padStart(2, "0")}:00</div>
                          {isBest && (
                            <div style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 9px",
                              borderRadius: 999,
                              border: "1px solid rgba(212,175,55,0.45)",
                              background: "rgba(212,175,55,0.16)",
                            }}>
                              Pico
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 800 }}>{eurFromCents(r.cents)}</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, opacity: 0.55, fontSize: 12 }}>
        * Receita considera apenas marcações confirmadas no mês atual.
      </div>
    </div>
  );
}
