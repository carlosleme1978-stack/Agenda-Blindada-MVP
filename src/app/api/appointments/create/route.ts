import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

function toDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `appt_create:` + ip, limit: 60, windowMs: 60_000 });
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
      serviceIds?: string[];
    };

    const customerPhone = toDigits(String(body.customerPhone ?? ""));
    const customerName = String(body.customerName ?? "").trim();
    const startISO = String(body.startISO ?? "").trim();
    const durationMinutes = Math.max(5, Number(body.durationMinutes ?? 30));

    if (!customerName) return new NextResponse("Nome é obrigatório", { status: 400 });
    if (!customerPhone || customerPhone.length < 9) return new NextResponse("Telefone inválido", { status: 400 });
    if (!startISO || !durationMinutes) return new NextResponse("Dados inválidos", { status: 400 });

    const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId = (prof as any)?.company_id as string | undefined;
    if (!companyId) return new NextResponse("Sem company_id", { status: 400 });

    // Services (multi)
    const rawIds = Array.isArray((body as any).serviceIds) ? (body as any).serviceIds : null;
    const primary = String((body as any).serviceId ?? "").trim();
    const finalServiceIds = (rawIds && rawIds.length ? rawIds : (primary ? [primary] : [])).map((s: any) => String(s).trim()).filter((s: string) => s.length);
    if (!finalServiceIds.length) return new NextResponse("Service obrigatório.", { status: 400 });

    const { data: pickedServices, error: psErr } = await admin
      .from("services")
      .select("id,name,duration_minutes,price_cents,currency")
      .in("id", finalServiceIds)
      .eq("active", true);

    if (psErr) return new NextResponse(psErr.message, { status: 400 });
    if (!pickedServices || pickedServices.length === 0) return new NextResponse("Service inválido.", { status: 400 });

    const totalMinutes = pickedServices.reduce((a: number, s: any) => a + Number(s.duration_minutes ?? 0), 0) || durationMinutes;
    const totalCents = pickedServices.reduce((a: number, s: any) => a + Number(s.price_cents ?? 0), 0);
    const currency = String((pickedServices[0] as any).currency ?? "EUR");

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return new NextResponse("startISO inválido", { status: 400 });
    const end = new Date(start.getTime() + totalMinutes * 60000);

    // Upsert customer (single owner, still scoped by company)
    const { data: custUp, error: custErr } = await admin
      .from("customers")
      .upsert({ company_id: companyId, phone: customerPhone, name: customerName }, { onConflict: "company_id,phone" })
      .select("id,phone,name")
      .single();

    if (custErr || !custUp) return new NextResponse(custErr?.message ?? "Erro cliente", { status: 400 });

    // Bloqueio de overlap (SOLO: sem staff_id)
    const { data: clashRows, error: clashErr } = await admin
      .from("appointments")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ["BOOKED", "CONFIRMED"])
      .lt("start_time", end.toISOString())
      .gt("end_time", start.toISOString())
      .limit(1);

    if (clashErr) return new NextResponse(clashErr.message, { status: 400 });
    if ((clashRows ?? []).length) {
      return new NextResponse("Este horário já está ocupado. Escolha outro horário.", { status: 409 });
    }

    const first = pickedServices[0] as any;

    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: custUp.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "CONFIRMED",
        status_v2: "CONFIRMED",
        staff_id: null,
        service_id: String(first.id),
        customer_name_snapshot: customerName,
        service_name_snapshot: String(first.name ?? ""),
        service_duration_minutes_snapshot: totalMinutes,
        service_price_cents_snapshot: totalCents,
        service_currency_snapshot: currency,
      })
      .select("id")
      .single();

    if (apptErr || !appt) {
      return new NextResponse(apptErr?.message ?? "Erro ao criar marcação", { status: 400 });
    }

    // Mensagem WhatsApp (best effort)
    try {
      const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
      await sendWhatsAppTextForCompany(
        companyId,
        customerPhone,
        `Olá ${customerName}! Sua marcação foi confirmada ✅\n\nData/hora: ${start.toLocaleString("pt-PT")}\nDuração: ${totalMinutes} min\nValor: ${(totalCents / 100).toFixed(2).replace(".", ",")} ${currency}`
      );
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, id: appt.id });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
