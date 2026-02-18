import { NextResponse } from "next/server";

/**
 * Body:
 * { message: string; audience: "inactive_30" | "all_recent" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const audience = String(body?.audience ?? "inactive_30");

    if (!message) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

    // Endpoint ready. Wire to WhatsApp sender later.
    return NextResponse.json({
      ok: true,
      sent: 0,
      audience,
      message: "Promoção preparada (envio ainda não configurado).",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
