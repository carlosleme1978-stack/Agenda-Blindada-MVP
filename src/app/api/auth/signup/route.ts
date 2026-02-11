import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function cleanEmail(e: string) {
  return String(e || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      companyName?: string;
      email?: string;
      password?: string;
      ownerName?: string;
    };

    const companyName = String(body.companyName ?? "").trim();
    const email = cleanEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const ownerName = String(body.ownerName ?? "").trim();

    if (!companyName || !email || !password) {
      return NextResponse.json(
        { error: "companyName, email e password são obrigatórios" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // 1) create company
    const { data: company, error: cErr } = await admin
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }

    // 2) create auth user
    const { data: userRes, error: uErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        company_name: companyName,
        owner_name: ownerName,
      },
    });
    if (uErr || !userRes.user) {
      // rollback company to keep db clean
      await admin.from("companies").delete().eq("id", company.id);
      return NextResponse.json({ error: uErr?.message ?? "Falha ao criar user" }, { status: 400 });
    }

    // 3) create profile
    const { error: pErr } = await admin
      .from("profiles")
      .insert({ id: userRes.user.id, company_id: company.id, role: "owner" });

    if (pErr) {
      // rollback user + company
      await admin.auth.admin.deleteUser(userRes.user.id);
      await admin.from("companies").delete().eq("id", company.id);
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }

    // Optional: create default staff & service for onboarding
    await admin.from("staff").insert({ company_id: company.id, name: ownerName || "Dono", role: "owner" });
    await admin.from("services").insert({ company_id: company.id, name: "Serviço", duration_minutes: 30, active: true });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro no signup" }, { status: 500 });
  }
}
