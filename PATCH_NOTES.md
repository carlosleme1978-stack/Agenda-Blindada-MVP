# Patch notes (2026-02-21)

## What was fixed

### 1) Logout button (Sair)
Added a **Sair** button in `src/app/Header.tsx` that calls `supabaseBrowser().auth.signOut()` and redirects to `/login`.

### 2) Access gate robustness + Dev bypass
Updated `src/lib/access.ts`:
- Added support for `support_override_until` (temporary access in production for customer support).
- Added Stripe unified status compatibility (`stripe_subscription_status`).
- Added a **safe dev bypass** controlled by `NEXT_PUBLIC_BYPASS_BILLING=1` (only works when `NODE_ENV !== "production"`).
- Added a fallback company select when some columns are missing in older DB installs.

### 3) SQL migrations file
Run `SUPABASE_FIXES.sql` in Supabase SQL Editor to add missing columns used by the UI:
- `companies.slot_step_minutes`, `companies.work_days`, etc.
- `companies.sub_basic_status`, `companies.sub_pro_status`
- support override columns
- staff hours table and RLS policies

## Important security note
Do **not** share your `SUPABASE_SERVICE_ROLE_KEY`. If it was exposed, rotate it in Supabase and update Vercel env vars.
