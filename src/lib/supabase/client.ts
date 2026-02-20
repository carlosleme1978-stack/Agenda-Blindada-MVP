import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client factory.
 * Accept multiple env var names to avoid misconfiguration between installs/Vercel.
 */
export function createClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    "";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_ANON_KEY ||
    "";

  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.error(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in .env.local and Vercel Environment Variables (NEXT_PUBLIC_*)."
    );
  }

  return createBrowserClient(url, key);
}
