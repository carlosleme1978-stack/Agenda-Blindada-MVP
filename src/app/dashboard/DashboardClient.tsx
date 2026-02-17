"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type StaffRow = { id: string; name: string | null; active: boolean | null };
type CompanyRow = {
  id: string;
  plan: "basic" | "pro" | null;
  staff_limit: number | null;
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

type StaffFinancialRow = {
  company_id: string;
  staff_id: string;
  revenue_cents: number | null;
  total_completed: number | null;
  total_no_show: number | null;
  avg_ticket_cents: number | null;
};

type StaffOccupancyRow = {
  company_id: string;
  staff_id: string;
  booked_minutes: number | null;
  available_minutes: number | null;
  occupancy_pct: number | null;
};

type TopServiceRow = { service_id: string; service_name: string; revenue_cents: number | null; total_completed: number | null };
type WeekdayRow = { weekday: number | null; revenue_cents: number | null; total_completed: number | null };
type HourRow = { hour: number | null; total_completed: number | null };

export type DashboardInitialData = {
  companyId: string;
  company: CompanyRow | null;
  staff: StaffRow[];
  metrics: {
    todayCount: number;
    weekCount: number;
    todayRevenueCents: number;
    weekRevenueCents: number;
    cancelWeek: number;
  };
  heatmap: { day: string; count: number }[];
  radar: RadarItem[];
  topStaff: { staff_id: string; name: string; revenueCents: number } | null;

  companyFin: CompanyFinancialRow | null;
  staffFin: StaffFinancialRow[];
  staffOcc: StaffOccupancyRow[];
  topService: TopServiceRow | null;
  bestWeekday: WeekdayRow | null;
  emptiestHour: HourRow | null;
};

function eurFromCents(cents: number | null | undefined) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `${v} €`;
}

function weekdayPtBr(weekday: number | null | undefined) {
  const map = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const w = Number(weekday);
  return Number.isFinite(w) ? map[w] ?? "—" : "—";
}

function clampPct(x: number | null | undefined) {
  const v = Number(x ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export default function DashboardClient({ initial }: { initial: DashboardInitialData }) {
  // Tudo chega do Server Component (blindagem): sem fetch no browser.
  const [loading] = useState(false);

  const [company] = useState<CompanyRow | null>(initial.company ?? null);
  const [companyId] = useState<string | null>(initial.companyId ?? null);

  const [staff] = useState<StaffRow[]>(initial.staff ?? []);
  const [radar] = useState<RadarItem[]>(initial.radar ?? []);
  const [metrics] = useState(initial.metrics);

  const [heatmap] = useState<{ day: string; count: number }[]>(initial.heatmap ?? []);
  const [topStaff] = useState<{ staff_id: string; name: string; revenueCents: number } | null>(initial.topStaff ?? null);

  const companyFin = initial.companyFin;
  const staffFin = initial.staffFin ?? [];
  const staffOcc = initial.staffOcc ?? [];

  const isPro = (company?.plan ?? "basic") === "pro" && (company?.sub_pro_status ?? "active") === "active";

  const staffPerf = useMemo(() => {
    const nameById = new Map(staff.map((s) => [String(s.id), String(s.name ?? "—")]));
    const occById = new Map(staffOcc.map((o) => [String(o.staff_id), o]));
    return staffFin
      .map((r) => {
        const occ = occById.get(String(r.staff_id));
        return {
          staff_id: String(r.staff_id),
          name: nameById.get(String(r.staff_id)) ?? String(r.staff_id),
          revenue_cents: Number(r.revenue_cents ?? 0),
          avg_ticket_cents: Number(r.avg_ticket_cents ?? 0),
          total_no_show: Number(r.total_no_show ?? 0),
          occupancy_pct: clampPct(occ?.occupancy_pct ?? (occ && occ.available_minutes ? (Number(occ.booked_minutes ?? 0) / Number(occ.available_minutes ?? 1)) * 100 : 0)),
        };
      })
      .sort((a, b) => b.revenue_cents - a.revenue_cents)
      .slice(0, 6);
  }, [staff, staffFin, staffOcc]);

  const insights = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (initial.topService) items.push({ label: "Serviço mais lucrativo", value: `${initial.topService.service_name} • ${eurFromCents(initial.topService.revenue_cents)}` });
    if (initial.bestWeekday) items.push({ label: "Melhor dia", value: `${weekdayPtBr(initial.bestWeekday.weekday)} • ${eurFromCents(initial.bestWeekday.revenue_cents)}` });
    if (initial.emptiestHour) items.push({ label: "Hora mais vazia", value: `${String(initial.emptiestHour.hour ?? "—")}h • ${Number(initial.emptiestHour.total_completed ?? 0)} atend.` });
    return items;
  }, [initial.topService, initial.bestWeekday, initial.emptiestHour]);

  const financeCards = useMemo(() => {
    return [
      { label: "Receita realizada", value: eurFromCents(companyFin?.revenue_realized_cents), tone: "ok" as const },
      { label: "Receita prevista", value: eurFromCents(companyFin?.revenue_expected_cents), tone: "info" as const },
      { label: "Receita perdida", value: eurFromCents(companyFin?.revenue_lost_cents), tone: Number(companyFin?.revenue_lost_cents ?? 0) > 0 ? ("warn" as const) : ("ok" as const) },
      { label: "No-show", value: String(Number(companyFin?.total_no_show ?? 0)), tone: Number(companyFin?.total_no_show ?? 0) > 0 ? ("warn" as const) : ("ok" as const) },
    ];
  }, [companyFin]);

  return (
    <main style={{ minHeight: "100vh", padding: 18, background: "linear-gradient(120deg, #0b1220 0%, #0b1220 45%, #0f172a 100%)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(59,130,246,0.15) 45%, rgba(16,185,129,0.10) 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Command Center</div>
              <div style={{ marginTop: 2, fontSize: 22, fontWeight: 950, letterSpacing: -0.6 }}>Agenda Blindada</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 700 }}>
                {isPro ? "PRO ativo • Inteligência ligada" : "BASIC • Ative o PRO para liberar inteligência total"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/dashboard/agenda" style={{ textDecoration: "none", fontWeight: 900, color: "white", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.20)" }}>
                Abrir Agenda
              </Link>
              <Link href="/dashboard/crm" style={{ textDecoration: "none", fontWeight: 900, color: "white", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.20)" }}>
                CRM
              </Link>
              <Link href="/dashboard/staff" style={{ textDecoration: "none", fontWeight: 900, color: "white", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.20)" }}>
                Staff
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {financeCards.map((c) => (
              <div
                key={c.label}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.20)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{c.label}</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {radar.map((r) => {
              const box = (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.14)",
                  }}
                >
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

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 12 }}>
          <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.92)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Métricas</div>
                <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.3 }}>Resumo rápido</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{companyId ? `Empresa: ${companyId.slice(0, 8)}…` : "—"}</div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Hoje</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : metrics.todayCount}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Semana</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : metrics.weekCount}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Receita hoje</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : eurFromCents(metrics.todayRevenueCents)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Receita 7d</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : eurFromCents(metrics.weekRevenueCents)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Cancel. 7d</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{loading ? "…" : metrics.cancelWeek}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Insights</div>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  {insights.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>—</div> : null}
                  {insights.map((it) => (
                    <div key={it.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{it.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 900 }}>{it.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.08)", background: "rgba(2,6,23,0.02)" }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Top staff (6)</div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {staffPerf.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>—</div> : null}
                  {staffPerf.map((s) => (
                    <div key={s.staff_id} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.7fr 0.6fr 0.6fr", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 900 }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 900 }}>{eurFromCents(s.revenue_cents)}</span>
                      <span style={{ fontSize: 12, opacity: 0.85 }}>Ticket {eurFromCents(s.avg_ticket_cents)}</span>
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{Math.round(s.occupancy_pct)}% occ.</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/dashboard/agenda" style={{ textDecoration: "none", fontWeight: 900 }}>
                Abrir agenda empresa →
              </Link>
              <span style={{ opacity: 0.35 }}>•</span>
              <Link href="/dashboard/crm" style={{ textDecoration: "none", fontWeight: 900 }}>
                Ver CRM →
              </Link>
            </div>
          </div>

          <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.92)", padding: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Heatmap (28 dias)</div>
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 950, letterSpacing: -0.3 }}>Força por dia</div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {heatmap.map((d) => {
                const max = Math.max(1, ...heatmap.map((x) => x.count));
                const pct = Math.round((d.count / max) * 100);
                return (
                  <div key={d.day} style={{ display: "grid", gridTemplateColumns: "46px 1fr 44px", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{d.day}</div>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(2,6,23,0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "rgba(59,130,246,0.55)" }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, textAlign: "right" }}>{d.count}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
              {topStaff ? (
                <>
                  <span style={{ fontWeight: 900 }}>Destaque:</span> {topStaff.name} • {eurFromCents(topStaff.revenueCents)} (7d)
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, opacity: 0.6, color: "white" }}>
          © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}.
        </div>
      </div>
    </main>
  );
}
