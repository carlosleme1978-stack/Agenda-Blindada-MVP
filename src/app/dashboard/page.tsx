export const dynamic = "force-dynamic";
export const revalidate = false;

import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import { createSupabaseServer } from "@/lib/supabase/server";

function ymdLisbon(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function startOfDayLisbonISO(d: Date) {
  const x = new Date(`${ymdLisbon(d)}T00:00:00`);
  return x.toISOString();
}
function endOfDayLisbonISO(d: Date) {
  const x = new Date(`${ymdLisbon(d)}T23:59:59.999`);
  return x.toISOString();
}

function startOfMonthLisbonISO(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const x = new Date(`${y}-${m}-01T00:00:00`);
  return x.toISOString();
}
function startOfPrevMonthLisbonISO(d: Date) {
  const y = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(d));
  const m = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", month: "2-digit" }).format(d));
  const pm = m - 1 <= 0 ? 12 : m - 1;
  const py = m - 1 <= 0 ? y - 1 : y;
  const x = new Date(`${String(py).padStart(4,"0")}-${String(pm).padStart(2,"0")}-01T00:00:00`);
  return x.toISOString();
}
function endOfPrevMonthLisbonISO(d: Date) {
  const y = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric" }).format(d));
  const m = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", month: "2-digit" }).format(d));
  const pm = m - 1 <= 0 ? 12 : m - 1;
  const py = m - 1 <= 0 ? y - 1 : y;
  const nextm = pm + 1;
  const nexty = nextm > 12 ? py + 1 : py;
  const nm = nextm > 12 ? 1 : nextm;
  const firstNext = new Date(`${String(nexty).padStart(4,"0")}-${String(nm).padStart(2,"0")}-01T00:00:00`);
  const last = new Date(firstNext.getTime() - 1);
  return last.toISOString();
}

export default async function Page() {
  const sb = await createSupabaseServer();

  const { data: sessRes } = await sb.auth.getSession();
  const uid = sessRes.session?.user?.id;
  if (!uid) redirect("/login");

  const ownerId = uid;

  // Date windows
  const now = new Date();
  const startToday = startOfDayLisbonISO(now);
  const endToday = endOfDayLisbonISO(now);
  const startWeek = startOfDayLisbonISO(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const start28 = startOfDayLisbonISO(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
  const start180 = startOfDayLisbonISO(new Date(now.getTime() - 179 * 24 * 60 * 60 * 1000));
  const startMonth = startOfMonthLisbonISO(now);
  const startPrevMonth = startOfPrevMonthLisbonISO(now);
  const endPrevMonth = endOfPrevMonthLisbonISO(now);


  const baseSelect = "id,status_v2,status,start_time,end_time,customer_id,service_price_cents_snapshot,is_no_show";

  const [{ data: todayRows }, { data: weekRows }, { data: rows28 }, { data: ap180 }, { data: monthRows }, { data: prevMonthRows }, { data: customersRows }] = await Promise.all([
    sb.from("appointments").select(baseSelect).eq("owner_id", ownerId).gte("start_time", startToday).lte("start_time", endToday),
    sb.from("appointments").select(baseSelect).eq("owner_id", ownerId).gte("start_time", startWeek).lte("start_time", endToday),
    sb.from("appointments").select("id,status_v2,status,start_time").eq("owner_id", ownerId).gte("start_time", start28).lte("start_time", endToday),
    sb.from("appointments").select("customer_id,start_time,status_v2,status").eq("owner_id", ownerId).gte("start_time", start180).lte("start_time", endToday).limit(8000),
    sb.from("appointments").select("id,status_v2,status,start_time,customer_id,customer_name_snapshot,service_price_cents_snapshot,is_no_show").eq("owner_id", ownerId).gte("start_time", startMonth).lte("start_time", endToday),
    sb.from("appointments").select("id,status_v2,status,start_time,customer_id,customer_name_snapshot,service_price_cents_snapshot,is_no_show").eq("owner_id", ownerId).gte("start_time", startPrevMonth).lte("start_time", endPrevMonth),
    sb.from("customers").select("id,name,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(2000),
  ]);

  const today = (todayRows ?? []) as any[];
  const week = (weekRows ?? []) as any[];

  const ACTIVE_V2 = new Set(["PENDING", "CONFIRMED"]);
  const ACTIVE_LEG = new Set(["BOOKED", "PENDING", "CONFIRMED"]);
  const REV_V2 = new Set(["PENDING", "CONFIRMED", "ATTENDED", "COMPLETED"]);
  const REV_LEG = new Set(["BOOKED", "CONFIRMED", "COMPLETED"]);

  const isActive = (r: any) => (r.status_v2 && ACTIVE_V2.has(String(r.status_v2))) || (r.status && ACTIVE_LEG.has(String(r.status)));
  const isRevenue = (r: any) => (r.status_v2 && REV_V2.has(String(r.status_v2))) || (r.status && REV_LEG.has(String(r.status)));

  const todayCount = today.filter(isActive).length;
  const weekCount = week.filter(isActive).length;

  const todayRevenueCents = today.filter(isRevenue).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);
  const weekRevenueCents = week.filter(isRevenue).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);

  const cancelWeek = week.filter((r) => String(r.status_v2 ?? r.status) === "CANCELLED").length;

  const metrics = { todayCount, weekCount, todayRevenueCents, weekRevenueCents, cancelWeek };

  // Heatmap 28d
  const buckets: Record<string, number> = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
  const mapDow = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (const r of (rows28 ?? []) as any[]) {
    const st = new Date(String(r.start_time));
    const key = mapDow[st.getDay()];
    if (!key) continue;
    if (String(r.status_v2 ?? r.status) === "CANCELLED") continue;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  const heatmap = Object.entries(buckets).map(([day, count]) => ({ day, count }));

  // Radar: inativos + risco + dia fraco
  const appts = (ap180 ?? []) as any[];
  const lastByCustomer = new Map<string, Date>();
  const futureByCustomer = new Map<string, boolean>();
  const cutoffInactive = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const a of appts) {
    const cust = String(a.customer_id ?? "");
    if (!cust) continue;
    const st = new Date(String(a.start_time));
    const status = String(a.status_v2 ?? a.status);
    if (status !== "CANCELLED" && status !== "NO_SHOW") {
      const last = lastByCustomer.get(cust);
      if (!last || st > last) lastByCustomer.set(cust, st);
    }
    if (st > now && (status === "PENDING" || status === "CONFIRMED" || status === "BOOKED")) futureByCustomer.set(cust, true);
  }

  let inactive = 0;
  for (const [cust, last] of lastByCustomer.entries()) {
    if (last < cutoffInactive && !futureByCustomer.get(cust)) inactive++;
  }

  const cancelsByCustomer = new Map<string, number>();
  for (const a of appts) {
    const cust = String(a.customer_id ?? "");
    if (!cust) continue;
    const status = String(a.status_v2 ?? a.status);
    if (status === "CANCELLED" || status === "NO_SHOW") {
      cancelsByCustomer.set(cust, (cancelsByCustomer.get(cust) ?? 0) + 1);
    }
  }
  const risky = Array.from(cancelsByCustomer.values()).filter((n) => n >= 2).length;

  const minDay = heatmap.reduce((acc, x) => (x.count < acc.count ? x : acc), heatmap[0] ?? { day: "—", count: 0 });

  const radar = [
    { label: "Clientes inativos (+30d)", value: String(inactive), tone: inactive >= 10 ? "danger" : inactive >= 5 ? "warn" : "ok", href: "/dashboard/crm" },
    { label: "Risco (cancel/no-show)", value: String(risky), tone: risky >= 6 ? "danger" : risky >= 3 ? "warn" : "ok", href: "/dashboard/crm?tab=risk" },
    { label: "Dia mais fraco (28d)", value: `${minDay.day} (${minDay.count})`, tone: minDay.count <= 2 ? "warn" : "info" },
    { label: "Meta da semana", value: "Defina em Settings", tone: "info", href: "/dashboard/settings" },
  ] as const;

  const companyFin = {
    company_id: ownerId,
    revenue_realized_cents: weekRevenueCents,
    revenue_expected_cents: todayRevenueCents,
    revenue_lost_cents: 0,
    total_no_show: week.filter((r) => String(r.status_v2 ?? r.status) === "NO_SHOW").length,
    total_completed: week.filter((r) => String(r.status_v2 ?? r.status) === "COMPLETED" || String(r.status_v2 ?? r.status) === "ATTENDED").length,
  } as any;


  // DASHBOARD (premium minimal) - aggregates (month + prev month)
  const month = (monthRows ?? []) as any[];
  const prevMonth = (prevMonthRows ?? []) as any[];

  const monthRevenueCents = month.filter(isRevenue).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);
  const prevMonthRevenueCents = prevMonth.filter(isRevenue).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);

  const monthRevenueCount = month.filter(isRevenue).length;
  const ticketAvgCents = monthRevenueCount ? Math.round(monthRevenueCents / monthRevenueCount) : 0;

  const monthNoShowCount = month.filter((r) => Boolean(r.is_no_show) || String(r.status_v2 ?? r.status) === "NO_SHOW").length;
  const monthActiveCount = month.filter((r) => String(r.status_v2 ?? r.status) !== "CANCELLED").length;
  const noShowRatePct = monthActiveCount ? Math.round((monthNoShowCount / monthActiveCount) * 1000) / 10 : 0;

  const growthPct = prevMonthRevenueCents > 0 ? Math.round(((monthRevenueCents - prevMonthRevenueCents) / prevMonthRevenueCents) * 1000) / 10 : null;

  // Top clients (by month revenue)
  const topMap = new Map<string, { name: string; revenue: number; visits: number }>();
  for (const r of month) {
    if (!isRevenue(r)) continue;
    const name = String(r.customer_name_snapshot ?? "Cliente").trim() || "Cliente";
    const row = topMap.get(name) ?? { name, revenue: 0, visits: 0 };
    row.revenue += Number(r.service_price_cents_snapshot ?? 0);
    row.visits += 1;
    topMap.set(name, row);
  }
  const topClients = Array.from(topMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

  // No-shows (top offenders - 180d)
  const nsMap = new Map<string, { name: string; count: number }>();
  for (const r of appts) {
    const st = new Date(String(r.start_time));
    if (st < cutoffInactive) continue; // last 30d for "recent offenders" feel
    const isNs = String(r.status_v2 ?? r.status) === "NO_SHOW";
    if (!isNs) continue;
    const name = String((r as any).customer_name_snapshot ?? "Cliente").trim() || "Cliente";
    const row = nsMap.get(name) ?? { name, count: 0 };
    row.count += 1;
    nsMap.set(name, row);
  }
  const topNoShows = Array.from(nsMap.values()).sort((a, b) => b.count - a.count).slice(0, 3);

  // Insights bullets (simple + direct)
  const dowCounts = new Array(7).fill(0);
  const mapDowPt = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  for (const r of month) {
    const st = new Date(String(r.start_time));
    if (String(r.status_v2 ?? r.status) === "CANCELLED") continue;
    dowCounts[st.getDay()] += 1;
  }
  let weakDow = 0;
  let weakVal = Infinity;
  for (let i = 0; i < 7; i++) {
    if (dowCounts[i] < weakVal) {
      weakVal = dowCounts[i];
      weakDow = i;
    }
  }
  const avgDow = dowCounts.reduce((a, v) => a + v, 0) / 7;
  const weakPct = avgDow > 0 ? Math.round((1 - (weakVal || 0) / avgDow) * 100) : null;

  // Inactive clients (30d) from customers table + last appointment map we already built
  const customers = (customersRows ?? []) as any[];
  const inactiveNames: string[] = [];
  for (const c of customers) {
    const cid = String(c.id ?? "");
    if (!cid) continue;
    const last = lastByCustomer.get(cid);
    if (last && last < cutoffInactive && !futureByCustomer.get(cid)) {
      inactiveNames.push(String(c.name ?? "Cliente"));
    }
    if (inactiveNames.length >= 2) break;
  }
  const insights = [
    weakPct === null ? `${mapDowPt[weakDow]} é seu dia mais fraco` : `${mapDowPt[weakDow]} é seu dia mais fraco (${weakPct}% ocupação abaixo da média)`,
    inactiveNames.length ? `${inactiveNames.length} clientes inativos (não retornam há 30+ dias)` : `Nenhum cliente inativo (30+ dias)`,
    monthNoShowCount ? `Você perdeu ${((monthNoShowCount * ticketAvgCents) / 100).toFixed(2)}€ em no-shows este mês (estimativa)` : `Sem perdas por no-show este mês`,
  ];

  const dashboardV1 = {
    monthRevenueCents,
    growthPct,
    noShowRatePct,
    ticketAvgCents,
    topClients,
    topNoShows,
    insights,
  };

  const initialData = {
    companyId: ownerId,
    company: null,
    staff: [],
    metrics,
    dashboardV1,
    heatmap,
    radar: radar as any,
    topStaff: null,
    companyFin,
    staffFin: [],
    staffOcc: [],
    topService: null,
    bestWeekday: null,
    emptiestHour: null,
  };

  return <DashboardClient initial={initialData as any} />;
}
