import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side guard: only allow PRO features for this company.
 * Throws an Error with code "PRO_REQUIRED" when not allowed.
 */
export async function requirePro(companyId: string) {
  const db = supabaseAdmin();

  const { data: company, error } = await db
    .from("companies")
    .select("plan")
    .eq("id", companyId)
    .single();

  if (error || !company || company.plan !== "pro") {
    const err: any = new Error("Upgrade necessário");
    err.code = "PRO_REQUIRED";
    throw err;
  }
}
