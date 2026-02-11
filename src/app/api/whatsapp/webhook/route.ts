import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { intent } from "@/lib/intent";
import { sendWhatsApp } from "@/lib/whatsapp/send";

function digits(x: string) {
  return String(x || "").replace(/\D/g, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();

  const payload = (await req.json().catch(() => ({}))) as any;

  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");

    const msg = value?.messages?.[0];
    if (!msg) return NextResponse.json({ ok: true });

    const from = digits(String(msg?.from ?? ""));
    const text = String(msg?.text?.body ?? "").trim();

    if (!from || !text) return NextResponse.json({ ok: true });

    // Resolve company by whatsapp_phone_number_id; fallback to env phone id
    let companyId: string | null = null;
    if (phoneNumberId) {
      const r = await admin.from("companies").select("id").eq("whatsapp_phone_number_id", phoneNumberId).maybeSingle();
      companyId = r.data?.id ?? null;
    }
    if (!companyId) {
      // single-tenant fallback (MVP)
      const r = await admin.from("companies").select("id").limit(1).maybeSingle();
      companyId = r.data?.id ?? null;
    }
    if (!companyId) return NextResponse.json({ ok: true });

    // Log inbound
    await admin.from("message_log").insert({
      company_id: companyId,
      direction: "in",
      customer_phone: from,
      body: text,
      meta: { wa: msg },
    });

    const i = intent(text);
    if (i === "UNKNOWN") {
      await sendWhatsApp(from, "Recebi sua mensagem ✅\n\nResponda com:\n- SIM (para confirmar)\n- NÃO (para cancelar)");
      return NextResponse.json({ ok: true });
    }

    // Find next appointment for this customer
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", from)
      .maybeSingle();

    if (!customer?.id) {
      await sendWhatsApp(from, "Não encontrei marcações para este número. Se quiser, peça NOVA MARCAÇÃO.");
      return NextResponse.json({ ok: true });
    }

    const now = new Date().toISOString();

    const { data: appt } = await admin
      .from("appointments")
      .select("id,status,start_time")
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .in("status", ["BOOKED", "CONFIRMED"])
      .gte("start_time", now)
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!appt?.id) {
      await sendWhatsApp(from, "Ok ✅\n\nNo momento não tenho uma marcação futura pendente para confirmar/cancelar.");
      return NextResponse.json({ ok: true });
    }

    if (i === "CONFIRM") {
      await admin.from("appointments").update({ status: "CONFIRMED" }).eq("id", appt.id).eq("company_id", companyId);
      await sendWhatsApp(from, "Perfeito ✅\nSua marcação foi CONFIRMADA.");
      await admin.from("message_log").insert({ company_id: companyId, direction: "out", customer_phone: from, body: "CONFIRMED", meta: { appt_id: appt.id } });
    }

    if (i === "CANCEL") {
      await admin.from("appointments").update({ status: "CANCELLED" }).eq("id", appt.id).eq("company_id", companyId);
      await sendWhatsApp(from, "Entendido ✅\nSua marcação foi CANCELADA. Se quiser reagendar, responda: NOVA MARCAÇÃO.");
      await admin.from("message_log").insert({ company_id: companyId, direction: "out", customer_phone: from, body: "CANCELLED", meta: { appt_id: appt.id } });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Keep WhatsApp from retry storm: always 200
    return NextResponse.json({ ok: true });
  }
}
