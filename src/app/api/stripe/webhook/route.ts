import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function asText(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function getPlanFromPriceId(priceId: string): "basic" | "pro" {
  const basic = (process.env.STRIPE_PRICE_BASIC || "").trim();
  const pro = (process.env.STRIPE_PRICE_PRO || "").trim();
  if (pro && priceId === pro) return "pro";
  return "basic";
}

function toIsoFromStripeUnixSeconds(sec: any): string | null {
  // Stripe manda unix seconds (number). Tipagem pode variar dependendo do TS/Stripe version.
  if (!sec || typeof sec !== "number") return null;
  return new Date(sec * 1000).toISOString();
}

export async function POST(req: Request) {
  const stripe = getStripe();

  const h = await headers();
  const sig = h.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Webhook signature verification failed: ${
          err?.message ?? "unknown"
        }`,
      },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // --- Idempotência (Stripe pode reenviar o mesmo evento) ---
  // ✅ Fazemos a tentativa de INSERT primeiro. Se for duplicado (23505), retornamos ok.
  const { error: insertEventErr } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });

  if (insertEventErr) {
    // Duplicado (já processado)
    if ((insertEventErr as any).code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Outro erro (tabela ausente, permissão, etc.) => falha explícita
    return NextResponse.json(
      { error: insertEventErr.message || "Failed to log stripe event" },
      { status: 500 }
    );
  }

  async function setStripeEventCompanyId(companyId: string) {
    if (!companyId) return;
    // best-effort: não falha o webhook por isso
    await db.from("stripe_events").update({ company_id: companyId }).eq("id", event.id);
  }

  // Helpers para mapear subscription -> company
  async function findCompanyIdBySubscriptionId(subId: string): Promise<string> {
    if (!subId) return "";

    // 1) tenta billing_subscriptions (mais correto)
    const { data: bs } = await db
      .from("billing_subscriptions")
      .select("company_id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();

    if (bs?.company_id) return asText(bs.company_id);

    // 2) fallback: billing_accounts (se alguém gravou lá antes)
    const { data: ba } = await db
      .from("billing_accounts")
      .select("company_id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();

    return asText(ba?.company_id);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // OBS: No fluxo pay-first, pode não haver company_id ainda.
        // Se existir company_id na metadata, a gente já amarra o customer/subscription no billing_accounts.
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = (session.metadata || {}) as Record<string, string>;
        const companyId = asText(meta.company_id);

        const customerId = asText(session.customer);
        const subscriptionId = asText(session.subscription);

        if (companyId) {
          await setStripeEventCompanyId(companyId);
          // Atualiza billing_accounts com o vínculo (mesmo antes do subscription.updated)
          await db
            .from("billing_accounts")
            .update({
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || null,
              status: "active",
              staff_limit: 5,
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", companyId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as Stripe.Subscription;

        // Tipagem defensiva (resolve teu erro do TS):
        const subAny = sub as any;

        const subId = asText(subAny.id);
        const customerId = asText(subAny.customer);

        // Tenta achar price_id (pode estar em items.data[0].price.id)
        const priceId =
          asText(subAny.items?.data?.[0]?.price?.id) ||
          asText(subAny.items?.data?.[0]?.price) ||
          asText(subAny.metadata?.price_id);

        const status = asText(subAny.status);
        const currentPeriodEnd = toIsoFromStripeUnixSeconds(
          subAny.current_period_end
        );
        const cancelAtPeriodEnd = Boolean(subAny.cancel_at_period_end);

        // companyId via metadata (se você gravar) ou fallback por lookup no DB
        const meta = (subAny.metadata || {}) as Record<string, string>;
        let companyId = asText(meta.company_id);

        if (!companyId) {
          companyId = await findCompanyIdBySubscriptionId(subId);
        }

        // Se ainda não achou companyId, não temos como atualizar o SaaS agora (vai amarrar depois no signup finalize)
        if (!companyId) break;

        await setStripeEventCompanyId(companyId);

        const plan: "basic" | "pro" = getPlanFromPriceId(priceId);

        // 1) Upsert em billing_subscriptions
        // Se já existir, update; senão, insert.
        const { data: existingSub } = await db
          .from("billing_subscriptions")
          .select("company_id,stripe_subscription_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (existingSub?.stripe_subscription_id) {
          await db
            .from("billing_subscriptions")
            .update({
              company_id: companyId,
              stripe_subscription_id: subId,
              stripe_price_id: priceId || null,
              status: status || null,
              current_period_end: currentPeriodEnd,
              cancel_at_period_end: cancelAtPeriodEnd,
            })
            .eq("stripe_subscription_id", subId);
        } else {
          await db.from("billing_subscriptions").insert({
            company_id: companyId,
            stripe_subscription_id: subId,
            stripe_price_id: priceId || null,
            status: status || null,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
          });
        }

        // 2) Atualiza billing_accounts (estado atual)
        const isActive = status === "active" || status === "trialing";
        const isBad =
          event.type === "customer.subscription.deleted" ||
          status === "canceled" ||
          status === "unpaid" ||
          status === "incomplete_expired" ||
          status === "incomplete" ||
          status === "past_due";

        const nextAccountStatus = isActive ? "active" : isBad ? "inactive" : status;

        await db
          .from("billing_accounts")
          .update({
            plan: plan,
            status: asText(nextAccountStatus) || null,
            staff_limit: isActive ? 5 : 0,
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subId || null,
            stripe_price_id: priceId || null,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId);

        break;
      }

      case "invoice.payment_failed": {
        // Marcar como inativo para bloquear acesso
        const invoice = event.data.object as Stripe.Invoice;
        const subId = asText((invoice as any).subscription);

        if (!subId) break;

        const companyId = await findCompanyIdBySubscriptionId(subId);
        if (!companyId) break;

        await setStripeEventCompanyId(companyId);

        await db
          .from("billing_accounts")
          .update({
            status: "inactive",
            staff_limit: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId);

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Webhook handler error" },
      { status: 500 }
    );
  }
}