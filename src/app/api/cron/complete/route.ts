import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

/**
 * Marcações concluídas (best-effort):
 * - passa CONFIRMED/BOOKED -> COMPLETED quando end_time < now - 10min
 * Nota: requer que o enum appointment_status tenha o valor COMPLETED.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req as any);
  const limited = rateLimitOr429(req as any, { key: `cron_complete:` + ip, limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const admin = supabaseAdmin();
    const now = new Date();
    const cutoff = new Date(now.getTime() - 10 * 60_000);

    // Atualiza em lote
    const { data, error } = await admin
      .from("appointments")
      .update({ status: "COMPLETED" as any })
      .in("status", ["BOOKED", "CONFIRMED"])
      .lt("end_time", cutoff.toISOString())
      .select("id");

    if (error) {
      // se o enum não tiver COMPLETED, vai cair aqui
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, updated: (data ?? []).length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "erro" }, { status: 200 });
  }
}
