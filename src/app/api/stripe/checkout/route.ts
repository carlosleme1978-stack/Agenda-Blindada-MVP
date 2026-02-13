import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function priceIdForPlan(plan: "basic" | "pro") {
  if (plan === "basic") return process.env.STRIPE_PRICE_BASIC!;
  return process.env.STRIPE_PRICE_PRO!;
}

function staffLimitForPlan(plan: "basic" | "pro") {
  return plan === "basic" ? 1 : 5;
}

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new NextResponse("Missing token", { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return new NextResponse("Invalid token", { status: 401 });

    const userId = userRes.user.id;

    const { plan } = (await req.json().catch(() => ({}))) as { plan?: "basic" | "pro" };
    const chosenPlan = plan === "pro" ? "pro" : "basic";

    // pega company_id e role
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profErr || !prof?.company_id) return new NextResponse("Profile/company not found", { status: 400 });
    if (!["owner", "admin", "manager"].includes(String(prof.role))) {
      return new NextResponse("Only owner/admin/manager can subscribe", { status: 403 });
    }

    const companyId = String(prof.company_id);

    // garante billing_accounts existe (se não existir)
    const { data: ba } = await admin
      .from("billing_accounts")
      .select("stripe_customer_id, plan")
      .eq("company_id", companyId)
      .maybeSingle();

    let stripeCustomerId = ba?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { company_id: companyId },
      });
      stripeCustomerId = customer.id;

      await admin.from("billing_accounts").upsert({
        company_id: companyId,
        stripe_customer_id: stripeCustomerId,
        plan: "basic",
        status: "trialing",
        staff_limit: 1,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceIdForPlan(chosenPlan), quantity: 1 }],
      success_url: `${appUrl}/billing?success=1`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      metadata: {
        company_id: companyId,
        plan: chosenPlan,
        staff_limit: String(staffLimitForPlan(chosenPlan)),
      },
      subscription_data: {
        metadata: {
          company_id: companyId,
          plan: chosenPlan,
          staff_limit: String(staffLimitForPlan(chosenPlan)),
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}