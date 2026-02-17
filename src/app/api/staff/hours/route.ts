import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `staff_hours_get:` + ip, limit: 80, windowMs: 60_000 });
  if (limited) return limited;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const url = new URL(req.url);
  const staffId = String(url.searchParams.get("staff_id") || "").trim();
  if (!staffId) return NextResponse.json({ error: "staff_id obrigatório" }, { status: 400 });

  const { data: prof } = await admin.from("profiles").select("company_id,role").eq("id", userRes.user.id).single();
  const companyId = prof?.company_id as string | undefined;
  const role = String((prof as any)?.role ?? "owner");
  if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });
  if (role !== "owner") return NextResponse.json({ error: "Apenas owner" }, { status: 403 });

  const { data, error } = await admin
    .from("staff_working_hours")
    .select("day_of_week,start_time,end_time,active")
    .eq("owner_id", uid)
    .eq("staff_id", staffId)
    .order("day_of_week", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, hours: data ?? [] });
}

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `staff_hours_set:` + ip, limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as any;
  const staffId = String(body?.staff_id || "").trim();
  const hours = Array.isArray(body?.hours) ? body.hours : [];

  if (!staffId) return NextResponse.json({ error: "staff_id obrigatório" }, { status: 400 });

  const { data: prof } = await admin.from("profiles").select("company_id,role").eq("id", userRes.user.id).single();
  const companyId = prof?.company_id as string | undefined;
  const role = String((prof as any)?.role ?? "owner");
  if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });
  if (role !== "owner") return NextResponse.json({ error: "Apenas owner" }, { status: 403 });

  for (const h of hours) {
    const dow = Number(h?.day_of_week);
    const start = String(h?.start_time || "").trim();
    const end = String(h?.end_time || "").trim();
    const active = h?.active === false ? false : true;

    if (!(dow >= 0 && dow <= 6)) continue;
    if (!/^\d{2}:\d{2}/.test(start) || !/^\d{2}:\d{2}/.test(end)) continue;

    const { error } = await admin
      .from("staff_working_hours")
      .upsert(
        { company_id: companyId, staff_id: staffId, day_of_week: dow, start_time: start, end_time: end, active },
        { onConflict: "staff_id,day_of_week" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
