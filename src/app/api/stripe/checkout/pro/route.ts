import type { NextRequest } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe/checkout';

export async function POST(request: NextRequest) {
  return createCheckoutSession(request, 'pro');
}
