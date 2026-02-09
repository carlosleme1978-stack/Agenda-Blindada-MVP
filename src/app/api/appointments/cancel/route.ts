import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserFromAuthHeader } from "@/lib/supabase/user";

/**
 * Cancelamento de marcação (dashboard/admin).
 *
 * FIX do erro:
 *   operator does not exist: appointment_status ~~* unknown
 * Esse erro acontece quando alguém tenta usar ILIKE/ilike em coluna ENUM (appointment_status).
 * Aqui NÃO usamos ilike no status. Atualizamos por igualdade/in.
 */
export async function POST(req: Request) {
  try {
    // ─────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────
    const u = await getUserFromAuthHeader(req.headers.get("authorization"));
    if (!u?.user) return new NextResponse("Sem autorização", { status: 401 });

    // ─────────────────────────────────────────────
    // Input
    // ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const appointmentId: string | undefined =
      body.appointmentId || body.appointment_id || body.id;

    if (!appointmentId) {
      return new NextResponse("appointmentId em falta", { status: 400 });
    }

    const db = supabaseAdmin();

    // ─────────────────────────────────────────────
    // Company do user (compatível com 3 schemas)
    // ─────────────────────────────────────────────
    let company_id: string | null = null;

    {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("id", u.user.id)
        .maybeSingle();
      if (r.data?.company_id) company_id = r.data.company_id;
    }

    if (!company_id) {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("uid", u.user.id)
        .maybeSingle();
      if (r.data?.company_id) company_id = r.data.company_id;
    }

    if (!company_id) {
      const r = await db
        .from("profiles")
        .select("company_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (r.data?.company_id) company_id = r.data.company_id;
    }

    if (!company_id) {
      return new NextResponse("User sem company", { status: 400 });
    }

    // ─────────────────────────────────────────────
    // Cancelar (sem ilike em ENUM)
    // ─────────────────────────────────────────────
    // Só permite cancelar estados "ativos"
    const { data: appt, error: updErr } = await db
      .from("appointments")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_by: u.user.id,
      })
      .eq("company_id", company_id)
      .eq("id", appointmentId)
      .in("status", ["BOOKED", "CONFIRMED", "PENDING"])
      .select("id, status")
      .maybeSingle();

    if (updErr) {
      return new NextResponse(updErr.message, { status: 400 });
    }

    if (!appt) {
      // Pode ser: não existe, não pertence à empresa, ou já estava cancelado/finalizado
      return new NextResponse("Marcação não encontrada ou não cancelável", {
        status: 404,
      });
    }

    return NextResponse.json({ ok: true, appointment: appt });
  } catch (e: any) {
    console.error(e);
    return new NextResponse(e?.message || "Erro interno", { status: 500 });
  }
}
