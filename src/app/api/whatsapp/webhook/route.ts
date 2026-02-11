import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { intent } from "@/lib/intent";
import { sendWhatsAppTextForCompany } from "@/lib/whatsapp/company";

export const dynamic = "force-dynamic";

function digits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function getTextFromPayload(body: any): { from: string | null; text: string | null; phoneNumberId: string | null } {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phoneNumberId = value?.metadata?.phone_number_id ?? null;

    const msg = value?.messages?.[0];
    const from = msg?.from ? digits(msg.from) : null;

    let text: string | null = null;
    if (msg?.text?.body) text = String(msg.text.body);
    else if (msg?.button?.text) text = String(msg.button.text);
    else if (msg?.interactive?.button_reply?.title) text = String(msg.interactive.button_reply.title);
    else if (msg?.interactive?.list_reply?.title) text = String(msg.interactive.list_reply.title);

    return { from, text, phoneNumberId };
  } catch {
    return { from: null, text: null, phoneNumberId: null };
  }
}

export async function GET(req: NextRequest) {
  // Verification (Meta)
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge) {
    if (token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse("OK", { status: 200 });
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  const { from, text, phoneNumberId } = getTextFromPayload(payload);

  if (!from || !text || !phoneNumberId) {
    return NextResponse.json({ ok: true });
  }

  const admin = supabaseAdmin();

  // 1) Identify company by phone_number_id
  const { data: company } = await admin
    .from("companies")
    .select("id,name,whatsapp_phone_number_id")
    .eq("whatsapp_phone_number_id", String(phoneNumberId))
    .maybeSingle();

  if (!company?.id) {
    // Unknown phone number id: ignore safely
    return NextResponse.json({ ok: true });
  }

  const companyId = company.id as string;

  // 2) Log inbound
  await admin.from("message_log").insert({
    company_id: companyId,
    direction: "in",
    customer_phone: from,
    body: text,
    meta: { phone_number_id: phoneNumberId },
  });

  // 3) Ensure customer exists
  const { data: cust } = await admin
    .from("customers")
    .upsert({ company_id: companyId, phone: from }, { onConflict: "company_id,phone" })
    .select("id,name")
    .single();

  const custId = cust?.id as string;

  // 4) Find latest relevant appointment
  const { data: appt } = await admin
    .from("appointments")
    .select("id,status,start_time")
    .eq("company_id", companyId)
    .eq("customer_id", custId)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const i = intent(text);

  if (!appt?.id) {
    await sendWhatsAppTextForCompany({ companyId, to: from, body: `Olá! Não encontrei nenhuma marcação no momento. Se deseja marcar, diga um dia e horário.` });
    return NextResponse.json({ ok: true });
  }

  if (i === "CONFIRM") {
    if (String(appt.status).toUpperCase() !== "CONFIRMED") {
      await admin.from("appointments").update({ status: "CONFIRMED" }).eq("id", appt.id).eq("company_id", companyId);
    }
    await sendWhatsAppTextForCompany({ companyId, to: from, body: `Perfeito ✅ Sua marcação está CONFIRMADA.` });
  } else if (i === "CANCEL") {
    if (String(appt.status).toUpperCase() !== "CANCELLED") {
      await admin.from("appointments").update({ status: "CANCELLED" }).eq("id", appt.id).eq("company_id", companyId);
    }
    await sendWhatsAppTextForCompany({ companyId, to: from, body: `Entendido ✅ Sua marcação foi CANCELADA. Se quiser reagendar, diga o dia/horário.` });
  } else {
    await sendWhatsAppTextForCompany({ companyId, to: from, body: `Para CONFIRMAR responda: SIM. Para CANCELAR responda: NÃO.` });
  }

  // 5) Log outbound (best effort)
  await admin.from("message_log").insert({
    company_id: companyId,
    direction: "out",
    customer_phone: from,
    body: "(auto-reply)",
    meta: { intent: i },
  });

  return NextResponse.json({ ok: true });
}
