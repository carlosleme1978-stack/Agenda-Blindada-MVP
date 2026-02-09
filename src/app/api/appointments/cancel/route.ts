import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserFromAuthHeader } from "@/lib/supabase/user";

export async function POST(req: Request) {
  try {
    // ─────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────
    const u = await getUserFromAuthHeader(req.headers.get("authorization"));
    if (!u?.user) {
      return NextResponse.json(
        { error: "Sem autorização" },
        { status: 401 }
      );
    }

    // ─────────────────────────────────────────────
    // Input (aceita appointmentId ou appointment_id)
    // ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const appointmentId =
      body.appointmentId || body.appointment_id || body.id;

    if (!appointmentId) {
      return NextResponse.json(
        { error: "appointmentId em falta" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // ─────────────────────────────────────────────
    // Company do user (compatível com variações)
    // ─────────────────────────────────────────────
    let companyId: string | null = null;

    for (const key of ["id", "uid", "user_id"]) {
      const { data } = await db
        .from("profiles")
        .select("company_id")
        .eq(key, u.user.id)
        .maybeSingle();

      if (data?.company_id) {
        companyId = data.company_id;
        break;
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "User sem company" },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────
    // Cancelamento (SEM ILIKE em ENUM)
    // ─────────────────────────────────────────────
    const { data: appt, error } = await db
      .from("appointments")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_by: u.user.id,
      })
      .eq("company_id", companyId)
      .eq("id", appointmentId)
      .in("status", ["BOOKED", "CONFIRMED", "PENDING"])
      .select("id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (!appt) {
      return NextResponse.json(
        { error: "Marcação não encontrada ou não cancelável" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, appointment: appt });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
