# Patch: Supabase Browser Key + Logout

## Why categories/services were not saving
The browser was calling Supabase REST without `apikey` because the public env var name was missing/mismatched.
This patch makes the browser client accept multiple env var names and logs a clear error if missing.

## Required env vars (Vercel + .env.local)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

Fallbacks accepted:
- NEXT_PUBLIC_SUPABASE_PROJECT_URL
- NEXT_PUBLIC_SUPABASE_KEY
- NEXT_PUBLIC_SUPABASE_PUBLIC_ANON_KEY
