import { NextResponse } from "next/server";
import { getAuthContext } from "@/server/auth";
import { sendWhatsApp } from "@/lib/whatsapp/send";

type Body = { appointment_id?: string };

export async function POST(req: Request) {
  try {
    const { supabase, companyId } = await getAuthContext(req);

    const body = (await req.json().catch(() => ({}))) as Body;
    const appointmentId = (body.appointment_id || "").trim();

    if (!appointmentId) {
      return NextResponse.json({ error: "appointment_id obrigatório" }, { status: 400 });
    }

    // buscar appointment + telefone do cliente
    const { data: appt, error: qErr } = await supabase
      .from("appointments")
      .select("id,status,customers(phone),customer_name_snapshot")
      .eq("company_id", companyId)
      .eq("id", appointmentId)
      .single();

    if (qErr || !appt) {
      return NextResponse.json({ error: "Marcação não encontrada" }, { status: 404 });
    }

    if ((appt.status || "").toUpperCase() === "CANCELLED") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { error: upErr } = await supabase
      .from("appointments")
      .update({ status: "CANCELLED" })
      .eq("company_id", companyId)
      .eq("id", appointmentId);

    if (upErr) throw upErr;

    // WhatsApp opcional
    try {
      const phone = (appt as any).customers?.phone;
      const name = (appt as any).customer_name_snapshot;
      if (phone) {
        const text =
          `Olá${name ? `, ${name}` : ""}! Sua marcação foi cancelada.\n\n` +
          `Se quiser reagendar, responda com a data/horário desejado.`;
        await sendWhatsApp(phone, text);
      }
    } catch (e) {
      console.warn("WhatsApp send failed (ignored):", e);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("APPOINTMENTS/CANCEL ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Erro interno" },
      { status: 401 }
    );
  }
}
