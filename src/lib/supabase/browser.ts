import { createBrowserClient } from "@supabase/ssr";

// Accept multiple env var names to avoid misconfiguration between installs/Vercel.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_ANON_KEY ||
  "";

// NOTE: If either env is missing, requests will fail with "No API key found in request".
// We keep the app running but log a clear error to help fix Vercel/.env.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Set them in .env.local and Vercel Environment Variables (NEXT_PUBLIC_*)."
  );
}

export const supabaseBrowser = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
