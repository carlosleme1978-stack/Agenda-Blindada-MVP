import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!,);

function mapPlanFromPrice(priceId?: string | null): { plan: "basic" | "pro"; staff_limit: number } {
  if (priceId === process.env.STRIPE_PRICE_PRO) return { plan: "pro", staff_limit: 5 };
  return { plan: "basic", staff_limit: 1 };
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing stripe-signature", { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const admin = supabaseAdmin();

  try {
    // helper para atualizar billing
    const upsertFromSub = async (sub: Stripe.Subscription) => {
      const companyId =
        String(sub.metadata?.company_id || "") ||
        String((sub.customer as any)?.metadata?.company_id || "");

      if (!companyId) return;

      const priceId = sub.items.data[0]?.price?.id ?? null;
      const { plan, staff_limit } = mapPlanFromPrice(priceId);

      await admin.from("billing_accounts").upsert({
        company_id: companyId,
        stripe_customer_id: String(sub.customer),
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        plan,
        staff_limit,
        status: sub.status, // Stripe status -> nosso enum (active/trialing/past_due/canceled/incomplete)
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      });

      await admin.from("billing_subscriptions").insert({
        company_id: companyId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        status: sub.status as any,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      });
    };

    switch (event.type) {
      case "checkout.session.completed": {
        // opcional: nada obrigatório aqui se subscription events estão ativos
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertFromSub(sub);
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = String(inv.subscription || "");
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertFromSub(sub);
        }
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = String(inv.subscription || "");
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertFromSub(sub);
        }
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Webhook handler error", { status: 500 });
  }
}