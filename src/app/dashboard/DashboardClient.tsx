"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CompanyRow = {
  id: string;
  plan: string | null;
  sub_pro_status: string | null;
  sub_basic_status: string | null;
};

type RadarItem = { label: string; value: string; tone: "ok" | "warn" | "danger" | "info"; href?: string };

type CompanyFinancialRow = {
  company_id: string;
  revenue_realized_cents: number | null;
  revenue_expected_cents: number | null;
  revenue_lost_cents: number | null;
  total_no_show: number | null;
  total_completed: number | null;
};

type TopServiceRow = { service_id: string; service_name: string; revenue_cents: number | null; total_completed: number | null };

type WeekdayRow = { weekday: number | null; revenue_cents: number | null; total_completed: number | null };

type HourRow = { hour: number | null; total_completed: number | null };

export type DashboardInitialData = {
  companyId: string;
  company: CompanyRow | null;
  metrics: {
    todayCount: number;
    weekCount: number;
    todayRevenueCents: number;
    weekRevenueCents: number;
    cancelWeek: number;
    noShowWeek: number;
  };
  heatmap: { day: string; count: number }[];
  radar: RadarItem[];
  companyFin: CompanyFinancialRow | null;
  topService: TopServiceRow | null;
  bestWeekday: WeekdayRow | null;
  emptiestHour: HourRow | null;
};

function eurFromCents(cents: number | null | undefined) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `${v} €`;
}

function weekdayPt(weekday: number | null | undefined) {
  const map = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const w = Number(weekday);
  return Number.isFinite(w) ? map[w] ?? "—" : "—";
}

export default function DashboardClient({ initial }: { initial: DashboardInitialData }) {
  const [company] = useState<CompanyRow | null>(initial.company ?? null);
  const [metrics] = useState(initial.metrics);
  const [radar] = useState<RadarItem[]>(initial.radar ?? []);
  const [heatmap] = useState<{ day: string; count: number }[]>(initial.heatmap ?? []);

  const companyFin = initial.companyFin;

  const isPro = (company?.plan ?? "basic") === "pro" && (company?.sub_pro_status ?? "active") === "active";

  const financeCards = useMemo(() => {
    return [
      { label: "Receita realizada", value: eurFromCents(companyFin?.revenue_realized_cents) },
      { label: "Receita prevista", value: eurFromCents(companyFin?.revenue_expected_cents) },
      { label: "Receita perdida", value: eurFromCents(companyFin?.revenue_lost_cents) },
      { label: "No-show", value: String(Number(companyFin?.total_no_show ?? 0)) },
    ];
  }, [companyFin]);

  const quick = useMemo(() => {
    return [
      { label: "Hoje", value: String(metrics.todayCount) },
      { label: "Semana", value: String(metrics.weekCount) },
      { label: "Receita hoje", value: eurFromCents(metrics.todayRevenueCents) },
      { label: "Receita 7d", value: eurFromCents(metrics.weekRevenueCents) },
      { label: "Cancel. 7d", value: String(metrics.cancelWeek) },
      { label: "No-show 7d", value: String(metrics.noShowWeek) },
    ];
  }, [metrics]);

  const insights = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (initial.topService) items.push({ label: "Serviço mais lucrativo", value: `${initial.topService.service_name} • ${eurFromCents(initial.topService.revenue_cents)}` });
    if (initial.bestWeekday) items.push({ label: "Melhor dia", value: `${weekdayPt(initial.bestWeekday.weekday)} • ${eurFromCents(initial.bestWeekday.revenue_cents)}` });
    if (initial.emptiestHour) items.push({ label: "Hora mais vazia", value: `${String(initial.emptiestHour.hour ?? "—")}h • ${Number(initial.emptiestHour.total_completed ?? 0)} atend.` });
    return items;
  }, [initial.topService, initial.bestWeekday, initial.emptiestHour]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background:
          "radial-gradient(1200px 800px at 20% 20%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(900px 700px at 80% 30%, rgba(236,72,153,0.14), transparent 55%), radial-gradient(900px 700px at 55% 85%, rgba(16,185,129,0.12), transparent 55%), linear-gradient(180deg, #0b1220 0%, #0f172a 60%, #0b1220 100%)",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 22,
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "white",
            boxShadow: "0 26px 60px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Command Center</div>
              <div style={{ marginTop: 2, fontSize: 24, fontWeight: 950, letterSpacing: -0.7 }}>Agenda Blindada</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78, fontWeight: 700 }}>{isPro ? "PRO ativo" : "BASIC"} • Modelo SOLO</div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link
                href="/dashboard/new"
                style={{
                  textDecoration: "none",
                  fontWeight: 950,
                  color: "white",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "linear-gradient(90deg, rgba(16,185,129,0.55), rgba(59,130,246,0.55))",
                }}
              >
                Nova marcação
              </Link>
              <Link href="/dashboard/agenda" style={{ textDecoration: "none", fontWeight: 900, color: "white", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.20)" }}>
                Ver agenda
              </Link>
              <Link href="/dashboard/crm" style={{ textDecoration: "none", fontWeight: 900, color: "white", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.20)" }}>
                CRM
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {financeCards.map((c) => (
              <div key={c.label} style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.18)" }}>
                <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>{c.label}</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {radar.map((r) => {
              const box = (
                <div style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.14)" }}>
                  <div style={{ fontSize: 12, opacity: 0.78, fontWeight: 900 }}>{r.label}</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{r.value}</div>
                </div>
              );
              return r.href ? (
                <Link key={r.label} href={r.href} style={{ textDecoration: "none", color: "white" }}>
                  {box}
                </Link>
              ) : (
                <div key={r.label}>{box}</div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.35fr 0.65fr", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 20, background: "rgba(255,255,255,0.88)", border: "1px solid rgba(2,6,23,0.10)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 950 }}>Métricas</div>
            <div style={{ marginTop: 2, fontSize: 18, fontWeight: 950 }}>Resumo rápido</div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {quick.map((q) => (
                <div key={q.label} style={{ padding: 12, borderRadius: 16, background: "rgba(2,6,23,0.04)", border: "1px solid rgba(2,6,23,0.06)" }}>
                  <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>{q.label}</div>
                  <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{q.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 16, background: "rgba(2,6,23,0.04)", border: "1px solid rgba(2,6,23,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>Insights</div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {insights.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>—</div> : null}
                  {insights.map((i) => (
                    <div key={i.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>{i.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 950 }}>{i.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 16, background: "rgba(2,6,23,0.04)", border: "1px solid rgba(2,6,23,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>Atalhos</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <Link href="/dashboard/new" style={{ textDecoration: "none", fontWeight: 950 }}>
                    ➜ Criar marcação
                  </Link>
                  <Link href="/dashboard/agenda" style={{ textDecoration: "none", fontWeight: 950 }}>
                    ➜ Ver agenda
                  </Link>
                  <Link href="/dashboard/crm" style={{ textDecoration: "none", fontWeight: 950 }}>
                    ➜ Ver CRM
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 20, background: "rgba(255,255,255,0.88)", border: "1px solid rgba(2,6,23,0.10)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 950 }}>Heatmap (28 dias)</div>
            <div style={{ marginTop: 2, fontSize: 18, fontWeight: 950 }}>Força por dia</div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {heatmap.map((h) => (
                <div key={h.day} style={{ display: "grid", gridTemplateColumns: "48px 1fr 30px", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 900, opacity: 0.85 }}>{h.day}</div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(2,6,23,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (h.count / Math.max(1, Math.max(...heatmap.map((x) => x.count)))) * 100)}%`, background: "rgba(99,102,241,0.75)" }} />
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 950 }}>{h.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.7, color: "white", textAlign: "center", fontWeight: 800, fontSize: 12 }}>
          © 2026 Agenda Blindada.
        </div>
      </div>
    </main>
  );
}
