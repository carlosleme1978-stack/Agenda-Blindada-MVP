import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppTextForCompany } from "@/lib/whatsapp/company";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const from = String(body?.from ?? "").replace(/\D/g, "");
    const message = String(body?.body ?? "").trim().toLowerCase();
    const companyId = String(body?.companyId ?? "").trim();

    if (!from || !companyId) {
      return NextResponse.json({ ok: true });
    }

    const admin = supabaseAdmin();

    // Buscar última marcação desse telefone
    const { data: appt } = await admin
      .from("appointments")
      .select("id,status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!appt?.id) {
      await sendWhatsAppTextForCompany(
        companyId,
        from,
        `Olá! Não encontrei nenhuma marcação no momento. Se deseja marcar, diga um dia e horário.`
      );

      return NextResponse.json({ ok: true });
    }

    // CONFIRMAR
    if (message === "sim") {
      await admin
        .from("appointments")
        .update({ status: "CONFIRMED" })
        .eq("id", appt.id);

      await sendWhatsAppTextForCompany(
        companyId,
        from,
        `Perfeito! Sua marcação foi confirmada ✅`
      );

      return NextResponse.json({ ok: true });
    }

    // CANCELAR
    if (message === "não" || message === "nao") {
      await admin
        .from("appointments")
        .update({ status: "CANCELLED" })
        .eq("id", appt.id);

      await sendWhatsAppTextForCompany(
        companyId,
        from,
        `Sua marcação foi cancelada. Se desejar reagendar, envie nova data e horário.`
      );

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
