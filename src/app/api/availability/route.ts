import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

function zonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

// Convert "YYYY-MM-DD" + "HH:mm" in a timeZone to UTC Date
function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  const [hh, mm] = timeStr.split(":").map((n) => Number(n));

  // first guess: treat as UTC
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));

  // find offset by comparing what "guess" looks like in timezone
  const p = zonedParts(guess, timeZone);
  const asIf = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  const desired = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offsetMs = asIf - guess.getTime();

  // adjust to make desired local time in tz
  return new Date(desired - offsetMs);
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

// Modelo SOLO (1 dono):
// - Ignora staff
// - Usa owner_working_hours (por owner_id)
// - Bloqueia slots por overlap em appointments do dono
export async function GET(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `availability:` + ip, limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const url = new URL(req.url);
    const date = String(url.searchParams.get("date") || "").trim(); // YYYY-MM-DD
    const durationMinutes = Math.max(5, Number(url.searchParams.get("duration") || 30));
    const stepMinutes = Math.max(5, Number(url.searchParams.get("step") || 15));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;

    // Timezone: tenta company -> fallback Lisbon
    const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId = (prof as any)?.company_id as string | undefined;

    let timeZone = "Europe/Lisbon";
    if (companyId) {
      const { data: comp } = await admin.from("companies").select("timezone").eq("id", companyId).maybeSingle();
      timeZone = (comp as any)?.timezone || timeZone;
    }

    // day range in UTC (00:00 - 24:00 local tz)
    const dayStartUtc = zonedDateTimeToUtc(date, "00:00", timeZone);
    const dayEndUtc = zonedDateTimeToUtc(date, "23:59", timeZone);

    // day of week in timezone (0=Sun)
    const localMid = new Date(dayStartUtc.getTime() + 12 * 60 * 60 * 1000);
    const dow = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(localMid);
    const map: any = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const dayOfWeek = map[dow] ?? 1;

    // Horários do dono
    const { data: wh } = await admin
      .from("owner_working_hours")
      .select("start_time,end_time,active")
      .eq("owner_id", userId)
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    const open = wh?.active === false ? null : (wh?.start_time as string) || "09:00";
    const close = wh?.active === false ? null : (wh?.end_time as string) || "18:00";

    if (!open || !close) {
      return NextResponse.json({ ok: true, date, timeZone, slots: [] });
    }

    // Marcações do dono (filtra por company_id se existir, para isolar contas antigas)
    let q: any = admin
      .from("appointments")
      .select("start_time,end_time,status,status_v2,service_duration_minutes_snapshot")
      .gte("start_time", dayStartUtc.toISOString())
      .lte("start_time", dayEndUtc.toISOString());

    if (companyId) q = q.eq("company_id", companyId);

    const { data: appts, error: aErr } = await q;
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

    // Statuses ativos (sem PENDING enum)
    const busy = (appts ?? [])
      .filter((a: any) => {
        const s = String(a.status || "");
        const s2 = String(a.status_v2 || "");
        // considera ocupado se confirmado/marcado/pendente (text)
        if (["BOOKED", "CONFIRMED"].includes(s)) return true;
        if (["PENDING", "CONFIRMED"].includes(s2)) return true;
        return false;
      })
      .map((a: any) => {
        const st = new Date(a.start_time).getTime();
        const en = a.end_time
          ? new Date(a.end_time).getTime()
          : new Date(a.start_time).getTime() + Number(a.service_duration_minutes_snapshot ?? durationMinutes) * 60_000;
        return { s: st, e: en };
      })
      .filter((x: any) => Number.isFinite(x.s) && Number.isFinite(x.e));

    const slots: { label: string; startISO: string }[] = [];

    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;

    for (let m = openMin; m + durationMinutes <= closeMin; m += stepMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const t = `${hh}:${mm}`;

      const sUtc = zonedDateTimeToUtc(date, t, timeZone);
      const eUtc = new Date(sUtc.getTime() + durationMinutes * 60_000);

      const sMs = sUtc.getTime();
      const eMs = eUtc.getTime();

      const clash = busy.some((b: any) => overlap(sMs, eMs, b.s, b.e));
      if (!clash) slots.push({ label: t, startISO: sUtc.toISOString() });
    }

    return NextResponse.json({ ok: true, date, timeZone, open, close, durationMinutes, stepMinutes, slots });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
