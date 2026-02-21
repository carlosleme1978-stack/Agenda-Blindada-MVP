import type { SupabaseClient } from "@supabase/supabase-js";

export type Company = {
  id: string;
  name: string | null;
  // Billing fields (exist in the SaaS DB even if schema.sql is older)
  plan?: "basic" | "pro" | string;
  staff_limit?: number | null;
  sub_basic_status?: string | null;
  sub_pro_status?: string | null;
  stripe_subscription_status?: string | null;
  support_override_until?: string | null;
  support_override_reason?: string | null;
  default_staff_id?: string | null;
  // Onboarding fields (we add in supabase/schema.sql)
  onboarding_complete?: boolean | null;
  default_duration_minutes?: number | null;
};

export type Profile = {
  company_id: string;
};

export type AccessResult = {
  ok: boolean;
  reason?: "NO_SESSION" | "NO_PROFILE" | "NO_COMPANY" | "INACTIVE_SUB" | "NEEDS_ONBOARDING";
  company?: Company;
  profile?: Profile;
};

export function isSubscriptionActive(company: Company): boolean {
  // Support override (production-safe): temporarily allow access even if billing is inactive.
  // Store as timestamptz in DB; here it's a string.
  if (company.support_override_until) {
    const until = new Date(company.support_override_until).getTime();
    if (!Number.isNaN(until) && until > Date.now()) return true;
  }

  // Stripe unified status (if used)
  const stripe = (company.stripe_subscription_status ?? "").toLowerCase();
  if (stripe === "active" || stripe === "trialing") return true;

  // Legacy dual-status fields
  const basic = (company.sub_basic_status ?? "").toLowerCase() === "active";
  const pro = (company.sub_pro_status ?? "").toLowerCase() === "active";
  return basic || pro;
}

export function isDevBillingBypassEnabled(): boolean {
  // Only allow bypass outside production builds.
  const bypass = (process.env.NEXT_PUBLIC_BYPASS_BILLING ?? "").trim() === "1";
  const isProd = process.env.NODE_ENV === "production";
  return bypass && !isProd;
}

export async function getCompanyForCurrentUser(sb: SupabaseClient): Promise<AccessResult> {
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { ok: false, reason: "NO_SESSION" };

  const userId = sess.session.user.id;

  // NOTE: Some DBs use profiles.id = auth.users.id (schema.sql), others use profiles.uid.
  // We try a few common keys to be compatible with older installs.
  let prof: any = null;
  let perr: any = null;

  // 1) New schema (recommended): profiles.id
  {
    const r = await sb.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    prof = r.data;
    perr = r.error;
  }

  // 2) Older schema: profiles.uid
  if ((perr && /column\s+\"id\"\s+does not exist/i.test(perr.message)) || (!prof?.company_id && !perr)) {
    const r = await sb.from("profiles").select("company_id").eq("uid", userId).maybeSingle();
    prof = r.data;
    perr = r.error;
  }

  // 3) Another variant: profiles.user_id
  if ((perr && /column\s+\"uid\"\s+does not exist/i.test(perr.message)) || (!prof?.company_id && !perr)) {
    const r = await sb.from("profiles").select("company_id").eq("user_id", userId).maybeSingle();
    prof = r.data;
    perr = r.error;
  }

  if (perr || !prof?.company_id) return { ok: false, reason: "NO_PROFILE" };

  // Some installs may not have all billing columns yet (e.g. older schema).
  // Try an extended select first, then fallback to a minimal select if PostgREST complains about missing columns.
  const selectExtended =
    "id,name,plan,staff_limit,sub_basic_status,sub_pro_status,stripe_subscription_status,support_override_until,support_override_reason,default_staff_id,onboarding_complete,default_duration_minutes";
  const selectMinimal =
    "id,name,plan,staff_limit,stripe_subscription_status,support_override_until,support_override_reason,default_staff_id,onboarding_complete,default_duration_minutes";

  let comp: any = null;
  let cerr: any = null;

  {
    const r = await sb.from("companies").select(selectExtended).eq("id", prof.company_id).single();
    comp = r.data;
    cerr = r.error;
  }

  if (cerr && /does not exist/i.test(cerr.message || "")) {
    const r2 = await sb.from("companies").select(selectMinimal).eq("id", prof.company_id).single();
    comp = r2.data;
    cerr = r2.error;
  }

  if (cerr || !comp) return { ok: false, reason: "NO_COMPANY" };

  return { ok: true, company: comp as any, profile: prof as any };
}

/**
 * Client-side route gate (because Supabase session is stored in localStorage).
 * - Redirects users to the correct page based on subscription + onboarding.
 */
export async function ensureAccess(
  sb: SupabaseClient,
  opts: { requireActiveSubscription?: boolean; requireOnboardingComplete?: boolean; redirectTo?: { login?: string; billing?: string; onboarding?: string } } = {}
): Promise<AccessResult> {
  const loginUrl = opts.redirectTo?.login ?? "/login";
  const billingUrl = opts.redirectTo?.billing ?? "/dashboard/billing";
  const onboardingUrl = opts.redirectTo?.onboarding ?? "/dashboard/onboarding";

  const res = await getCompanyForCurrentUser(sb);
  if (!res.ok) {
    if (res.reason === "NO_SESSION") window.location.href = loginUrl;
    return res;
  }

  const company = res.company!;

  const DEV_BYPASS = isDevBillingBypassEnabled();

  if (opts.requireActiveSubscription && !DEV_BYPASS && !isSubscriptionActive(company)) {
    window.location.href = billingUrl;
    return { ok: false, reason: "INACTIVE_SUB", company, profile: res.profile };
  }

  if (opts.requireOnboardingComplete && !company.onboarding_complete) {
    window.location.href = onboardingUrl;
    return { ok: false, reason: "NEEDS_ONBOARDING", company, profile: res.profile };
  }

  return res;
}
