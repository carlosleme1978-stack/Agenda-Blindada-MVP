import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Validates an access code WITHOUT consuming it.
 * Public endpoint used by /acesso.
 */
export async function POST(req: Request) {
  try {
    const { code } = (await req.json().catch(() => ({}))) as { code?: string };
    const accessCode = String(code ?? "").trim();

    if (!accessCode) {
      return NextResponse.json({ ok: false, error: "Digite o código de acesso." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("access_codes")
      .select("code,status,expires_at,company_name,plan,staff_limit")
      .eq("code", accessCode)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Código não encontrado." }, { status: 404 });
    }

    if (String(data.status).toUpperCase() !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Código já usado/expirado." }, { status: 403 });
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "Código expirado." }, { status: 403 });
    }

    // Return only what the UI might want to show.
    return NextResponse.json({ ok: true, data: { company_name: data.company_name, plan: data.plan, staff_limit: data.staff_limit } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro ao validar código" }, { status: 500 });
  }
}
