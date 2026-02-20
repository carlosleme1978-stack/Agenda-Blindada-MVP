import { NextResponse } from "next/server";
import { sendWhatsAppTextForCompany } from "@/lib/whatsapp/company";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    await sendWhatsAppTextForCompany(
      body.companyId,
      body.to,
      body.message
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}