import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe env missing" }, { status: 400 });
  }

  const stripe = new Stripe(stripeKey);

  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();

    // marca assinatura ativa/inativa com base no metadata
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = String(session.metadata?.company_id || "");
      const plan = String(session.metadata?.plan || "");

      if (companyId && (plan === "basic" || plan === "pro")) {
        const patch: any = {
          plan,
          sub_basic_status: plan === "basic" ? "active" : "inactive",
          sub_pro_status: plan === "pro" ? "active" : "inactive",
        };

        await admin.from("companies").update(patch).eq("id", companyId);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = String((sub as any).metadata?.company_id || "");
      if (companyId) {
        await admin
          .from("companies")
          .update({ sub_basic_status: "inactive", sub_pro_status: "inactive" })
          .eq("id", companyId);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
