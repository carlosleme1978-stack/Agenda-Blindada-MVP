import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `metrics_summary:` + ip, limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: prof } = await admin.from("profiles").select("company_id,role,staff_id").eq("id", userRes.user.id).single();
  const companyId = prof?.company_id as string | undefined;
  if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });

  const role = String((prof as any)?.role ?? "owner");
  const staffId = (prof as any)?.staff_id as string | null;

  let base = admin.from("appointments").select("id", { count: "exact", head: true }).eq("owner_id", uid);
  if (role === "staff" && staffId) base = base.eq("staff_id", staffId);

  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const startTomorrow = new Date(startToday.getTime() + 24 * 60 * 60 * 1000);

  const day = await base.gte("start_time", startToday.toISOString()).lt("start_time", startTomorrow.toISOString());
  if (day.error) return NextResponse.json({ error: day.error.message }, { status: 400 });

  const startWeek = new Date(startToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  const week = await base.gte("start_time", startWeek.toISOString()).lt("start_time", startTomorrow.toISOString());
  if (week.error) return NextResponse.json({ error: week.error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    today: day.count ?? 0,
    last7days: week.count ?? 0,
  });
}
