import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;
    const { appointment_id } = (await req.json().catch(() => ({}))) as { appointment_id?: string };
    const appointmentId = String(appointment_id ?? "").trim();
    if (!appointmentId) return NextResponse.json({ error: "appointment_id obrigatório" }, { status: 400 });

    const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).single();
    const companyId = prof?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });

    const { data: appt, error: aErr } = await admin
      .from("appointments")
      .update({ status: "CANCELLED" })
      .eq("id", appointmentId)
      .eq("company_id", companyId)
      .select("id,customer_id")
      .single();

    if (aErr || !appt) return NextResponse.json({ error: aErr?.message ?? "Falha ao cancelar" }, { status: 400 });

    // get customer phone
    const { data: cust } = await admin.from("customers").select("phone,name").eq("id", appt.customer_id).single();

    // send whatsapp best effort
    try {
      const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
      const name = cust?.name ? ` ${cust.name}` : "";
      if (cust?.phone) {
        await sendWhatsAppTextForCompany({ companyId, to: cust.phone, body: `Olá${name}! Sua marcação foi cancelada. Se quiser reagendar, responda aqui com a data/horário desejado.` });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
