import { NextResponse } from "next/server";

/**
 * Body:
 * { title: string; message: string; audience: "inactive_30" | "all_recent" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const audience = String(body?.audience ?? "inactive_30");

    if (!message) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    // Optional: if your project has a WhatsApp sender module, wire it here.
    let sent = 0;
    try {
      const mod: any = await import("@/lib/whatsapp/send").catch(() => null);
      if (mod?.sendPromoToAudience) {
        sent = await mod.sendPromoToAudience({ message, audience });
      }
    } catch {
      // noop
    }

    return NextResponse.json({
      ok: true,
      sent,
      message: sent ? `Promoção enviada para ${sent} contatos.` : "Promoção preparada (envio ainda não configurado).",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
