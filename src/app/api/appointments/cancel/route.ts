import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}

export async function POST(req: Request) {
  try {
    const token = bearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (pErr || !profile?.company_id) {
      return NextResponse.json({ error: "Usuário sem empresa" }, { status: 400 });
    }
    const companyId = profile.company_id as string;

    const body = (await req.json().catch(() => ({}))) as { appointmentId?: string; appointment_id?: string };
    const appointmentId = String(body.appointmentId ?? body.appointment_id ?? "");
    if (!appointmentId) {
      return NextResponse.json({ error: "appointmentId é obrigatório" }, { status: 400 });
    }

    // Fetch appointment + customer phone
    const { data: appt, error: aSelErr } = await admin
      .from("v_appointments_dashboard")
      .select("id, company_id, customer_phone, customer_name, start_time")
      .eq("id", appointmentId)
      .maybeSingle();

    if (aSelErr || !appt) {
      return NextResponse.json({ error: aSelErr?.message ?? "Marcação não encontrada" }, { status: 404 });
    }
    if ((appt as any).company_id !== companyId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { error: updErr } = await admin
      .from("appointments")
      .update({ status: "CANCELLED" })
      .eq("id", appointmentId)
      .eq("company_id", companyId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // Log + notify (best-effort)
    try {
      const phone = String((appt as any).customer_phone ?? "");
      if (phone) {
        const when = new Date(String((appt as any).start_time)).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
        const msg = `Sua marcação (${when}) foi cancelada.\n\nSe quiser reagendar, responda aqui com: \n- NOVA MARCAÇÃO`;
        await sendWhatsApp(phone, msg);

        await admin.from("message_log").insert({
          company_id: companyId,
          direction: "out",
          customer_phone: phone,
          body: msg,
          meta: { kind: "cancel" },
        });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
