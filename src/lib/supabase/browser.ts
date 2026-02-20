import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 * IMPORTANT: Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY at build time (Vercel).
 * We also accept a few legacy env var names to avoid silent breakage.
 */
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_API_URL ||
  "";

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY ||
  "";

if (!url || !anonKey) {
  // This is the exact root-cause of: {"message":"No API key found in request"...}
  console.error(
    "[Supabase] Missing public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (Production + Preview) and in .env.local."
  );
}

export const supabaseBrowser = createBrowserClient(url, anonKey);
