import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

function toDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `appt_create:` + ip, limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new NextResponse("Missing token", { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return new NextResponse("Invalid token", { status: 401 });

    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      customerPhone?: string;
      customerName?: string;
      startISO?: string;
      durationMinutes?: number;
      serviceId?: string;
      staffId?: string;
    };

    const customerPhone = toDigits(String(body.customerPhone ?? ""));
    const customerName = String(body.customerName ?? "").trim();
    const startISO = String(body.startISO ?? "").trim();
    const durationMinutes = Number(body.durationMinutes ?? 30);

    // ✅ agora é obrigatório ter NOME e TELEFONE
    if (!customerName) return new NextResponse("Nome é obrigatório", { status: 400 });
    if (!customerPhone || customerPhone.length < 9) return new NextResponse("Telefone inválido", { status: 400 });
    if (!startISO || !durationMinutes) return new NextResponse("Dados inválidos", { status: 400 });

    // company + role + staff_id
    const { data: prof } = await admin
      .from("profiles")
      .select("company_id,role,staff_id")
      .eq("id", userId)
      .single();

    const companyId = prof?.company_id as string | undefined;
    if (!companyId) return new NextResponse("Sem company_id", { status: 400 });

    const role = String(prof?.role ?? "owner");

    // Plano/limite
    const { data: comp } = await admin.from("companies").select("plan,staff_limit").eq("id", companyId).single();
    const plan = String((comp as any)?.plan ?? "basic").toLowerCase();
    const staffLimit = Number((comp as any)?.staff_limit ?? 1);

    // Lista de staff permitido (primeiros N ativos por created_at)
    const { data: staffRows } = await admin
      .from("staff")
      .select("id")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true });

    const allowedStaffIds = (staffRows ?? []).map((x: any) => String(x.id)).slice(0, Math.max(1, staffLimit));

    // Determine staff_id
    let staffId: string | null = null;

    if (role === "staff") {
      staffId = prof?.staff_id ?? null;
      if (!staffId) return new NextResponse("Staff sem staff_id no profile", { status: 400 });
      // staff só pode marcar para si
      if (!allowedStaffIds.includes(staffId)) {
        return new NextResponse("Este staff está fora do limite do plano atual.", { status: 402 });
      }
    } else {
      staffId = String(body.staffId ?? "").trim() || null;
      if (!staffId) staffId = allowedStaffIds[0] ?? null;

      if (!staffId) return new NextResponse("Nenhum staff ativo encontrado", { status: 400 });

      // ✅ BASIC / limite: não deixa marcar para staff fora do permitido
      if (!allowedStaffIds.includes(staffId)) {
        return new NextResponse("Limite de staff do plano atingido. Atualize para PRO para usar mais staff.", {
          status: 402,
        });
      }
    }

    // Upsert customer
    const { data: custUp, error: custErr } = await admin
      .from("customers")
      .upsert({ company_id: companyId, phone: customerPhone, name: customerName }, { onConflict: "company_id,phone" })
      .select("id,phone,name")
      .single();

    if (custErr || !custUp) return new NextResponse(custErr?.message ?? "Erro cliente", { status: 400 });

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return new NextResponse("startISO inválido", { status: 400 });
    const end = new Date(start.getTime() + durationMinutes * 60000);

    // Pick service
    let serviceId: string | null = String(body.serviceId ?? "").trim() || null;
    if (!serviceId) {
      const { data: sv } = await admin
        .from("services")
        .select("id")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      serviceId = sv?.id ?? null;
    }

    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: custUp.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        staff_id: staffId,
        service_id: serviceId,
        customer_name_snapshot: customerName,
      })
      .select("id")
      .single();

    if (apptErr || !appt) {
      return new NextResponse(apptErr?.message ?? "Erro ao criar marcação", { status: 400 });
    }

    // Fire-and-forget WhatsApp message (best effort)
    try {
      const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
      await sendWhatsAppTextForCompany(
        companyId,
        customerPhone,
        `Olá ${customerName}! Sua marcação foi criada. Para confirmar responda: SIM. Para cancelar: NÃO.`
      );
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, id: appt.id });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
