import { createSupabaseServer } from "@/lib/supabase/server";

export async function getAuthContext(req?: Request) {
  const supabase = createSupabaseServer();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error("Não autorizado");

  const userId = userRes.user.id;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (profileErr || !profile?.company_id) {
    throw new Error("Usuário sem empresa associada");
  }

  return { supabase, userId, companyId: profile.company_id };
}
