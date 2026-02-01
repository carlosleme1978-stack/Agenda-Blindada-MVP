import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePro } from "@/lib/guards/requirePro";

export async function POST(req: Request) {
  const { companyId, name } = await req.json();
  const db = supabaseAdmin();

  try {
    // 🔒 Guard: PRO only
    await requirePro(companyId);
  } catch {
    return new Response("Upgrade necessário", { status: 403 });
  }

  // opcional: garantir limite
  const { count } = await db
    .from("staff")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);

  if ((count ?? 0) >= 5) {
    return new Response("Limite de funcionários atingido", { status: 400 });
  }

  await db.from("staff").insert({ company_id: companyId, name });

  return new Response("OK");
}
