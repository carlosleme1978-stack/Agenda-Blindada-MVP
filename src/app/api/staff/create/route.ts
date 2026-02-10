import { NextResponse } from "next/server";
import { getAuthContext } from "@/server/auth";

type Body = { name?: string; active?: boolean };

export async function POST(req: Request) {
  try {
    const { supabase, companyId } = await getAuthContext();
    const body = (await req.json().catch(() => ({}))) as Body;

    const name = (body.name || "").trim();
    const active = body.active ?? true;

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
    }

    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("staff_limit")
      .eq("id", companyId)
      .single();
    if (companyErr || !company) throw companyErr || new Error("Empresa inválida");

    const { count, error: countErr } = await supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("active", true);
    if (countErr) throw countErr;

    const limit = Number(company.staff_limit ?? 0);
    if (limit > 0 && (count ?? 0) >= limit) {
      return NextResponse.json(
        { error: "Limite de staff do plano atingido" },
        { status: 403 }
      );
    }

    const { data: created, error: createErr } = await supabase
      .from("staff")
      .insert({ company_id: companyId, name, active })
      .select("id, name, active, created_at")
      .single();

    if (createErr) throw createErr;
    return NextResponse.json({ staff: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro" }, { status: 401 });
  }
}
