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
  const ymd = ymdLisbon(d);
  const x = new Date(`${ymd}T00:00:00`);
  return x.toISOString();
}
function endOfDayLisbonISO(d: Date) {
  const ymd = ymdLisbon(d);
  const x = new Date(`${ymd}T23:59:59.999`);
  return x.toISOString();
}

export default async function Page() {
  const sb = await createSupabaseServer();

  const { data: sessRes } = await sb.auth.getSession();
  const uid = sessRes.session?.user?.id;
  if (!uid) redirect("/login");

  const { data: prof } = await sb.from("profiles").select("company_id").eq("id", uid).maybeSingle();
  const cid = prof?.company_id ? String(prof.company_id) : null;
  if (!cid) redirect("/login");

  const { data: company } = await sb
    .from("companies")
    .select("id,plan,staff_limit,sub_pro_status,sub_basic_status")
    .eq("id", cid)
    .maybeSingle();

  const { data: staffRows } = await sb
    .from("staff")
    .select("id,name,active")
    .eq("owner_id", uid)
    .eq("active", true)
    .order("name");

  // Date windows
  const now = new Date();
  const startToday = startOfDayLisbonISO(now);
  const endToday = endOfDayLisbonISO(now);
  const startWeek = startOfDayLisbonISO(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const endWeek = endToday;
  const start28 = startOfDayLisbonISO(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
  const start180 = startOfDayLisbonISO(new Date(now.getTime() - 179 * 24 * 60 * 60 * 1000));

  const baseSelect = "id,status_v2,start_time,end_time,staff_id,customer_id,service_price_cents_snapshot,is_no_show";

  const [{ data: todayRows }, { data: weekRows }, { data: monthRows }, { data: ap180 }] = await Promise.all([
    sb.from("appointments").select(baseSelect).eq("owner_id", uid).gte("start_time", startToday).lte("start_time", endToday),
    sb.from("appointments").select(baseSelect).eq("owner_id", uid).gte("start_time", startWeek).lte("start_time", endWeek),
    sb.from("appointments").select("id,status_v2,start_time").eq("owner_id", uid).gte("start_time", start28).lte("start_time", endToday),
    sb.from("appointments").select("customer_id,start_time,status_v2").eq("owner_id", uid).gte("start_time", start180).lte("start_time", endWeek).limit(5000),
  ]);

  const today = (todayRows ?? []) as any[];
  const week = (weekRows ?? []) as any[];

  const ACTIVE = ["PENDING", "CONFIRMED"];
  const REVENUE = ["PENDING", "CONFIRMED", "ATTENDED", "COMPLETED"];
  const COMPLETED = ["ATTENDED", "COMPLETED"];

  const todayCount = today.filter((r) => ACTIVE.includes(String(r.status_v2))).length;
  const weekCount = week.filter((r) => ACTIVE.includes(String(r.status_v2))).length;

  const todayRevenueCents = today.filter((r) => REVENUE.includes(String(r.status_v2))).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);
  const weekRevenueCents = week.filter((r) => REVENUE.includes(String(r.status_v2))).reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);

  const cancelWeek = week.filter((r) => String(r.status_v2) === "CANCELLED").length;

  const metrics = { todayCount, weekCount, todayRevenueCents, weekRevenueCents, cancelWeek };

  // Heatmap 28d
  const rows28 = (monthRows ?? []) as any[];
  const buckets: Record<string, number> = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
  const mapDow = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (const r of rows28) {
    if (!REVENUE.includes(String(r.status_v2))) continue;
    const d = new Date(String(r.start_time));
    const key = mapDow[d.getDay()];
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  const heatmap = Object.entries(buckets).map(([day, count]) => ({ day, count }));

  // Radar: inativos + risco + dia fraco + staff destaque
  const appts = (ap180 ?? []) as any[];
  const lastByCustomer = new Map<string, Date>();
  const futureByCustomer = new Map<string, boolean>();
  const cutoffInactive = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const a of appts) {
    const cust = String(a.customer_id ?? "");
    if (!cust) continue;
    const st = new Date(String(a.start_time));
    const status = String(a.status_v2);
    if (REVENUE.includes(status)) {
      const last = lastByCustomer.get(cust);
      if (!last || st > last) lastByCustomer.set(cust, st);
    }
    // future: anything after now and active
    if (st > now && ACTIVE.includes(status)) futureByCustomer.set(cust, true);
  }

  let inactive = 0;
  for (const [cust, last] of lastByCustomer.entries()) {
    if (last < cutoffInactive && !futureByCustomer.get(cust)) inactive++;
  }

  // risk: customers with >=2 cancels in last 180d
  const cancelsByCustomer = new Map<string, number>();
  for (const a of appts) {
    const cust = String(a.customer_id ?? "");
    if (!cust) continue;
    const status = String(a.status_v2);
    if (status === "CANCELLED" || status === "NO_SHOW") {
      cancelsByCustomer.set(cust, (cancelsByCustomer.get(cust) ?? 0) + 1);
    }
  }
  const risky = Array.from(cancelsByCustomer.values()).filter((n) => n >= 2).length;

  // weak day from heatmap: min bucket
  const minDay = heatmap.reduce((acc, x) => (x.count < acc.count ? x : acc), heatmap[0] ?? { day: "—", count: 0 });

  // Top staff by revenue 7d (CONFIRMED+COMPLETED+ATTENDED)
  const staffRevenue = new Map<string, number>();
  for (const a of week) {
    const sid = String(a.staff_id ?? "");
    if (!sid) continue;
    if (!["CONFIRMED", "ATTENDED", "COMPLETED"].includes(String(a.status_v2))) continue;
    staffRevenue.set(sid, (staffRevenue.get(sid) ?? 0) + Number(a.service_price_cents_snapshot ?? 0));
  }
  let topStaff: { staff_id: string; name: string; revenueCents: number } | null = null;
  for (const [sid, rev] of staffRevenue.entries()) {
    if (!topStaff || rev > topStaff.revenueCents) topStaff = { staff_id: sid, name: sid, revenueCents: rev };
  }
  const staffList = (staffRows ?? []) as any[];
  if (topStaff) {
    const found = staffList.find((s: any) => String(s.id) === topStaff!.staff_id);
    topStaff = { ...topStaff, name: String(found?.name ?? topStaff.staff_id) };
  }

  const radar = [
    { label: "Clientes inativos (+30d)", value: String(inactive), tone: inactive >= 10 ? "danger" : inactive >= 5 ? "warn" : "ok", href: "/dashboard/crm" },
    { label: "Risco (cancel/no-show)", value: String(risky), tone: risky >= 6 ? "danger" : risky >= 3 ? "warn" : "ok", href: "/dashboard/agenda" },
    { label: "Dia mais fraco (28d)", value: `${minDay.day} (${minDay.count})`, tone: minDay.count <= 2 ? "warn" : "info" },
    { label: "Staff destaque (7d)", value: topStaff ? `${topStaff.name} • ${Math.round(topStaff.revenueCents / 100)}€` : "—", tone: topStaff ? "info" : "ok", href: "/dashboard/staff" },
  ] as const;

  // Views (Finance + Insights)
  const [
    { data: companyFin },
    { data: staffFin },
    { data: staffOcc },
    { data: topServiceRows },
    { data: weekdayRows },
    { data: hourRows },
  ] = await Promise.all([
    sb.from("v_company_financial_metrics").select("*").eq("owner_id", uid).maybeSingle(),
    sb.from("v_staff_financial_metrics").select("*").eq("owner_id", uid),
    sb.from("v_staff_occupancy").select("*").eq("owner_id", uid),
    sb.from("v_top_services").select("service_id,service_name,revenue_cents,total_completed").eq("owner_id", uid).order("revenue_cents", { ascending: false }).limit(1),
    sb.from("v_weekday_performance").select("weekday,revenue_cents,total_completed").eq("owner_id", uid).order("revenue_cents", { ascending: false }).limit(1),
    sb.from("v_hourly_performance").select("hour,total_completed").eq("owner_id", uid).order("total_completed", { ascending: true }).limit(1),
  ]);

  const initialData = {
    companyId: cid,
    company: (company as any) ?? null,
    staff: (staffRows as any) ?? [],
    metrics,
    heatmap,
    radar: radar as any,
    topStaff: topStaff as any,
    companyFin: (companyFin as any) ?? null,
    staffFin: (staffFin as any) ?? [],
    staffOcc: (staffOcc as any) ?? [],
    topService: (topServiceRows?.[0] as any) ?? null,
    bestWeekday: (weekdayRows?.[0] as any) ?? null,
    emptiestHour: (hourRows?.[0] as any) ?? null,
  };

  return <DashboardClient initial={initialData as any} />;
}
