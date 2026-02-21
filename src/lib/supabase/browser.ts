import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface Window {
    __AB_ENV?: {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    };
  }
}

/**
 * Browser Supabase client.
 * We first read from window.__AB_ENV (injected by app/layout.tsx),
 * then fallback to build-time process.env (Vercel / local).
 */
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
  // Root-cause of: {"message":"No API key found in request"...}
  console.error(
    "[Supabase] Missing public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (Production + Preview) and in .env.local."
  );
}

export const supabaseBrowser = createBrowserClient(url, anonKey);
