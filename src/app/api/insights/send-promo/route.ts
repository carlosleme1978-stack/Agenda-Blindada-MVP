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

    // Wire to WhatsApp sender later (endpoint ready).
    let sent = 0;

    return NextResponse.json({
      ok: true,
      sent,
      message: sent ? `Promoção enviada para ${sent} contatos.` : "Promoção preparada (envio ainda não configurado).",
      audience,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
