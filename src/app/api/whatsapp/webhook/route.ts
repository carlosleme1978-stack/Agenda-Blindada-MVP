import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  const from = message.from;
  const text = message.text.body.trim().toUpperCase();

  const db = supabaseAdmin();

  // ✅ grava TODO inbound
  await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: from,
    body: text,
    meta: { raw: message },
  });

  // só processa SIM / NÃO
  if (text !== "SIM" && text !== "NÃO") {
    return NextResponse.json({ ok: true });
  }

  // ⚠️ ainda não filtra por telefone (corrigimos no próximo passo)
  const { data: appt } = await db
    .from("appointments")
    .select("id,status")
    .eq("status", "BOOKED")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!appt) {
    return NextResponse.json({ ok: true });
  }

  const newStatus = text === "SIM" ? "CONFIRMED" : "CANCELLED";

  await db.from("appointments").update({ status: newStatus }).eq("id", appt.id);

  return NextResponse.json({ ok: true });
}
