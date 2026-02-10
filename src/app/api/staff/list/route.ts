import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = createSupabaseRouteClient(request);

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const userId = userRes.user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: "Usuário sem empresa associada" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("staff")
      .select("id, name, active")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ staff: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro" }, { status: 500 });
  }
}
