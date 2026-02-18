import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp/send";

type Body = {
  message: string;
  audience: "inactive_30" | "all_recent";
};

function chunk<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const message = String(body?.message ?? "").trim();
    const audience = (body?.audience ?? "inactive_30") as Body["audience"];

    if (!message) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

    const sb = await createSupabaseServer();
    const { data: u } = await sb.auth.getUser();
    const ownerId = u?.user?.id;
    if (!ownerId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    // ─────────────────────────────────────────────
    // Montar audiência (sem quebrar nada do teu webhook)
    // ─────────────────────────────────────────────
    const now = new Date();
    const cutoff30 = new Date(now);
    cutoff30.setDate(cutoff30.getDate() - 30);

    let targetCustomerIds: string[] | null = null;

    if (audience === "inactive_30") {
      const start180 = new Date(now);
      start180.setDate(start180.getDate() - 180);

      const { data: ap180, error: apErr } = await sb
        .from("appointments")
        .select("customer_id,start_time")
        .eq("owner_id", ownerId)
        .gte("start_time", start180.toISOString())
        .limit(9000);

      if (apErr) throw apErr;

      const lastByCustomer: Record<string, number> = {};
      for (const a of ap180 ?? []) {
        const cid = String((a as any).customer_id ?? "");
        if (!cid) continue;
        const t = new Date((a as any).start_time).getTime();
        if (!lastByCustomer[cid] || t > lastByCustomer[cid]) lastByCustomer[cid] = t;
      }

      const cutoffMs = cutoff30.getTime();

      targetCustomerIds = Object.entries(lastByCustomer)
        .filter(([, t]) => t > 0 && t < cutoffMs)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 200)
        .map(([cid]) => cid);
    }

    // Buscar clientes com telefone
    let q = sb
      .from("customers")
      .select("id,name,phone,created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (targetCustomerIds && targetCustomerIds.length) {
      // Supabase .in tem limite prático; mas aqui é <=200
      q = q.in("id", targetCustomerIds);
    }

    const { data: customers, error: custErr } = await q;
    if (custErr) throw custErr;

    const list = (customers ?? []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name ?? "Cliente"),
      phone: String(c.phone ?? ""),
    }));

    const maxSend = 50;
    const selected = list
      .filter((c) => c.phone && c.phone.replace(/\D/g, "").length >= 9)
      .slice(0, maxSend);

    let sent = 0;
    const failed: { name: string; phone: string; error: string }[] = [];

    // Envio sequencial (mais seguro no início)
    for (const c of selected) {
      try {
        await sendWhatsApp(c.phone, message);
        sent += 1;
      } catch (e: any) {
        failed.push({ name: c.name, phone: c.phone, error: e?.message ?? "Erro" });
      }
    }

    return NextResponse.json({
      ok: true,
      audience,
      sent,
      attempted: selected.length,
      failedCount: failed.length,
      failed: failed.slice(0, 10),
      message: sent ? `Promoção enviada para ${sent} contatos.` : "Nenhum envio realizado.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
