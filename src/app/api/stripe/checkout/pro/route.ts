import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

// Não instanciar Stripe no topo do módulo, senão quebra o build quando env não existe.
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "") return null;

  // Definir apiVersion é recomendado (evita mudanças silenciosas).
  return new Stripe(key, {
    apiVersion: "2024-06-20" as any,
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe disabled: missing STRIPE_SECRET_KEY" },
      { status: 501 }
    );
  }

  const { companyId } = await req.json();

  const price = process.env.STRIPE_PRICE_PRO_ADDON_8;
  if (!price || price.trim() === "") {
    return NextResponse.json(
      { error: "Stripe disabled: missing STRIPE_PRICE_PRO_ADDON_8" },
      { status: 501 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.trim() === "") {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // ⚠️ Importante: Stripe não suporta "mb_way" aqui como payment_method_types.
    // O correto é usar payment_method_types: ["card"] e configurar métodos no Dashboard,
    // ou usar payment_method_collection / automatic_payment_methods.
    // Para não quebrar o checkout, deixo "card" apenas por enquanto.
    payment_method_types: ["card"],

    line_items: [{ price, quantity: 1 }],

    success_url: `${appUrl}/dashboard?paid=pro`,
    cancel_url: `${appUrl}/dashboard`,

    metadata: {
      company_id: companyId,
      plan: "pro",
    },
  });

  return NextResponse.json({ url: session.url });
}
