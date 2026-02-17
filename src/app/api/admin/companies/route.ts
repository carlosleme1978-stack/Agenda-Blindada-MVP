import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

function isAllowedEmail(email: string | null | undefined) {
  const list = String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!list.length) return false;
  return !!email && list.includes(email.toLowerCase());
}

export async function GET(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `admin_companies:` + ip, limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  if (!isAllowedEmail(userRes.user.email)) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("companies")
    .select("id,name,plan,staff_limit,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, companies: data ?? [] });
}
