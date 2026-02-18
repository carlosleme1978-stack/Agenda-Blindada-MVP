"use client";

import Link from "next/link";

function fmtEUR(cents: number) {
  const eur = (Number(cents || 0) / 100) || 0;
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(eur);
  } catch {
    return `€ ${eur.toFixed(2)}`;
  }
}

type Initial = {
  dashboardV1?: {
    monthRevenueCents: number;
    growthPct: number | null;
    noShowRatePct: number;
    ticketAvgCents: number;
    topClients: { name: string; revenue: number; visits: number }[];
    topNoShows: { name: string; count: number }[];
    insights: string[];
  };
};

export default function DashboardClient({ initial }: { initial: Initial }) {
  const v = initial.dashboardV1;

  // fallback (should not happen)
  if (!v) {
    return (
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 22px", color: "white" }}>
        <div style={{ fontSize: 54, fontWeight: 950, letterSpacing: -0.8 }}>Dashboard</div>
        <div style={{ opacity: 0.7, marginTop: 10 }}>Sem dados.</div>
      </div>
    );
  }

  const border = "rgba(255,255,255,0.10)";
  const cardBg = "rgba(255,255,255,0.06)";
  const cardBg2 = "rgba(255,255,255,0.045)";
  const dim = "rgba(255,255,255,0.60)";
  const gold = "rgba(234,179,8,0.85)";

  const card = {
    borderRadius: 18,
    border: `1px solid ${border}`,
    background: cardBg,
    padding: 18,
  } as const;

  const statTitle = { fontSize: 12, opacity: 0.65, fontWeight: 900, letterSpacing: 0.2 } as const;
  const statValue = { fontSize: 24, fontWeight: 950, letterSpacing: -0.4, marginTop: 6 } as const;

  const chip = (tone: "up" | "warn") =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 950,
      border: `1px solid ${tone === "up" ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.35)"}`,
      background: tone === "up" ? "rgba(6,78,59,0.35)" : "rgba(120,53,15,0.35)",
      color: "white",
      marginTop: 10,
      width: "fit-content",
    } as const);

  const smallBtn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(234,179,8,0.30)",
    background: "rgba(234,179,8,0.06)",
    color: "rgba(234,179,8,0.95)",
    fontWeight: 950,
    cursor: "pointer",
    textDecoration: "none",
  } as const;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 22px" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 10 }}>Dashboard</div>
        <div style={{ fontSize: 54, fontWeight: 950, letterSpacing: -0.8 }}>Dashboard</div>
      </div>

      {/* TOP STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <div style={card}>
          <div style={statTitle}>Receita do mês</div>
          <div style={statValue}>{fmtEUR(v.monthRevenueCents)}</div>
        </div>

        <div style={card}>
          <div style={statTitle}>Crescimento</div>
          <div style={statValue}>{v.growthPct === null ? "—" : `${v.growthPct}%`}</div>
          {v.growthPct !== null ? <div style={chip(v.growthPct >= 0 ? "up" : "warn")}>{v.growthPct >= 0 ? "↗" : "↘"} {Math.abs(v.growthPct)}%</div> : <div style={{ marginTop: 10, fontSize: 12, color: dim }}>Comparado ao mês anterior</div>}
        </div>

        <div style={card}>
          <div style={statTitle}>No-show rate</div>
          <div style={statValue}>{v.noShowRatePct}%</div>
          <div style={{ marginTop: 10, fontSize: 12, color: dim }}>No-shows / total do mês</div>
        </div>

        <div style={card}>
          <div style={statTitle}>Ticket médio</div>
          <div style={statValue}>{fmtEUR(v.ticketAvgCents)}</div>
        </div>
      </div>

      {/* SECOND ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${border}` }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Top Clientes</div>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {v.topClients.length ? (
              v.topClients.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: dim }}>{c.visits} visitas</div>
                  </div>
                  <div style={{ fontWeight: 950, color: "white" }}>{fmtEUR(c.revenue)}</div>
                </div>
              ))
            ) : (
              <div style={{ color: dim, fontSize: 13 }}>Sem dados este mês.</div>
            )}
          </div>
        </div>

        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${border}` }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>No-Shows</div>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {v.topNoShows.length ? (
              v.topNoShows.map((n, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 950, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.name}</div>
                  <div style={{ fontSize: 13, color: dim }}>{n.count} faltas</div>
                </div>
              ))
            ) : (
              <div style={{ color: dim, fontSize: 13 }}>Sem no-shows recentes.</div>
            )}
          </div>
        </div>

        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${border}` }}>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Insights</div>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {(v.insights ?? []).map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 7, height: 7, borderRadius: 999, background: gold, marginTop: 7, flex: "0 0 auto" }} />
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.86)", lineHeight: 1.35 }}>{t}</div>
              </div>
            ))}

            <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/dashboard/insights" style={smallBtn}>
                Ver Insights
              </Link>
              <Link href="/dashboard/crm" style={{ ...smallBtn, border: "1px solid rgba(255,255,255,0.14)", background: cardBg2, color: "rgba(255,255,255,0.86)" }}>
                Ver Clientes
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
