import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppTextForCompany } from "@/lib/whatsapp/company";

const TZ = "Europe/Lisbon";

function toISODateLisbon(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

function formatDatePt(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("pt-PT", { timeZone: TZ });
}

// ISO weekday: 1=Mon ... 7=Sun
function nextIsoWeekday(isoWeekday: number) {
  const now = new Date();
  // compute "today" in Lisbon as YYYY-MM-DD
  const todayIso = toISODateLisbon(now);
  const today = new Date(`${todayIso}T12:00:00Z`);

  const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(today);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const todayIsoWd = map[wdShort] ?? 1;

  let delta = isoWeekday - todayIsoWd;
  if (delta <= 0) delta += 7; // always "next", not today

  const target = new Date(today.getTime());
  target.setDate(target.getDate() + delta);
  return toISODateLisbon(target);
}

function weekdayFromMessage(msgUpperNoAccents: string): number | null {
  // msgUpperNoAccents should already be stripped of diacritics
  if (msgUpperNoAccents.includes("SEGUNDA")) return 1;
  if (msgUpperNoAccents.includes("TERCA")) return 2;
  if (msgUpperNoAccents.includes("QUARTA")) return 3;
  if (msgUpperNoAccents.includes("QUINTA")) return 4;
  if (msgUpperNoAccents.includes("SEXTA")) return 5;
  if (msgUpperNoAccents.includes("SABADO")) return 6;
  if (msgUpperNoAccents.includes("DOMINGO")) return 7;
  return null;
}

function stripDiacritics(s: string) {
  return String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

async function setChatSessionPromo(db: any, companyId: string, customerId: string, promoIsoDate: string) {
  const nextCtx = {
    promo: {
      isoDate: promoIsoDate,
      locked: true,
      created_at: new Date().toISOString(),
    },
  };

  const upd = await db
    .from("chat_sessions")
    .update({
      state: "PROMO_OFFER",
      context: nextCtx,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    // não atropelar fluxos em andamento
    .select("company_id");

  if (!upd.error && upd.data && upd.data.length > 0) return;

  // fallback: insert (se não existe)
  const ins = await db.from("chat_sessions").insert({
    company_id: companyId,
    customer_id: customerId,
    state: "PROMO_OFFER",
    context: nextCtx,
    updated_at: new Date().toISOString(),
  });

  // se já existe e não foi IDLE, ignoramos
  if (ins.error) {
    // best-effort: tentar anexar promo sem mexer no state
    try {
      await db
        .from("chat_sessions")
        .update({
          context: { ...(nextCtx ?? {}) },
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("customer_id", customerId);
    } catch {}
  }
}

/**
 * Body:
 * { message: string; audience: "inactive_30" | "all_recent" }
 */
export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const db = supabaseAdmin();
    const { data: userRes, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const messageRaw = String(body?.message ?? "").trim();
    const audience = String(body?.audience ?? "inactive_30");

    if (!messageRaw) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

    // company_id
    const { data: prof, error: profErr } = await db.from("profiles").select("company_id").eq("id", userId).single();
    if (profErr || !prof?.company_id) return NextResponse.json({ error: "Sem company_id" }, { status: 400 });
    const companyId = String(prof.company_id);

    // decide promo date (fixed day)
    const upperNoAccents = stripDiacritics(messageRaw).toUpperCase();
    const wd = weekdayFromMessage(upperNoAccents) ?? 1; // default: próxima segunda
    const promoIsoDate = nextIsoWeekday(wd);

    const footer = `\n\n📅 Promoção válida para *${formatDatePt(promoIsoDate)}*.\nResponda *SIM* para marcar.`;
    const finalMessage = messageRaw.includes("Responda") || messageRaw.includes("SIM")
      ? messageRaw
      : (messageRaw + footer);

    // audience customers
    // base query
    const { data: customers, error: custErr } = await db
      .from("customers")
      .select("id, phone, name")
      .eq("company_id", companyId)
      .eq("consent_whatsapp", true)
      .not("phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 400 });

    let target = (customers ?? []).filter((c: any) => String(c.phone || "").replace(/\D/g, "").length >= 9);

    if (audience === "inactive_30") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { data: ap180 } = await db
        .from("appointments")
        .select("customer_id,start_time")
        .eq("company_id", companyId)
        .gte("start_time", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .limit(9000);

      const lastByCustomer: Record<string, number> = {};
      for (const a of ap180 ?? []) {
        const cid = String((a as any).customer_id ?? "");
        if (!cid) continue;
        const t = new Date((a as any).start_time).getTime();
        if (!lastByCustomer[cid] || t > lastByCustomer[cid]) lastByCustomer[cid] = t;
      }

      const cutoffMs = cutoff.getTime();
      target = target.filter((c: any) => {
        const t = lastByCustomer[String(c.id)] ?? 0;
        return t > 0 && t < cutoffMs;
      });
    }

    // send cap (safe)
    const MAX_SEND = 60;
    const list = target.slice(0, MAX_SEND);

    let sent = 0;
    const failed: any[] = [];

    for (const c of list) {
      const phone = String((c as any).phone ?? "");
      try {
        await setChatSessionPromo(db as any, companyId, String((c as any).id), promoIsoDate);
        await sendWhatsAppTextForCompany(companyId, phone, finalMessage);
        sent += 1;
      } catch (e: any) {
        failed.push({ id: (c as any).id, phone, error: e?.message ?? "Erro" });
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      failedCount: failed.length,
      promoIsoDate,
      message: sent ? `Promoção enviada para ${sent} contatos (dia ${formatDatePt(promoIsoDate)}).` : "Nenhum envio realizado.",
      failed: failed.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
