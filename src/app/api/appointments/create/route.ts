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
      serviceIds?: string[] | string;
      staffId?: string;
    };

    const customerPhone = toDigits(String(body.customerPhone ?? ""));
    const customerName = String(body.customerName ?? "").trim();
    const startISO = String(body.startISO ?? "").trim();

    // ✅ obrigatórios
    if (!customerName) return new NextResponse("Nome é obrigatório", { status: 400 });
    if (!customerPhone || customerPhone.length < 9) return new NextResponse("Telefone inválido", { status: 400 });
    if (!startISO) return new NextResponse("startISO inválido", { status: 400 });

    // company + role + staff_id
    const { data: prof } = await admin.from("profiles").select("company_id,role,staff_id").eq("id", userId).single();

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
      if (!allowedStaffIds.includes(staffId)) {
        return new NextResponse("Este staff está fora do limite do plano atual.", { status: 402 });
      }
    } else {
      staffId = String(body.staffId ?? "").trim() || null;
      if (!staffId) staffId = allowedStaffIds[0] ?? null;
      if (!staffId) return new NextResponse("Nenhum staff ativo encontrado", { status: 400 });
      if (!allowedStaffIds.includes(staffId)) {
        return new NextResponse("Limite de staff do plano atingido. Atualize para PRO para usar mais staff.", { status: 402 });
      }
    }

    // Upsert customer
    const { data: custUp, error: custErr } = await admin
      .from("customers")
      .upsert({ company_id: companyId, phone: customerPhone, name: customerName }, { onConflict: "company_id,phone" })
      .select("id,phone,name")
      .single();

    if (custErr || !custUp) return new NextResponse(custErr?.message ?? "Erro cliente", { status: 400 });

    // Pick service(s)
    const rawServiceIds = (body as any).serviceIds ?? (body as any).service_ids ?? null;
    const serviceIds = Array.isArray(rawServiceIds)
      ? rawServiceIds.map((s: any) => String(s).trim()).filter((s: string) => s.length)
      : String(rawServiceIds ?? "")
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length);

    const primaryServiceId = String((body as any).service_id ?? (body as any).serviceId ?? "").trim();
    const finalServiceIds = serviceIds.length ? serviceIds : primaryServiceId ? [primaryServiceId] : [];

    if (!finalServiceIds.length) return new NextResponse("Service obrigatório.", { status: 400 });

    const { data: pickedServices, error: psErr } = await admin
      .from("services")
      .select("id,name,duration_minutes,price_cents,currency")
      .in("id", finalServiceIds)
      .eq("active", true);

    if (psErr) return new NextResponse(psErr.message, { status: 400 });
    if (!pickedServices || pickedServices.length === 0) return new NextResponse("Service inválido.", { status: 400 });

    const totalMinutes = pickedServices.reduce((a: number, s: any) => a + Number(s.duration_minutes ?? 0), 0) || Number(body.durationMinutes ?? 30) || 30;
    const totalCents = pickedServices.reduce((a: number, s: any) => a + Number(s.price_cents ?? 0), 0);
    const currency = String((pickedServices[0] as any).currency ?? "EUR");
    const serviceName = pickedServices.map((s: any) => String(s.name ?? "")).filter(Boolean).join(" + ") || null;

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return new NextResponse("startISO inválido", { status: 400 });
    const end = new Date(start.getTime() + totalMinutes * 60000);

    // ✅ Bloqueio de conflito (server-side) — NUNCA use 'PENDING' no enum status
    const { data: clashRows, error: clashErr } = await admin
      .from("appointments")
      .select("id,start_time,end_time,status,status_v2")
      .eq("company_id", companyId)
      .eq("staff_id", staffId)
      .lt("start_time", end.toISOString())
      .gt("end_time", start.toISOString())
      .limit(50);

    if (clashErr) return new NextResponse(clashErr.message, { status: 400 });
    const ACTIVE_V2 = new Set(["PENDING", "CONFIRMED"]);
    const ACTIVE_ENUM = new Set(["BOOKED", "CONFIRMED"]);
    const hasClash = (clashRows ?? []).some((r: any) => {
      const v2 = String(r.status_v2 ?? "");
      const st = String(r.status ?? "");
      return ACTIVE_V2.has(v2) || ACTIVE_ENUM.has(st);
    });

    if (hasClash) return new NextResponse("Este horário já está ocupado para este staff. Escolha outro horário.", { status: 409 });

    // ✅ cria marcação (status enum legacy = BOOKED; status_v2 = PENDING)
    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: custUp.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        status_v2: "PENDING",
        staff_id: staffId,
        service_id: String((pickedServices[0] as any).id),
        customer_name_snapshot: customerName,
        service_name_snapshot: serviceName,
        service_duration_minutes_snapshot: totalMinutes,
        service_price_cents_snapshot: totalCents,
        service_currency_snapshot: currency,
      })
      .select("id")
      .single();

    if (apptErr || !appt) return new NextResponse(apptErr?.message ?? "Erro ao criar marcação", { status: 400 });

    // ✅ múltiplos serviços (extensão segura)
    if (finalServiceIds.length > 1) {
      const rows = (pickedServices ?? []).map((s: any) => ({
        appointment_id: appt.id,
        service_id: String(s.id),
        service_name_snapshot: String(s.name ?? ""),
        duration_minutes_snapshot: Number(s.duration_minutes ?? 0),
        price_cents_snapshot: Number(s.price_cents ?? 0),
        currency_snapshot: String(s.currency ?? "EUR"),
      }));
      if (rows.length) await admin.from("appointment_services").insert(rows);
    }

    // Fire-and-forget WhatsApp message (best effort)
    try {
      const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
      const priceTxt = totalCents ? `\nTotal: ${(totalCents / 100).toFixed(2).replace(".", ",")} ${currency}` : "";
      await sendWhatsAppTextForCompany(
        companyId,
        customerPhone,
        `Olá ${customerName}! ✅\nA sua marcação ficou pré-reservada.${serviceName ? `\nServiço: ${serviceName}` : ""}\nDuração: ${totalMinutes}min${priceTxt}\n\nPara confirmar responda: SIM. Para cancelar: NÃO.`
      );
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, id: appt.id });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
