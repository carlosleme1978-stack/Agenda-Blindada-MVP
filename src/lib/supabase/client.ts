import { createBrowserClient } from "@supabase/ssr";

/**
 * IMPORTANT:
 * This app authenticates via Route Handlers that set the Supabase cookies.
 * Therefore, the browser client must also read/write sessions via cookies
 * (NOT localStorage), otherwise `getSession()` will return null and the
 * dashboard will show "Faça login".
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

