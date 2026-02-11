import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Internal endpoint (optional). Not used by the UI in production.
 * To prevent abuse, this requires header: x-access-consume-secret
 * matching env ACCESS_CODES_CONSUME_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.ACCESS_CODES_CONSUME_SECRET;
  const header = req.headers.get("x-access-consume-secret") ?? "";

  // If no secret is configured, hide the endpoint.
  if (!secret || header !== secret) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const { code, user_id } = (await req.json().catch(() => ({}))) as { code?: string; user_id?: string };
    const accessCode = String(code ?? "").trim();
    const userId = String(user_id ?? "").trim();

    if (!accessCode || !userId) {
      return NextResponse.json({ ok: false, error: "code e user_id são obrigatórios" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const iso = new Date().toISOString();

    const { data, error } = await admin
      .from("access_codes")
      .update({ status: "USED", used_by_user_id: userId, used_at: iso })
      .eq("code", accessCode)
      .eq("status", "ACTIVE")
      .or(`expires_at.is.null,expires_at.gt.${iso}`)
      .select("code,status")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Não foi possível consumir o código" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro" }, { status: 500 });
  }
}
