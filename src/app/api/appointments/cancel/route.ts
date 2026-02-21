import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

function toDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `appt_cancel:` + ip, limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;
    const body = (await req.json().catch(() => ({}))) as { appointment_id?: string; appointmentId?: string };
    const appointmentId = String(body.appointmentId ?? body.appointment_id ?? "").trim();
    if (!appointmentId) return NextResponse.json({ error: "appointment_id obrigatório" }, { status: 400 });

    // Modelo SaaS: usa company_id sempre
    const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId = (prof as any)?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "Sem company" }, { status: 400 });

    // cancela e pega dados úteis
    const { data: appt, error: aErr } = await admin
      .from("appointments")
      .update({ status: "CANCELLED", status_v2: "CANCELLED" })
      .eq("id", appointmentId)
      .eq("company_id", companyId)
      .select("id,customer_id,start_time")
      .single();

    if (aErr || !appt) return NextResponse.json({ error: aErr?.message ?? "Falha ao cancelar" }, { status: 400 });

    const { data: cust } = await admin.from("customers").select("phone,name").eq("id", appt.customer_id).single();
    const phone = toDigits(cust?.phone || "");
    const name = cust?.name ? ` ${cust.name}` : "";

    let waSent = false;
    let waError: string | null = null;

    // idempotência: evita mandar cancel 2x
    try {
      const { error: insErr } = await admin.from("message_deliveries").insert({
        company_id: companyId,
        appointment_id: appt.id,
        type: "cancel",
      });

      if (insErr && (insErr as any).code !== "23505") throw insErr;

      // se duplicado, não envia de novo
      if (insErr && (insErr as any).code === "23505") {
        return NextResponse.json({ ok: true, whatsapp: "skipped_duplicate" });
      }
    } catch (e: any) {
      // Se a tabela não existir ainda, não bloqueia o cancelamento, mas seguimos
    }

    // Envia WhatsApp (e loga)
    if (phone) {
      const msg = `Olá${name}! Sua marcação foi cancelada. Se quiser reagendar, responda aqui com a data/horário desejado.`;
      try {
        const { sendWhatsAppTextForCompany } = await import("@/lib/whatsapp/company");
        await sendWhatsAppTextForCompany(companyId, phone, msg);
        waSent = true;

        await admin.from("message_log").insert({
          company_id: companyId,
          direction: "out",
          customer_phone: phone,
          body: msg,
          meta: { type: "cancel", appointment_id: appt.id },
        });
      } catch (e: any) {
        waError = e?.message ?? "WhatsApp send failed";
        // registra tentativa no log
        try {
          await admin.from("message_log").insert({
            company_id: companyId,
            direction: "out",
            customer_phone: phone,
            body: msg,
            meta: { type: "cancel", appointment_id: appt.id, error: waError },
          });
        } catch {}
      }
    } else {
      waError = "Cliente sem telefone";
    }

    return NextResponse.json({ ok: true, whatsapp_sent: waSent, whatsapp_error: waError });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
