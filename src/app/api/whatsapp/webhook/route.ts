import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("WHATSAPP WEBHOOK POST:", JSON.stringify(body, null, 2));

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const message = value?.messages?.[0];
  if (!message?.text?.body) {
    return NextResponse.json({ ok: true });
  }

  const from = message.from; // telefone sem +
  const text = message.text.body.trim().toUpperCase();

  if (text !== "SIM" && text !== "NÃO") {
    return NextResponse.json({ ok: true });
  }

  const db = supabaseAdmin();

  // última marcação BOOKED desse telefone
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

  await db
    .from("appointments")
    .update({ status: newStatus })
    .eq("id", appt.id);

  await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: from,
    body: text,
    meta: { appointment_id: appt.id },
  });

  return NextResponse.json({ ok: true });
}

