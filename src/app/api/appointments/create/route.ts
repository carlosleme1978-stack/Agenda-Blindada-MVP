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
    const ownerId = userId;

    const body = (await req.json().catch(() => ({}))) as {
      customerPhone?: string;
      customerName?: string;
      startISO?: string;
      durationMinutes?: number;
      serviceId?: string;
    };

    const customerPhone = toDigits(String(body.customerPhone ?? ""));
    const customerName = String(body.customerName ?? "").trim();
    const startISO = String(body.startISO ?? "").trim();
    const durationMinutes = Number(body.durationMinutes ?? 30);

    // ✅ agora é obrigatório ter NOME e TELEFONE
    if (!customerName) return new NextResponse("Nome é obrigatório", { status: 400 });
    if (!customerPhone || customerPhone.length < 9) return new NextResponse("Telefone inválido", { status: 400 });
    if (!startISO || !durationMinutes) return new NextResponse("Dados inválidos", { status: 400 });

    // company (mantemos por compatibilidade), mas o modelo é SOLO
    const { data: prof } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const companyId = prof?.company_id as string | undefined;
    if (!companyId) return new NextResponse("Sem company_id", { status: 400 });

    // Upsert customer
    const { data: custUp, error: custErr } = await admin
      .from("customers")
      .upsert({ company_id: companyId, owner_id: ownerId, phone: customerPhone, name: customerName }, { onConflict: "company_id,phone" })
      .select("id,phone,name")
      .single();

    if (custErr || !custUp) return new NextResponse(custErr?.message ?? "Erro cliente", { status: 400 });

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return new NextResponse("startISO inválido", { status: 400 });
    const end = new Date(start.getTime() + durationMinutes * 60000);

    
    // ✅ Bloqueio de horário duplicado (server-side)
    const { data: clashRows, error: clashErr } = await admin
      .from("appointments")
      .select("id,start_time,end_time,status")
      .eq("owner_id", ownerId)
      // Nota: alguns bancos ainda não possuem o valor PENDING no enum.
      // Para evitar erro e, ao mesmo tempo, bloquear horários já ocupados,
      // consideramos apenas estados ativos conhecidos: CONFIRMED/BOOKED.
      .or("status_v2.in.(CONFIRMED),status.in.(BOOKED,CONFIRMED)")
      .lt("start_time", end.toISOString())
      .gt("end_time", start.toISOString())
      .limit(1);

    if (clashErr) return new NextResponse(clashErr.message, { status: 400 });
    if ((clashRows ?? []).length) {
      return new NextResponse("Este horário já está ocupado. Escolha outro horário.", { status: 409 });
    }

// Pick service(s)
    const rawServiceIds = (body as any).serviceIds ?? (body as any).service_ids ?? null;
    const serviceIds = Array.isArray(rawServiceIds)
      ? rawServiceIds.map((s: any) => String(s).trim()).filter((s: string) => s.length)
      : String(rawServiceIds ?? "").split(",").map((s: string) => s.trim()).filter((s: string) => s.length);

    const primaryServiceId = String((body as any).service_id ?? (body as any).serviceId ?? "").trim();
    const finalServiceIds = (serviceIds && serviceIds.length) ? serviceIds : (primaryServiceId ? [primaryServiceId] : []);

    if (!finalServiceIds.length) return new NextResponse("Service obrigatório.", { status: 400 });

    const { data: pickedServices, error: psErr } = await admin
      .from("services")
      .select("id,name,duration_minutes,price_cents,currency")
      .in("id", finalServiceIds)
      .eq("active", true);

    if (psErr) return new NextResponse(psErr.message, { status: 400 });
    if (!pickedServices || pickedServices.length === 0) return new NextResponse("Service inválido.", { status: 400 });

    const totalMinutes = pickedServices.reduce((a: number, s: any) => a + Number(s.duration_minutes ?? 0), 0) || 30;
    const totalCents = pickedServices.reduce((a: number, s: any) => a + Number(s.price_cents ?? 0), 0);
    const currency = String((pickedServices[0] as any).currency ?? "EUR");


    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        owner_id: ownerId,
        customer_id: custUp.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        // Use CONFIRMED por compatibilidade com enums que não incluem PENDING.
        status_v2: "CONFIRMED",
        staff_id: null,
        service_id: String(pickedServices[0].id),
        customer_name_snapshot: customerName,
        service_name_snapshot: String((pickedServices[0] as any).name ?? ""),
        service_price_cents_snapshot: totalCents,
        service_duration_minutes_snapshot: totalMinutes,
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
