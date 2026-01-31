import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";

/**
 * Meta Webhook Verification (GET)
 * Meta vai chamar com:
 * ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *
 * Deve responder 200 com o challenge em TEXTO PURO.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("WHATSAPP WEBHOOK POST:", JSON.stringify(body, null, 2));

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const message = value?.messages?.[0];
  if (!message?.text?.body || !message?.from) {
    return NextResponse.json({ ok: true });
  }

  const rawFrom: string = message.from; // geralmente vem só dígitos (sem +)
  const fromDigits = rawFrom.replace(/\D/g, "");
  const text = String(message.text.body).trim().toUpperCase();
  const waMessageId: string | undefined = message.id;

  const db = supabaseAdmin();

  // =========================
  // Idempotência: se já processamos esse message.id, não repetimos
  // =========================
  if (waMessageId) {
    const { data: existing } = await db
      .from("message_log")
      .select("id")
      .contains("meta", { wa_message_id: waMessageId })
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  // =========================
  // Log inbound (sempre)
  // =========================
  const insIn = await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: fromDigits,
    body: text,
    meta: {
      wa_message_id: waMessageId ?? null,
      raw: message,
    },
  });

  if (insIn.error) console.error("message_log inbound insert error:", insIn.error);

  // Só processa SIM / NÃO
  if (text !== "SIM" && text !== "NÃO") {
    return NextResponse.json({ ok: true });
  }

  // =========================
  // Encontrar customer pelo telefone
  // =========================
  const candidates = [fromDigits, `+${fromDigits}`];

  const { data: customer, error: custErr } = await db
    .from("customers")
    .select("id, phone")
    .in("phone", candidates)
    .limit(1)
    .maybeSingle();

  if (custErr || !customer) {
    console.error("Customer not found for phone:", fromDigits, custErr);
    return NextResponse.json({ ok: true });
  }

  // =========================
  // Última marcação BOOKED desse cliente
  // =========================
  const { data: appt, error: apptErr } = await db
    .from("appointments")
    .select("id,status")
    .eq("customer_id", customer.id)
    .eq("status", "BOOKED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (apptErr || !appt) {
    console.warn("No BOOKED appointment for customer:", customer.id, apptErr);
    return NextResponse.json({ ok: true });
  }

  const newStatus = text === "SIM" ? "CONFIRMED" : "CANCELLED";

  const up = await db.from("appointments").update({ status: newStatus }).eq("id", appt.id);
  if (up.error) console.error("appointments update error:", up.error);

  // =========================
  // Responder no WhatsApp + log outbound
  // =========================
  const reply =
    text === "SIM"
      ? "✅ Perfeito! Sua marcação foi confirmada. Obrigado."
      : "❌ Ok! Sua marcação foi cancelada. Se quiser remarcar, responda aqui.";

  try {
    await sendWhatsApp(fromDigits, reply);

    const insOut = await db.from("message_log").insert({
      direction: "outbound",
      customer_phone: fromDigits,
      body: reply,
      meta: {
        appointment_id: appt.id,
        in_reply_to: waMessageId ?? null,
      },
    });

    if (insOut.error) console.error("message_log outbound insert error:", insOut.error);
  } catch (e) {
    console.error("sendWhatsApp error:", e);
  }

  return NextResponse.json({ ok: true });
}
