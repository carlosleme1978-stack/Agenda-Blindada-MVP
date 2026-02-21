"use client";

import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface Window {
    __AB_ENV?: {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    };
    __AB_SUPABASE__?: ReturnType<typeof createBrowserClient>;
  }
}

/**
 * Browser Supabase client (singleton).
 * Reads env from window.__AB_ENV at runtime (injected by app/layout.tsx),
 * fallback to build-time process.env.
 *
 * This avoids the common bug where the module is evaluated before the env
 * is available, creating a client without apikey.
 */
export function supabaseBrowser() {
  if (typeof window !== "undefined" && window.__AB_SUPABASE__) return window.__AB_SUPABASE__;

  const url =
    (typeof window !== "undefined" ? window.__AB_ENV?.NEXT_PUBLIC_SUPABASE_URL : undefined) ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_API_URL ||
    "";

  const anonKey =
    (typeof window !== "undefined" ? window.__AB_ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY ||
    "";

  if (!url || !anonKey) {
    console.error(
      "[Supabase] Missing public env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set (Vercel Production + Preview) and in .env.local."
    );
  }

  const client = createBrowserClient(url, anonKey);
  if (typeof window !== "undefined") window.__AB_SUPABASE__ = client;
  return client;
}
