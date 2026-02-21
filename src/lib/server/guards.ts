// src/lib/server/guards.ts

import { createSupabaseServer } from "@/lib/supabase/server";

export async function requireActiveCompany() {
  const supabase = await createSupabaseServer();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (pErr || !profile?.company_id) {
    throw Object.assign(new Error("No company linked"), { status: 403 });
  }

  const { data: ent, error: eErr } = await supabase
    .from("view_company_entitlements")
    .select("is_active, status, plan")
    .eq("company_id", profile.company_id)
    .single();

  if (eErr || !ent) {
    throw Object.assign(new Error("Entitlement not found"), { status: 403 });
  }

  if (!ent.is_active) {
    throw Object.assign(new Error("Subscription inactive"), { status: 402 });
  }

  return {
    supabase,
    user,
    profile,
    entitlement: ent,
  };
}
