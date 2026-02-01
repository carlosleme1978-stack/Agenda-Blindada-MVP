import { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Use a stable Stripe API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // IMPORTANT: read raw body for signature verification
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Stripe webhook error:", err.message);
    return new Response("Webhook Error", { status: 400 });
  }

  const db = supabaseAdmin();

  // ---------- HELPERS ----------
  const activateBasic = async (companyId: string, customerId?: string) => {
    await db
      .from("companies")
      .update({
        plan: "basic",
        staff_limit: 1,
        sub_basic_status: "active",
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      })
      .eq("id", companyId);
  };

  const activateProAddon = async (companyId: string) => {
    // PRO is an ADD-ON: never disable BASIC here
    await db
      .from("companies")
      .update({
        plan: "pro",
        staff_limit: 5,
        sub_pro_status: "active",
      })
      .eq("id", companyId);
  };

  const downgradeToBasic = async (companyId: string) => {
    await db
      .from("companies")
      .update({
        plan: "basic",
        staff_limit: 1,
        sub_pro_status: "inactive",
      })
      .eq("id", companyId);
  };

  const blockAll = async (companyId: string) => {
    // Used ONLY when BASIC fails
    await db
      .from("companies")
      .update({
        plan: "basic",
        staff_limit: 0,
        sub_basic_status: "inactive",
        sub_pro_status: "inactive",
      })
      .eq("id", companyId);
  };

  // ---------- EVENTS ----------

  // Checkout finished (used for initial creation)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const companyId = session.metadata?.company_id;
    const plan = session.metadata?.plan;
    const customerId = session.customer as string | null;

    if (companyId && plan === "basic") {
      await activateBasic(companyId, customerId ?? undefined);
    }

    if (companyId && plan === "pro") {
      // PRO add-on activation
      await activateProAddon(companyId);
    }
  }

  // Subscription updated (covers renewals, status changes)
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;

    const { data: company } = await db
      .from("companies")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .single();

    if (!company) return new Response("OK", { status: 200 });

    const isActive = sub.status === "active";

    // Identify which product this subscription refers to by price lookup keys (recommended)
    const prices = sub.items.data.map((i) => i.price.lookup_key);

    if (prices.includes("basic_monthly_19")) {
      if (isActive) {
        await activateBasic(company.id);
      } else {
        await blockAll(company.id);
      }
    }

    if (prices.includes("pro_addon_monthly_8")) {
      if (isActive) {
        await activateProAddon(company.id);
      } else {
        await downgradeToBasic(company.id);
      }
    }
  }

  // Payment failed (invoice)
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;

    const { data: company } = await db
      .from("companies")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .single();

    if (!company) return new Response("OK", { status: 200 });

    // Determine which prices failed
    const failedPrices = invoice.lines.data.map(
      (l) => l.price?.lookup_key
    );

    if (failedPrices.includes("basic_monthly_19")) {
      // BASIC failed -> block everything
      await blockAll(company.id);
    } else if (failedPrices.includes("pro_addon_monthly_8")) {
      // PRO failed -> downgrade to BASIC
      await downgradeToBasic(company.id);
    }
  }

  // Subscription deleted (treat as failed)
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;

    const { data: company } = await db
      .from("companies")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .single();

    if (!company) return new Response("OK", { status: 200 });

    const prices = sub.items.data.map((i) => i.price.lookup_key);

    if (prices.includes("basic_monthly_19")) {
      await blockAll(company.id);
    }

    if (prices.includes("pro_addon_monthly_8")) {
      await downgradeToBasic(company.id);
    }
  }

  return new Response("OK", { status: 200 });
}
