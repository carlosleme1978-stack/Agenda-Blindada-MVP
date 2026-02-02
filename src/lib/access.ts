import type { SupabaseClient } from "@supabase/supabase-js";

export type Company = {
  id: string;
  name: string | null;
  // Billing fields (exist in the SaaS DB even if schema.sql is older)
  plan?: "basic" | "pro" | string;
  staff_limit?: number | null;
  sub_basic_status?: string | null;
  sub_pro_status?: string | null;
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
  const basic = (company.sub_basic_status ?? "").toLowerCase() === "active";
  const pro = (company.sub_pro_status ?? "").toLowerCase() === "active";
  // Some DBs store a single status. If that's your case, add it here later.
  return basic || pro;
}

export async function getCompanyForCurrentUser(sb: SupabaseClient): Promise<AccessResult> {
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { ok: false, reason: "NO_SESSION" };

  const userId = sess.session.user.id;

  // NOTE: this project expects profiles.id = auth.users.id.
  const { data: prof, error: perr } = await sb
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (perr || !prof?.company_id) return { ok: false, reason: "NO_PROFILE" };

  const { data: comp, error: cerr } = await sb
    .from("companies")
    .select(
      "id,name,plan,staff_limit,sub_basic_status,sub_pro_status,onboarding_complete,default_duration_minutes"
    )
    .eq("id", prof.company_id)
    .single();

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

  if (opts.requireActiveSubscription && !isSubscriptionActive(company)) {
    window.location.href = billingUrl;
    return { ok: false, reason: "INACTIVE_SUB", company, profile: res.profile };
  }

  if (opts.requireOnboardingComplete && !company.onboarding_complete) {
    window.location.href = onboardingUrl;
    return { ok: false, reason: "NEEDS_ONBOARDING", company, profile: res.profile };
  }

  return res;
}
