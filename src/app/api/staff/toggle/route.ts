import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `staff_toggle:` + ip, limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;
    const body = (await req.json().catch(() => ({}))) as any;
    const staffId = String(body?.staff_id || "").trim();
    const nextActive = !!body?.active;

    if (!staffId) return NextResponse.json({ error: "staff_id obrigatório" }, { status: 400 });

    const { data: prof } = await admin.from("profiles").select("company_id,role").eq("id", userId).single();
    const companyId = prof?.company_id as string | undefined;
    const role = String((prof as any)?.role ?? "owner");
    if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });
    if (role !== "owner") return NextResponse.json({ error: "Apenas o owner pode alterar staff." }, { status: 403 });

    // staff tem que ser da empresa
    const { data: st } = await admin.from("staff").select("id,active").eq("id", staffId).eq("company_id", companyId).single();
    if (!st) return NextResponse.json({ error: "Staff não encontrado" }, { status: 404 });

    // Se vai ATIVAR, precisa respeitar limite
    if (nextActive) {
      const { data: comp } = await admin.from("companies").select("plan,staff_limit").eq("id", companyId).single();
      const staffLimit = Number((comp as any)?.staff_limit ?? 1);
      const plan = String((comp as any)?.plan ?? "basic");

      const { count } = await admin.from("staff").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true);

      if ((count ?? 0) >= staffLimit) {
        return NextResponse.json(
          { error: `Limite de staff atingido para o plano ${plan.toUpperCase()}. Atualize para PRO para ativar mais.`, code: "STAFF_LIMIT" },
          { status: 402 }
        );
      }
    }

    const { data: upd, error: uErr } = await admin.from("staff").update({ active: nextActive }).eq("id", staffId).eq("company_id", companyId).select("id,active").single();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, staff: upd });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
