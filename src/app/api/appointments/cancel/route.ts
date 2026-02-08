import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import { SCHEDULE_CONFIG } from "@/config/schedule";

// ⚠️ ajuste este import para o seu helper server, caso o nome seja diferente
import { createClient as createServerClient } from "@/lib/supabase/server";

const TZ = "Europe/Lisbon";

function formatPtLisbon(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-PT", { timeZone: TZ });
  const time = d.toLocaleTimeString("pt-PT", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

async function getCompanyIdFromProfiles(uid: string) {
  // mesmo “fallback trio” que você usou no dashboard
  {
    const r = await supabaseAdmin.from("profiles").select("company_id").eq("id", uid).maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  {
    const r = await supabaseAdmin.from("profiles").select("company_id").eq("uid", uid).maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  {
    const r = await supabaseAdmin.from("profiles").select("company_id").eq("user_id", uid).maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const appointment_id = String(body?.appointment_id || "").trim();
    if (!appointment_id) {
      return NextResponse.json({ error: "appointment_id é obrigatório" }, { status: 400 });
    }

    // ✅ autentica o dono (server client com cookies)
    const supabase = await createServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const companyId = await getCompanyIdFromProfiles(uid);
    if (!companyId) {
      return NextResponse.json({ error: "User sem company (profiles.company_id)" }, { status: 400 });
    }

    // ✅ busca a marcação e garante que é da empresa do dono
    const apptRes = await supabaseAdmin
      .from("appointments")
      .select(
        `
        id,
        company_id,
        start_time,
        status,
        customer_id,
        customer_name_snapshot,
        customers ( name, phone )
      `
      )
      .eq("id", appointment_id)
      .maybeSingle();

    if (apptRes.error) {
      return NextResponse.json({ error: apptRes.error.message }, { status: 500 });
    }
    if (!apptRes.data) {
      return NextResponse.json({ error: "Marcação não encontrada" }, { status: 404 });
    }
    if (apptRes.data.company_id !== companyId) {
      return NextResponse.json({ error: "Sem permissão para cancelar esta marcação" }, { status: 403 });
    }

    // ✅ já está cancelada?
    const rawStatus = String(apptRes.data.status || "").toUpperCase();
    if (rawStatus.includes("CANC")) {
      return NextResponse.json({ ok: true, already_cancelled: true });
    }

    // ✅ cancela no Supabase
    const upd = await supabaseAdmin
      .from("appointments")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment_id);

    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }

    // ✅ manda WhatsApp de reagendar
    const displayName =
      (apptRes.data.customer_name_snapshot || "").trim() ||
      (apptRes.data.customers?.name || "").trim() ||
      "Cliente";

    const phone = (apptRes.data.customers?.phone || "").trim();
    if (phone) {
      const { date, time } = formatPtLisbon(apptRes.data.start_time);

      // Se você já tem link público de marcação no config, usa ele.
      // Ajuste o campo abaixo conforme seu config real.
      const bookingLink =
        (SCHEDULE_CONFIG as any)?.booking_url ||
        (SCHEDULE_CONFIG as any)?.public_booking_url ||
        "";

      const msg =
        `Olá ${displayName}! 😊\n\n` +
        `A sua marcação de ${date} às ${time} foi cancelada pelo estabelecimento.\n\n` +
        `Para reagendar, responda *REAGENDAR* aqui no WhatsApp` +
        (bookingLink ? ` ou clique no link: ${bookingLink}` : "") +
        `\n\nObrigado!`;

      // ⚠️ Ajuste as chaves (to/body) se o seu sendWhatsApp usar outro formato
      await sendWhatsApp({ to: phone, body: msg });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
