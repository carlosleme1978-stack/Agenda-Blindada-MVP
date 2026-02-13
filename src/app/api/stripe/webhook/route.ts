import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function asText(v: any) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function planFromEventSubscription(sub: Stripe.Subscription): 'basic' | 'pro' {
  const m = (sub.metadata || {}) as Record<string, string>;
  const p = (m.plan || '').toLowerCase();
  return p === 'pro' ? 'pro' : 'basic';
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const sig = (await headers()).get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message ?? 'unknown'}` }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Idempotency: store the event id (Stripe may retry delivery).
  const { data: existing } = await db.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  const { error: insertEventErr } = await db
  .from("stripe_events")
  .insert({ id: event.id, type: event.type });

// Se der erro (ex: duplicate key), ignoramos porque é só idempotência
// (o duplicate normalmente já foi tratado no SELECT acima)
if (insertEventErr) {
  // ignore
}

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // We generally finalize linking the paid session -> company on /api/auth/signup (pay-first flow).
        // Still, if the session has a company_id metadata (logged-in upgrade), we update company now.
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = (session.metadata || {}) as Record<string, string>;
        const companyId = asText(meta.company_id);

        const customerId = asText(session.customer);
        const subscriptionId = asText(session.subscription);

        if (companyId) {
          await db
            .from('companies')
            .update({
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || null,
              stripe_subscription_status: 'active',
            })
            .eq('id', companyId);
        }
        break;
      }
      
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        const meta = (sub.metadata || {}) as Record<string, string>;
        const companyId = asText(meta.company_id);
        const plan = planFromEventSubscription(sub);

        const status = asText(sub.status);
        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        const cancelAtPeriodEnd = !!sub.cancel_at_period_end;

        // Find company: metadata.company_id preferred, otherwise by subscription id.
        let targetCompanyId = companyId;
        if (!targetCompanyId) {
          const { data: row } = await db
            .from('companies')
            .select('id')
            .eq('stripe_subscription_id', sub.id)
            .maybeSingle();
          targetCompanyId = row?.id ?? '';
        }

        if (targetCompanyId) {
          const updates: any = {
            stripe_customer_id: asText(sub.customer) || null,
            stripe_subscription_id: sub.id,
            stripe_subscription_status: status,
            stripe_current_period_end: currentPeriodEnd,
            stripe_cancel_at_period_end: cancelAtPeriodEnd,
          };

          // Our business rule: paid plan => staff_limit = 5
          if (status === 'active' || status === 'trialing') {
            updates.plan = plan;
            updates.staff_limit = 5;
            if (plan === 'basic') updates.sub_basic_status = 'active';
            if (plan === 'pro') updates.sub_pro_status = 'active';
          }

          if (event.type === 'customer.subscription.deleted' || status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
            updates.sub_basic_status = 'inactive';
            updates.sub_pro_status = 'inactive';
          }

          await db.from('companies').update(updates).eq('id', targetCompanyId);
        }

        break;
      }

      case 'invoice.payment_failed': {
        // When a payment fails, you can block access by marking subscription inactive.
        const invoice = event.data.object as Stripe.Invoice;
        const subId = asText(invoice.subscription);
        if (subId) {
          await db
            .from('companies')
            .update({ stripe_subscription_status: 'past_due', sub_basic_status: 'inactive', sub_pro_status: 'inactive' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Webhook handler error' }, { status: 500 });
  }
}
