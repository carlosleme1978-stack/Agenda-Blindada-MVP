import Stripe from 'stripe';

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: '2025-01-27.acacia' as any });
}

export function getAppUrl() {
  // Prefer NEXT_PUBLIC_APP_URL (works in browser too), fallback to Vercel URL.
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_APP_URL (or VERCEL_URL)');
  return url.startsWith('http') ? url : `https://${url}`;
}

export function getPriceId(plan: 'basic' | 'pro') {
  const id = plan === 'basic' ? process.env.STRIPE_PRICE_BASIC : process.env.STRIPE_PRICE_PRO;
  if (!id) throw new Error(`Missing ${plan === 'basic' ? 'STRIPE_PRICE_BASIC' : 'STRIPE_PRICE_PRO'}`);
  return id;
}
