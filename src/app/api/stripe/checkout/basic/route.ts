import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthContext } from "@/server/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  try {
    const { companyId } = await getAuthContext(req);

    const priceId = process.env.STRIPE_BASIC_PRICE_ID;
    if (!priceId) throw new Error("STRIPE_BASIC_PRICE_ID is missing");

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    const successUrl = process.env.STRIPE_SUCCESS_URL ?? `${origin}/dashboard/billing?success=1`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL ?? `${origin}/dashboard/billing?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { company_id: companyId, plan: "basic" },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("STRIPE CHECKOUT BASIC ERROR:", err);
    return NextResponse.json({ error: err?.message ?? "Erro no checkout" }, { status: 400 });
  }
}
