import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `staff_invite:` + ip, limit: 25, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as any;
    const name = String(body?.name || "").trim();
    const phone = String(body?.phone || "").trim() || null;
    const email = String(body?.email || "").trim().toLowerCase();

    if (!name) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "Informe um email válido." }, { status: 400 });

    const { data: prof, error: pErr } = await admin.from("profiles").select("company_id,role").eq("id", userId).single();
    if (pErr || !prof?.company_id) return NextResponse.json({ error: "Sem company." }, { status: 400 });

    const companyId = String(prof.company_id);
    const role = String((prof as any).role || "owner");
    if (role !== "owner") return NextResponse.json({ error: "Apenas o owner pode convidar staff." }, { status: 403 });

    const { data: comp, error: cErr } = await admin.from("companies").select("plan,staff_limit").eq("id", companyId).single();
    if (cErr || !comp) return NextResponse.json({ error: "Company não encontrada." }, { status: 400 });

    const staffLimit = Number((comp as any).staff_limit ?? 1);
    const plan = String((comp as any).plan ?? "basic");

    const { count: activeCount, error: cntErr } = await admin
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("active", true);

    if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 400 });

    if ((activeCount ?? 0) >= staffLimit) {
      return NextResponse.json(
        {
          error: `Limite de staff atingido para o plano ${plan.toUpperCase()}. Atualize para PRO para adicionar mais.`,
          code: "STAFF_LIMIT",
          plan,
          staff_limit: staffLimit,
          active_staff: activeCount ?? 0,
        },
        { status: 402 }
      );
    }

    // Cria o registro de staff
    const { data: staffRow, error: insErr } = await admin
      .from("staff")
      .insert({ company_id: companyId, name, phone, role: "staff", active: true })
      .select("id,name,phone,role,active,created_at")
      .single();

    if (insErr || !staffRow) return NextResponse.json({ error: insErr?.message || "Falha ao criar staff" }, { status: 400 });

    // Convida no Auth e vincula profile com staff_id
    const redirectTo =
      (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") + "/login";

    // 1) Envia convite por email (magic link / set password)
    const { data: inviteRes, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (invErr) {
      // rollback do staff se não conseguiu convidar
      await admin.from("staff").delete().eq("id", staffRow.id);
      return NextResponse.json({ error: invErr.message }, { status: 400 });
    }

    const invitedUserId = inviteRes?.user?.id;
    if (!invitedUserId) {
      await admin.from("staff").delete().eq("id", staffRow.id);
      return NextResponse.json({ error: "Falha ao obter user id do convite." }, { status: 500 });
    }

    // 2) Cria/atualiza profile do usuário convidado
    const { error: upErr } = await admin
      .from("profiles")
      .upsert(
        { id: invitedUserId, company_id: companyId, role: "staff", staff_id: staffRow.id },
        { onConflict: "id" }
      );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      staff: staffRow,
      invited_email: email,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
