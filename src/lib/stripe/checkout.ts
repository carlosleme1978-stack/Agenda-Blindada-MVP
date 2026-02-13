import { getStripe, getAppUrl, getPriceId } from '@/lib/stripe/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { NextResponse, type NextRequest } from 'next/server';

export async function createCheckoutSession(request: NextRequest, plan: 'basic' | 'pro') {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    companyName?: string;
  };

  // If user is logged in, we create/attach a customer to the existing company.
  const { supabase } = createSupabaseRouteClient(request);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  let customer: string | undefined;
  let companyId: string | undefined;

  if (user) {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    companyId = profile?.company_id ?? undefined;

    if (companyId) {
      const { data: company } = await admin
        .from('companies')
        .select('stripe_customer_id')
        .eq('id', companyId)
        .maybeSingle();

      if (company?.stripe_customer_id) {
        customer = company.stripe_customer_id;
      } else {
        const cust = await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: {
            company_id: companyId,
            user_id: user.id,
          },
        });
        customer = cust.id;
        await admin.from('companies').update({ stripe_customer_id: customer }).eq('id', companyId);
      }
    }
  }

  const successUrlLogged = `${appUrl}/dashboard/billing?success=1`;
  const cancelUrlLogged = `${appUrl}/dashboard/billing?canceled=1`;

  const successUrlNew = `${appUrl}/signup?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrlNew = `${appUrl}/planos?canceled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: getPriceId(plan), quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        plan,
        flow: user ? 'upgrade' : 'new',
        ...(companyId ? { company_id: companyId } : {}),
        ...(user ? { user_id: user.id } : {}),
      },
    },
    customer: customer,
    customer_email: !customer ? (body.email ? String(body.email).trim().toLowerCase() : undefined) : undefined,
    success_url: user ? successUrlLogged : successUrlNew,
    cancel_url: user ? cancelUrlLogged : cancelUrlNew,
    metadata: {
      plan,
      flow: user ? 'upgrade' : 'new',
      company_name: body.companyName ? String(body.companyName).trim() : '',
      email: body.email ? String(body.email).trim().toLowerCase() : '',
      ...(companyId ? { company_id: companyId } : {}),
      ...(user ? { user_id: user.id } : {}),
    },
  });

  return NextResponse.json({ url: session.url });
}
