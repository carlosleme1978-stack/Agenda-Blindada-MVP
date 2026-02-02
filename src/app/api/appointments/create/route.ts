import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserFromAuthHeader } from "@/lib/supabase/user";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

/**
 * Normaliza número PT para formato aceito pela WhatsApp Cloud API
 * Retorna SEM "+"
 */
function normalizePhonePT(raw: string): string {
  const trimmed = (raw ?? "").trim();
  let digits = trimmed.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("351")) return digits;
  if (digits.length === 9) return `351${digits}`;

  return digits;
}

export async function POST(req: Request) {
  try {
    // ─────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────
    const u = await getUserFromAuthHeader(req.headers.get("authorization"));
    if (!u?.user) {
      return new NextResponse("Sem autorização", { status: 401 });
    }

    // ─────────────────────────────────────────────
    // Input
    // ─────────────────────────────────────────────
    const { customerPhone, customerName, startISO, durationMinutes } =
      await req.json();

    if (!customerPhone || !startISO) {
      return new NextResponse("Campos em falta", { status: 400 });
    }

    const phone = normalizePhonePT(customerPhone);
    if (!phone) {
      return new NextResponse("Telefone inválido", { status: 400 });
    }

    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) {
      return new NextResponse("Data inválida", { status: 400 });
    }

    const end = new Date(
      start.getTime() + (Number(durationMinutes) || 30) * 60_000
    );

    const db = supabaseAdmin();

    // ─────────────────────────────────────────────
    // Company do user
    // ─────────────────────────────────────────────
    // profiles key varies across installs (id in schema.sql, uid/user_id in older DBs)
    let profile: any = null;
    {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("id", u.user.id)
        .maybeSingle();
      profile = r.data;
      if (r.error && /column\s+\"id\"\s+does not exist/i.test(r.error.message)) {
        profile = null;
      }
    }

    if (!profile?.company_id) {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("uid", u.user.id)
        .maybeSingle();
      profile = r.data;
      if (
        r.error &&
        /column\s+\"uid\"\s+does not exist/i.test(r.error.message)
      ) {
        profile = null;
      }
    }

    if (!profile?.company_id) {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      profile = r.data;
    }

    if (!profile?.company_id) {
      return new NextResponse("User sem company", { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Customer (find-or-create by phone)
    // NÃO sobrescreve o nome do cliente se ele já existir
    // Só preenche uma vez se estiver vazio
    // ─────────────────────────────────────────────
    const incomingName = (customerName || "").trim() || null;

    // 1) procurar cliente pelo telefone
    const { data: existingCustomer, error: findErr } = await db
      .from("customers")
      .select("id, phone, name")
      .eq("company_id", profile.company_id)
      .eq("phone", phone)
      .maybeSingle();

    if (findErr) {
      return new NextResponse(findErr.message, { status: 400 });
    }

    let customer = existingCustomer;

    // 2) se não existir, cria
    if (!customer) {
      const { data: createdCustomer, error: createErr } = await db
        .from("customers")
        .insert({
          company_id: profile.company_id,
          phone,
          name: incomingName,
          consent_whatsapp: true,
        })
        .select("id, phone, name")
        .single();

      if (createErr) {
        return new NextResponse(createErr.message, { status: 400 });
      }

      customer = createdCustomer;
    } else {
      // 3) se existir, não sobrescreve nome
      // só preenche se estiver vazio
      if (!customer.name && incomingName) {
        const { data: updatedCustomer, error: updErr } = await db
          .from("customers")
          .update({ name: incomingName })
          .eq("id", customer.id)
          .select("id, phone, name")
          .single();

        if (updErr) {
          return new NextResponse(updErr.message, { status: 400 });
        }

        customer = updatedCustomer;
      }
    }

    // ─────────────────────────────────────────────
    // Appointment (com snapshot do nome)
    // ─────────────────────────────────────────────
    const { data: appointment, error: apptErr } = await db
      .from("appointments")
      .insert({
        company_id: profile.company_id,
        customer_id: customer.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        customer_name_snapshot: (customerName || "").trim() || null,
      })
      .select("id, start_time, customer_name_snapshot")
      .single();

    if (apptErr) {
      return new NextResponse(apptErr.message, { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Template variables
    // ─────────────────────────────────────────────
    // Preferimos o snapshot / nome recebido agora para comunicação
    const clientName =
      appointment.customer_name_snapshot || customer.name || "Cliente";

    const formattedDate = new Date(appointment.start_time).toLocaleDateString(
      "pt-PT",
      { timeZone: "Europe/Lisbon" }
    );

    const formattedTime = new Date(appointment.start_time).toLocaleTimeString(
      "pt-PT",
      {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit",
      }
    );

    // ─────────────────────────────────────────────
    // SEND TEMPLATE
    // ─────────────────────────────────────────────
    await sendWhatsAppTemplate({
      to: phone,
      templateName: "confirmacao_narcacao",
      params: [clientName, formattedDate, formattedTime],
    });

    // ─────────────────────────────────────────────
    // Log interno (opcional)
    // ─────────────────────────────────────────────
    await db.from("message_log").insert({
      company_id: profile.company_id,
      direction: "outbound",
      customer_phone: phone,
      body: "TEMPLATE: confirmacao_narcacao",
      meta: {
        appointment_id: appointment.id,
        template: "confirmacao_narcacao",
      },
    });

    return NextResponse.json({
      ok: true,
      appointment_id: appointment.id,
    });
  } catch (e: any) {
    console.error(e);
    return new NextResponse(e?.message || "Erro interno", { status: 500 });
  }
}
