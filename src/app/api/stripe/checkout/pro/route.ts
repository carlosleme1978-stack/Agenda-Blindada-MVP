import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthContext } from "@/server/auth";

export async function POST(req: Request) {
  try {
    const { companyId } = await getAuthContext(req);

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    const successUrl = process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/dashboard/billing";
    const cancelUrl = process.env.STRIPE_CANCEL_URL || "http://localhost:3000/dashboard/billing";

    if (!stripeKey) throw new Error("Missing STRIPE_SECRET_KEY");
    if (!priceId) throw new Error("Missing STRIPE_PRO_PRICE_ID");

    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { company_id: companyId, plan: "pro" },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("STRIPE/CHECKOUT PRO ERROR:", err);
    return NextResponse.json({ error: err?.message || "Erro" }, { status: 400 });
  }
}
