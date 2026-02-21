import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

function toDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

function fmtLisbon(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  } catch {
    return iso;
  }
}

async function getCompanyAndDefaultStaff(admin: any, userId: string) {
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (profErr || !prof?.company_id) {
    throw new Error("Sem company_id no profile");
  }

  const companyId = String(prof.company_id);
  const { data: company, error: compErr } = await admin
    .from("companies")
    .select("default_staff_id")
    .eq("id", companyId)
    .single();

  if (compErr || !company) throw new Error("Company inválida");
  const staffId = String((company as any).default_staff_id || "");
  if (!staffId) throw new Error("Company sem default_staff_id");

  return { companyId, staffId };
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
    };

    const customerPhone = toDigits(String(body.customerPhone ?? ""));
    const customerName = String(body.customerName ?? "").trim();
    const startISO = String(body.startISO ?? "").trim();
    const durationMinutes = Number(body.durationMinutes ?? 30);

    // ✅ agora é obrigatório ter NOME e TELEFONE
    if (!customerName) return new NextResponse("Nome é obrigatório", { status: 400 });
    if (!customerPhone || customerPhone.length < 9) return new NextResponse("Telefone inválido", { status: 400 });
    if (!startISO || !durationMinutes) return new NextResponse("Dados inválidos", { status: 400 });

    const { companyId, staffId } = await getCompanyAndDefaultStaff(admin, userId);

    // Upsert customer (tolerante: se não existir UNIQUE(company_id, phone), faz fallback)
    let custUp: any = null;
    {
      const payload = { company_id: companyId, phone: customerPhone, name: customerName, consent_whatsapp: true, whatsapp_phone: customerPhone };
      const { data, error } = await admin
        .from("customers")
        // Nota: seu schema atual de customers NÃO tem owner_id.
        // Para testes, já marcamos consent_whatsapp=true para permitir envio automático.
        .upsert(payload as any, { onConflict: "company_id,phone" })
        .select("id,phone,name,consent_whatsapp,whatsapp_phone")
        .single();

      if (!error && data) {
        custUp = data;
      } else {
        const msg = String((error as any)?.message ?? "");
        const noConstraint = msg.toLowerCase().includes("no unique") || msg.toLowerCase().includes("on conflict");
        if (!noConstraint) {
          return new NextResponse(msg || "Erro cliente", { status: 400 });
        }

        // Fallback: tenta buscar e atualizar / inserir
        const { data: existing, error: exErr } = await admin
          .from("customers")
          .select("id,phone,name,consent_whatsapp,whatsapp_phone")
          .eq("company_id", companyId)
          .eq("phone", customerPhone)
          .maybeSingle();

        if (exErr) return new NextResponse(exErr.message, { status: 400 });

        if (existing) {
          const { data: upd, error: updErr } = await admin
            .from("customers")
            .update({ name: customerName, consent_whatsapp: true, whatsapp_phone: customerPhone } as any)
            .eq("id", existing.id)
            .select("id,phone,name,consent_whatsapp,whatsapp_phone")
            .single();
          if (updErr || !upd) return new NextResponse(updErr?.message ?? "Erro cliente", { status: 400 });
          custUp = upd;
        } else {
          const { data: ins, error: insErr } = await admin
            .from("customers")
            .insert(payload as any)
            .select("id,phone,name,consent_whatsapp,whatsapp_phone")
            .single();
          if (insErr || !ins) return new NextResponse(insErr?.message ?? "Erro cliente", { status: 400 });
          custUp = ins;
        }
      }
    }

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return new NextResponse("startISO inválido", { status: 400 });

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
      // Seu schema atual de services: id, company_id, name, duration_minutes
      .select("id,name,duration_minutes")
      .in("id", finalServiceIds);

    if (psErr) return new NextResponse(psErr.message, { status: 400 });
    if (!pickedServices || pickedServices.length === 0) return new NextResponse("Service inválido.", { status: 400 });

    const totalMinutes = pickedServices.reduce((a: number, s: any) => a + Number((s as any).duration_minutes ?? 0), 0) || durationMinutes || 30;
    // Seu schema atual não tem preço/moeda no services, então usamos defaults.
    const totalCents = 0;
    const currency = "EUR";

    // Define end baseado na duração total do(s) serviço(s)
    const end = new Date(start.getTime() + totalMinutes * 60000);

    // ✅ Bloqueio de horário duplicado (server-side)
    const { data: clashRows, error: clashErr } = await admin
      .from("appointments")
      .select("id,start_time,end_time,status")
      .eq("company_id", companyId)
      .eq("staff_id", staffId)
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


    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        // owner_id deixou de ser tenant. Se sua coluna ainda existir, pode ficar NULL.
        customer_id: custUp.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        // Use CONFIRMED por compatibilidade com enums que não incluem PENDING.
        status_v2: "CONFIRMED",
        staff_id: staffId,
        service_id: String(pickedServices[0].id),
        customer_name_snapshot: customerName,
        service_name_snapshot: String((pickedServices[0] as any).name ?? ""),
        service_price_cents_snapshot: totalCents,
        service_duration_minutes_snapshot: totalMinutes,
        service_currency_snapshot: currency,
      })
      .select("id,customer_id,start_time")
      .single();

    if (apptErr || !appt) {
      return new NextResponse(apptErr?.message ?? "Erro ao criar marcação", { status: 400 });
    }

    // Se houver múltiplos serviços, tenta registrar na tabela pivot (best effort)
    if (finalServiceIds.length > 1) {
      try {
        await admin.from("appointment_services").insert(
          finalServiceIds.map((sid: string) => ({
            appointment_id: appt.id,
            service_id: sid,
            company_id: companyId,
          }))
        );
      } catch {
        // ignore
      }
    }

    // WhatsApp automático (best effort, respeitando consent)
    try {
      const consent = Boolean((custUp as any).consent_whatsapp);
      const to = toDigits(String((custUp as any).whatsapp_phone || custUp.phone || ""));
      if (consent && to) {
        const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
        const when = fmtLisbon(appt.start_time);
        const text =
          `✅ Agendamento confirmado!\n` +
          `👤 ${customerName}\n` +
          `📅 ${when}\n\n` +
          `Se precisar reagendar, responda esta mensagem.`;

        await sendWhatsAppTextForCompany(companyId, to, text);

        // Log (se tabela existir)
        try {
          await admin.from("message_deliveries").insert({
            company_id: companyId,
            appointment_id: appt.id,
            channel: "whatsapp",
            to_phone: to,
            template: "appointment_confirmed",
            status: "sent",
            created_at: new Date().toISOString(),
          });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, id: appt.id });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
