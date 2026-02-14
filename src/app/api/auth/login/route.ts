import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getClientIp, rateLimitOr429 } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request as any);
  const limited = rateLimitOr429(request as any, { key: `login:` + ip, limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const { supabase, response: cookieResponse } = createSupabaseRouteClient(request);

  try {
    const { email, password } = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Email e password são obrigatórios" }, { status: 400 });
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Build JSON response and copy cookies set by Supabase SSR client
    const res = NextResponse.json({ ok: true });
    cookieResponse.cookies.getAll().forEach((c) => {
      res.cookies.set(c.name, c.value, c);
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro no login" }, { status: 500 });
  }
}