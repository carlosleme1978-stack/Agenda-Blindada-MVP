import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(req: Request) {
  // Por enquanto só confirma recebimento.
  // (Na próxima etapa vamos roteá-lo por empresa e atualizar status da marcação.)
  const body = await req.json().catch(() => null);
  console.log("WHATSAPP WEBHOOK:", JSON.stringify(body));
  return NextResponse.json({ ok: true }, { status: 200 });
}
