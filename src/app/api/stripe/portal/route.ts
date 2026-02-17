import { NextResponse, type NextRequest } from 'next/server';
import { getStripe, getAppUrl } from '@/lib/stripe/server';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const appUrl = getAppUrl();

    const { supabase } = createSupabaseRouteClient(request);
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const { data: company } = await admin
      .from('companies')
      .select('stripe_customer_id')
      .eq('id', companyId)
      .single();

    if (!company?.stripe_customer_id) {
      return NextResponse.json({ error: 'Stripe customer not found for this company' }, { status: 400 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Portal error' }, { status: 500 });
  }
}
