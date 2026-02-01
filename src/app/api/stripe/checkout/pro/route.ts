import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


export async function POST(req: NextRequest) {
  const { companyId } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card", "mb_way"],
    line_items: [
      {
        price: process.env.STRIPE_PRICE_PRO_ADDON_8!,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?paid=pro`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    metadata: {
      company_id: companyId,
      plan: "pro",
    },
  });

  return NextResponse.json({ url: session.url });
}
