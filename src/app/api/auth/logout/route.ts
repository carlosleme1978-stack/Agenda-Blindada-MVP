import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function POST(request: NextRequest) {
  const { supabase, response: cookieResponse } = createSupabaseRouteClient(request);

  try {
    await supabase.auth.signOut();

    const res = NextResponse.json({ ok: true });
    cookieResponse.cookies.getAll().forEach((c) => {
      res.cookies.set(c.name, c.value, c.options);
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro no logout" }, { status: 500 });
  }
}
