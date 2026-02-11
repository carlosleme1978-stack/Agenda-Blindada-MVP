import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e password são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro no login" },
      { status: 500 }
    );
  }
}
