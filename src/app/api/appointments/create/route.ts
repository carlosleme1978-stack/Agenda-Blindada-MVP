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
    const u = await getUserFromAuthHeader(
      req.headers.get("authorization")
    );
    if (!u?.user) {
      return new NextResponse("Sem autorização", { status: 401 });
    }

    // ─────────────────────────────────────────────
    // Input
    // ─────────────────────────────────────────────
    const {
      customerPhone,
      customerName,
      startISO,
      durationMinutes,
    } = await req.json();

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
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return new NextResponse("User sem company", { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Customer (upsert)
    // ─────────────────────────────────────────────
    const { data: customer, error: custErr } = await db
      .from("customers")
      .upsert(
        {
          company_id: profile.company_id,
          phone,
          name: customerName || null,
          consent_whatsapp: true,
        },
        { onConflict: "company_id,phone" }
      )
      .select("id, phone, name")
      .single();

    if (custErr) {
      return new NextResponse(custErr.message, { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Appointment
    // ─────────────────────────────────────────────
    const { data: appointment, error: apptErr } = await db
      .from("appointments")
      .insert({
        company_id: profile.company_id,
        customer_id: customer.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
      })
      .select("id, start_time")
      .single();

    if (apptErr) {
      return new NextResponse(apptErr.message, { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Template variables
    // ─────────────────────────────────────────────
    const clientName = customer.name || "Cliente";

    const formattedDate = new Date(
      appointment.start_time
    ).toLocaleDateString("pt-PT", {
      timeZone: "Europe/Lisbon",
    });

    const formattedTime = new Date(
      appointment.start_time
    ).toLocaleTimeString("pt-PT", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      minute: "2-digit",
    });

    // ─────────────────────────────────────────────
    // SEND TEMPLATE (ÚNICA FORMA CORRETA)
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
    return new NextResponse(
      e?.message || "Erro interno",
      { status: 500 }
    );
  }
}

