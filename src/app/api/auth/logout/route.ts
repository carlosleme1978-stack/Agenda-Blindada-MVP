import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = createSupabaseServer();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro ao sair" }, { status: 500 });
  }
}
