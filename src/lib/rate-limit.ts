import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type Bucket = { count: number; resetAt: number };

const g = globalThis as any;
const store: Map<string, Bucket> = g.__AB_RATE_LIMIT_STORE__ ?? new Map();
g.__AB_RATE_LIMIT_STORE__ = store;

// IP extraction helpers (works on Vercel / proxies)
export function getClientIp(req: Request): string {
  const h = req.headers;
  const xf = h.get("x-forwarded-for") || "";
  const ip = xf.split(",")[0]?.trim();
  return ip || h.get("x-real-ip") || "unknown";
}

export function rateLimitOr429(req: Request, opts: RateLimitOptions) {
  const now = Date.now();
  const b = store.get(opts.key);

  if (!b || now > b.resetAt) {
    store.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  if (b.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  b.count += 1;
  store.set(opts.key, b);
  return null;
}
