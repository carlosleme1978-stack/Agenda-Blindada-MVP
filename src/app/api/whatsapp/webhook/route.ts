import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import { SCHEDULE_CONFIG } from "@/config/schedule";

// ✅ IMPORTANTE (BANCO / SUPABASE)
// Para idempotência 100% (anti-retry da Meta), crie:
// - coluna: wa_message_id (text) em message_log
// - unique index onde wa_message_id is not null
// (se ainda não existir, este código continua a funcionar, mas o ideal é ter o UNIQUE)

const TZ = "Europe/Lisbon";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeInboundText(v: string) {
  return String(v || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function isIntentGreeting(text: string) {
  return (
    text === "OI" ||
    text === "OLA" ||
    text === "OLÁ" ||
    text.startsWith("OI ") ||
    text.startsWith("OLA") ||
    text.startsWith("OLÁ") ||
    text.includes("BOM DIA") ||
    text.includes("BOA TARDE") ||
    text.includes("BOA NOITE") ||
    text.includes("TUDO BEM") ||
    text.includes("TD BEM") ||
    text.includes("COMO ESTA") ||
    text.includes("COMO ESTÁ")
  );
}

function isIntentHelp(text: string) {
  return (
    text === "AJUDA" ||
    text === "MENU" ||
    text.includes("COMO FUNCIONA") ||
    text.includes("OPCOES") ||
    text.includes("OPÇÕES") ||
    text.includes("O QUE POSSO") ||
    text.includes("QUE POSSO")
  );
}

function isIntentValues(text: string) {
  return (
    text === "VALORES" ||
    text === "PRECO" ||
    text === "PREÇO" ||
    text.includes("QUANTO CUSTA") ||
    text.includes("VALOR") ||
    text.includes("ORCAMENTO") ||
    text.includes("ORÇAMENTO")
  );
}

function isIntentHuman(text: string) {
  return (
    text.includes("ATENDENTE") ||
    text.includes("HUMANO") ||
    text.includes("PESSOA") ||
    text.includes("FALAR COM") ||
    text.includes("LIGAR") ||
    text.includes("TELEFONE")
  );
}

function isIntentMark(text: string) {
  return (
    text.includes("QUERO MARCAR") ||
    text.includes("GOSTARIA DE MARCAR") ||
    text === "MARCAR" ||
    text === "AGENDAR" ||
    text.includes("AGENDAR") ||
    text.includes("MARCAÇÃO") ||
    text.includes("MARCACAO")
  );
}

function isIntentReschedule(text: string) {
  return (
    text.includes("REAGENDAR") ||
    text.includes("REMARCAR") ||
    text === "REAGENDAR" ||
    text === "REMARCAR"
  );
}

function isIntentCancel(text: string) {
  return (
    text.includes("CANCELAR") ||
    text === "CANCELA" ||
    text.includes("DESMARCAR") ||
    text.includes("ANULAR")
  );
}

function isYesNo(text: string) {
  return text === "SIM" || text === "NÃO" || text === "NAO";
}

// ✅ NOVO: validação simples de nome (WhatsApp)
function normalizeNameInput(raw: string) {
  const s = String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // remove pontuações no começo/fim
  const trimmed = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();

  // mantém letras, espaços, hífen e apóstrofo (nomes PT)
  const cleaned = trimmed.replace(/[^\p{L} '\-]/gu, "").replace(/\s+/g, " ").trim();
  return cleaned;
}

function isValidPersonName(name: string) {
  const n = String(name || "").trim();
  if (n.length < 2 || n.length > 60) return false;
  // evita respostas tipo "OK", "SIM", "1", etc.
  const up = stripDiacritics(n).toUpperCase();
  if (up === "SIM" || up === "NAO" || up === "NÃO" || up === "OK") return false;
  // precisa ter pelo menos 2 letras
  const letters = n.match(/\p{L}/gu) ?? [];
  return letters.length >= 2;
}

function toISODateLisbon(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

/**
 * 1=Seg ... 7=Dom
 */
function isoDayNumberLisbon(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(d);

  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[wd] ?? 1;
}

function parseDayPt(text: string): string | null {
  const t0 = normalizeInboundText(text);
  const t = stripDiacritics(t0);

  if (t === "HOJE") return toISODateLisbon(new Date());

  if (t === "AMANHA") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODateLisbon(d);
  }

  const clean = t.replace(/[^\d\/\-]/g, "");

  // dd/mm ou dd-mm (sem ano)
  const m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yyyy = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (yyyy < 100) yyyy += 2000;

    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  // yyyy-mm-dd
  const m2 = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  return null;
}

function formatDatePt(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("pt-PT", { timeZone: TZ });
}

function addMinutesHHMM(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

function buildSlotsForDay(params: {
  isoDate: string;
  durationMinutes: number;
  stepMinutes: number;
  workStart: string;
  workEnd: string;
}) {
  const { isoDate, durationMinutes, stepMinutes, workStart, workEnd } = params;
  const slots: { startISO: string; endISO: string; label: string }[] = [];

  let cur = workStart;
  while (true) {
    const next = addMinutesHHMM(cur, durationMinutes);
    if (next > workEnd) break;

    const startISO = `${isoDate}T${cur}:00.000Z`;
    const endISO = `${isoDate}T${next}:00.000Z`;

    slots.push({ startISO, endISO, label: cur });
    cur = addMinutesHHMM(cur, stepMinutes);
  }

  return slots;
}

function lisbonNowHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function getGreetingByTime() {
  const hhmm = lisbonNowHHMM();
  const h = Number(hhmm.split(":")[0] || 0);
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function isUniqueViolation(err: any) {
  return err?.code === "23505"; // Postgres unique violation
}

// ✅ NOVO: formatação de preço e paginação 3/3
function formatPriceEur(price_cents: number | null | undefined) {
  if (price_cents == null) return "";
  const v = (price_cents / 100).toFixed(2).replace(".", ",");
  return `${v}€`;
}

function pick3Lines<T>(arr: T[], offset: number, fmt: (item: T, displayNumber: number) => string) {
  const page = arr.slice(offset, offset + 3);
  const lines = page.map((item, i) => fmt(item, offset + i + 1)).join("\n"); // ✅ contínuo: 4,5,6...
  const hasMore = offset + 3 < arr.length;
  return { page, lines, hasMore };
}


// ─────────────────────────────────────────────
// Webhook Verification (GET)
// ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ─────────────────────────────────────────────
// Webhook Messages (POST)
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const message = value?.messages?.[0];
  if (!message?.text?.body) {
    return NextResponse.json({ ok: true });
  }

  // ✅ WhatsApp Cloud: o número do cliente pode vir em contacts[0].wa_id (mais confiável)
  const contactWaId: string | undefined = value?.contacts?.[0]?.wa_id;
  const senderWa: string = contactWaId || message.from;
  if (!senderWa) return NextResponse.json({ ok: true });

  const fromDigits = onlyDigits(senderWa);

  // ✅ Metadados do número da empresa (destino) — essencial para resolver a company correta
  const toPhoneNumberId: string | undefined = value?.metadata?.phone_number_id;
  const toDisplayPhone: string | undefined = value?.metadata?.display_phone_number;
  const textRaw = normalizeInboundText(message.text.body);
  const text = stripDiacritics(textRaw);
  const waMessageId: string | undefined = message.id;

  const db = supabaseAdmin();

  // ✅ FIX 1: Idempotência inbound FORTE (anti-retry da Meta)
  // Tenta inserir inbound com wa_message_id; se já existe (unique), retorna e NÃO envia nada.
  if (waMessageId) {
    const ins = await db.from("message_log").insert({
      direction: "inbound",
      customer_phone: fromDigits,
      body: textRaw,
      wa_message_id: waMessageId, // ✅ coluna dedicada (crie no banco)
      meta: { raw: body, wa: { phone_number_id: toPhoneNumberId ?? null, display_phone_number: toDisplayPhone ?? null } },
    });

    if (ins.error) {
      if (isUniqueViolation(ins.error)) {
        return NextResponse.json({ ok: true });
      }
      console.error("message_log inbound insert error:", ins.error);
      return NextResponse.json({ ok: true });
    }
  } else {
    // fallback (sem id)
    await db.from("message_log").insert({
      direction: "inbound",
      customer_phone: fromDigits,
      body: textRaw,
      meta: { raw: message },
    });
  }

  // ─────────────────────────────────────────────
  // Encontrar customer e company
  // ─────────────────────────────────────────────
  const candidates = [fromDigits, `+${fromDigits}`];


  // ─────────────────────────────────────────────
  // Resolve a company correta pelo "TO" (número da empresa)
  // ─────────────────────────────────────────────
  async function resolveCompanyId(): Promise<string | null> {
    // 1) Preferência total: phone_number_id (Cloud API)
    if (toPhoneNumberId) {
      try {
        const r = await (db as any)
          .from("companies")
          .select("id")
          .eq("wa_phone_number_id" as any, String(toPhoneNumberId) as any)
          .limit(1)
          .maybeSingle();

        if (!r.error && r.data?.id) return r.data.id;
      } catch (_) {}
    }

    // 2) Fallback: display_phone_number (normalizado)
    const displayDigits = toDisplayPhone ? onlyDigits(toDisplayPhone) : null;
    if (displayDigits) {
      const cols = ["whatsapp_phone", "phone", "wa_display_phone_number"];
      for (const col of cols) {
        try {
          // NOTE: o Postgrest typings pode explodir com coluna dinâmica em .eq(...)
          // (ts(2589) "type instantiation is excessively deep").
          // Como aqui é apenas lookup de company por colunas alternativas,
          // fazemos cast para "any" só nesse trecho.
          const q: any = (db as any).from("companies").select("id");
          const r = await q
            .eq(col, displayDigits)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!r.error && r.data?.id) return r.data.id;
        } catch (_) {}
      }
    }

    // 3) Último fallback: primeira company
    try {
      const r = await (db as any)
        .from("companies")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!r.error && r.data?.id) return r.data.id;
    } catch (_) {}

    return null;
  }

  const resolvedCompanyId = await resolveCompanyId();
  if (!resolvedCompanyId) return NextResponse.json({ ok: true });

  let customer: any = null;

  // ✅ Procura o customer dentro da company resolvida (NÃO procurar global, para não "pegar" a company errada)
  {
    const r = await (db as any)
      .from("customers")
      .select("id, phone, company_id, name")
      .eq("company_id", resolvedCompanyId)
      .in("phone", candidates)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    customer = r.data ?? null;
  }

  // ✅ Se não existir, cria na company correta
  if (!customer) {
    const created = await db
      .from("customers")
      .insert({
        company_id: resolvedCompanyId,
        phone: fromDigits,
        name: null,
        consent_whatsapp: true,
      })
      .select("id, phone, company_id, name")
      .single();

    customer = created.data;
  }

  const companyId = resolvedCompanyId;

  // ─────────────────────────────────────────────
  // ✅ Nome do cliente (primeira vez)
  // ─────────────────────────────────────────────
  function customerHasName() {
    const n = String(customer?.name ?? "").trim();
    return n.length >= 2;
  }

  // ─────────────────────────────────────────────
  // Sessão do chat (estado)
  // ─────────────────────────────────────────────
  const { data: session0 } = await db
    .from("chat_sessions")
    .select("state, context")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  const state: string = session0?.state || "IDLE";
  const ctx: any = session0?.context || {};

  // ─────────────────────────────────────────────
  // ✅ GUARDA GLOBAL: se o cliente ainda não tem nome, pedir antes de continuar.
  // Evita o caso em que existe um state antigo (ex: ASK_CATEGORY) e o fluxo segue
  // sem gravar o nome (ficando NULL no Supabase).
  // ─────────────────────────────────────────────
  if (!customerHasName() && state !== "ASK_NAME") {
    const hi = getGreetingByTime();
    const header = `${hi} 👋\nPara continuarmos a tua marcação, escreva o teu *nome*, por favor?`;

    // guarda o contexto atual para retomar no menu (mínimo necessário)
    const nextMode = ctx?.mode ?? "NEW";
    const nextCtx = {
      mode: nextMode,
      reschedule_from_appointment_id: ctx?.reschedule_from_appointment_id ?? null,
      offset: 0,
    };

    await setSession("ASK_NAME", {
      next_action: "CATEGORY_MENU",
      next_ctx: nextCtx,
      next_header: header,
    });

    await replyAndLog(header, { step: "ask_name" });
    return NextResponse.json({ ok: true });
  }

  async function setSession(nextState: string, nextCtx: any) {
    const upd = await db
      .from("chat_sessions")
      .update({
        state: nextState,
        context: nextCtx ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .select("company_id");

    if (upd.error) {
      console.error("setSession update error:", upd.error);
      return;
    }

    if (upd.data && upd.data.length > 0) return;

    const ins = await db.from("chat_sessions").insert({
      company_id: companyId,
      customer_id: customer.id,
      state: nextState,
      context: nextCtx ?? {},
      updated_at: new Date().toISOString(),
    });

    if (ins.error) console.error("setSession insert error:", ins.error);
  }

  async function clearSession() {
    await setSession("IDLE", {});
  }

  async function replyAndLog(bodyText: string, meta: any = {}) {
    try {
      await sendWhatsApp(fromDigits, bodyText);
    } catch (e) {
      console.error("sendWhatsApp failed:", e);
    }

    const ins = await db.from("message_log").insert({
      company_id: companyId,
      direction: "outbound",
      customer_phone: fromDigits,
      body: bodyText,
      meta: { in_reply_to: waMessageId ?? null, ...meta },
    });

    if (ins.error) console.error("message_log outbound insert error:", ins.error);
  }

  // ✅ FIX 2: Cooldown para "fora do horário" (para nunca spammar)
  async function maybeWarnOutsideHours(flow: "new" | "reschedule") {
    const { data: cfg } = await db
      .from("companies")
      .select("work_start, work_end, work_days")
      .eq("id", companyId)
      .maybeSingle();

    const workStart = cfg?.work_start ?? "09:00";
    const workEnd = cfg?.work_end ?? "18:00";
    const workDays: number[] = (cfg?.work_days as any) ?? [1, 2, 3, 4, 5];

    const nowHHMM = lisbonNowHHMM();
    const todayIso = toISODateLisbon(new Date());
    const dayNum = isoDayNumberLisbon(todayIso);

    const dayOk = workDays.includes(dayNum);
    const timeOk = nowHHMM >= workStart && nowHHMM <= workEnd;

    if (!dayOk || !timeOk) {
      // cooldown 6h por cliente
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      const { data: recent } = await db
        .from("message_log")
        .select("id")
        .eq("direction", "outbound")
        .eq("customer_phone", fromDigits)
        .eq("meta->>step", "outside_hours_notice")
        .gte("created_at", since)
        .limit(1);

      if (recent && recent.length > 0) return;

      const msg =
        flow === "new"
          ? `⏰ Neste momento estamos fora do horário, mas podes agendar já por aqui — é rapidinho.`
          : `⏰ Neste momento estamos fora do horário, mas podes reagendar já por aqui — é rapidinho.`;

      await replyAndLog(msg, { step: "outside_hours_notice" });
    }
  }

  // ─────────────────────────────────────────────
  // Carregar agenda por cliente (fallback no schedule.ts)
  // ─────────────────────────────────────────────
  async function getCompanySchedule() {
    const { data } = await db
      .from("companies")
      .select("lunch_break_enabled,lunch_break_start,lunch_break_end,daily_limit_enabled,daily_limit_max,slot_capacity")
      .eq("id", companyId)
      .maybeSingle();

    return {
      lunchBreak: {
        enabled: data?.lunch_break_enabled ?? SCHEDULE_CONFIG.lunchBreak.enabled,
        start: data?.lunch_break_start ?? SCHEDULE_CONFIG.lunchBreak.start,
        end: data?.lunch_break_end ?? SCHEDULE_CONFIG.lunchBreak.end,
      },
      dailyLimit: {
        enabled: data?.daily_limit_enabled ?? SCHEDULE_CONFIG.dailyLimit.enabled,
        maxAppointments: data?.daily_limit_max ?? SCHEDULE_CONFIG.dailyLimit.maxAppointments,
      },
      slotCapacity: Math.max(1, Number(data?.slot_capacity ?? 1)),
    };
  }

  const COMPANY_SCHEDULE = await getCompanySchedule();

  // ─────────────────────────────────────────────
  // Modelo SOLO: sem staff
  // ─────────────────────────────────────────────
  const COMPANY_PLAN = "solo";
  const ACTIVE_STAFF: any[] = [];


  function isSlotInLunchBreak(slot: { startISO: string; endISO: string }, isoDate: string) {
    if (!COMPANY_SCHEDULE.lunchBreak.enabled) return false;

    const lbStart = `${isoDate}T${COMPANY_SCHEDULE.lunchBreak.start}:00.000Z`;
    const lbEnd = `${isoDate}T${COMPANY_SCHEDULE.lunchBreak.end}:00.000Z`;
    return overlaps(slot.startISO, slot.endISO, lbStart, lbEnd);
  }

  
  async function countAppointmentsForDay(isoDate: string, staffId?: string | null) {
    const dayStart = `${isoDate}T00:00:00.000Z`;
    const dayEnd = `${isoDate}T23:59:59.999Z`;

    let q = db
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .or("status_v2.in.(PENDING,CONFIRMED),status.in.(BOOKED,PENDING,CONFIRMED)");

    if (staffId) q = (q as any)// solo: sem staff_id

    const { count, error } = await (q as any);

    if (error) console.error("countAppointmentsForDay error:", error);
    return count ?? 0;
  }

  
  async function countOverlappingAppointments(startISO: string, endISO: string, staffId?: string | null) {
    let q = db
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .or("status_v2.in.(PENDING,CONFIRMED),status.in.(BOOKED,PENDING,CONFIRMED)")
      .lt("start_time", endISO)
      .gt("end_time", startISO);

    if (staffId) q = (q as any)// solo: sem staff_id

    const { count, error } = await (q as any);

    if (error) console.error("countOverlappingAppointments error:", error);
    return count ?? 0;
  }

  // ─────────────────────────────────────────────
  // ✅ Categorias → Serviços (menus)
  // ─────────────────────────────────────────────
  async function sendCategoryMenu(nextCtx: any, offset = 0, header?: string) {
    const { data: cats, error } = await db
      .from("service_categories")
      .select("id,name,sort_order,active,created_at")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("load categories error:", error);
      await replyAndLog("Ups… tive um problema a carregar as categorias. Tenta novamente daqui a pouco 🙏", {
        step: "categories_load_error",
      });
      return NextResponse.json({ ok: true });
    }

    const categories = (cats ?? []) as any[];

    if (!categories.length) {
      // fallback se ainda não existem categorias: vai para serviços como antes
      await setSession("ASK_SERVICE", { ...nextCtx, offset: 0, category_id: null, services: [] });
      await replyAndLog("Ainda não tenho categorias cadastradas. Diz-me qual serviço queres (responde 1, 2 ou 3).", { step: "no_categories_fallback", company_id: companyId });
      return NextResponse.json({ ok: true });
    }

    const { lines, hasMore } = pick3Lines(categories, offset, (c, n) => `${n}) ${c.name}`);

    await setSession("ASK_CATEGORY", {
      ...nextCtx,
      categories,
      offset,
    });

    const top = header ? `${header}\n` : "";
    const moreLine = hasMore ? `\n0) Ver mais` : "";
    await replyAndLog(
  `${top}Escolhe uma categoria:\n${lines}${moreLine}\n9) Categorias\n\nResponde com o número por favor.`,
  { step: "category_menu", offset }
);

    return NextResponse.json({ ok: true });
  }

  async function sendStaffMenu(nextCtx: any, header?: string) {
    const list = ([] as any[]).slice(0, 9); // solo: sem seleção de staff
    if (!list.length) {
      // fallback: segue sem staff
      await setSession("ASK_DAY", nextCtx);
      await replyAndLog("Qual dia você prefere? (ex: hoje / amanhã / 15/02)", { step: "ask_day_fallback_no_staff" });
      return NextResponse.json({ ok: true });
    }


    // Modelo Solo: se houver apenas 1 atendente, não perguntar (evita etapa extra)
    if (list.length === 1) {
      const only = list[0];
      const autoCtx = { ...nextCtx, staff_id: only.id, staff_name: only.name };
      await setSession("ASK_DAY", autoCtx);
      await replyAndLog((header ? header + "\n\n" : "") + "Qual dia você prefere? (ex: hoje / amanhã / 15/02)", { step: "ask_day_auto_staff" });
      return NextResponse.json({ ok: true });
    }
    const lines = list.map((s: any, i: number) => `${i + 1}) ${s.name}`).join("\n");
    const text =
      (header ? header + "\n\n" : "") +
      `Com quem você quer marcar?\n${lines}\n\nResponda com o número.`;

    await setSession("ASK_STAFF", { ...nextCtx, staff_options: list.map((s: any) => ({ id: s.id, name: s.name })) });
    await replyAndLog(text, { step: "ask_staff" });
    return NextResponse.json({ ok: true });
  }

  async function sendServiceMenuFromCategory(nextCtx: any, categoryId: string, offset = 0, header?: string) {
    const { data: services, error } = await db
      .from("services")
      .select("id,name,duration_minutes,price_cents,sort_order,active,category_id,created_at")
      .eq("company_id", companyId)
      .eq("active", true)
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("load services by category error:", error);
      await replyAndLog("Ups… tive um problema a carregar os serviços. Tenta novamente daqui a pouco 🙏", {
        step: "services_load_error",
      });
      return NextResponse.json({ ok: true });
    }

    const list = (services ?? []) as any[];

    if (!list.length) {
      await replyAndLog("Esta categoria ainda não tem serviços. Escolhe outra categoria 😊", { step: "category_empty" });
      return await sendCategoryMenu(nextCtx, 0);
    }

    const { lines, hasMore } = pick3Lines(list, offset, (s, i) => {
      const price = formatPriceEur(s.price_cents);
      const pricePart = price ? ` - ${price}` : "";
      return `${i}) ${s.name} (${s.duration_minutes}min${pricePart})`;
    });

    await setSession("ASK_SERVICE", {
      ...nextCtx,
      services: list,
      category_id: categoryId,
      offset,
    });

    const top = header ? `${header}\n` : "";
    const moreLine = hasMore ? `\n0) Ver mais` : "";

    await replyAndLog(`${top}Agora escolhe o serviço:\n${lines}${moreLine}\n9) Categorias\n\nResponde com o número.`, {
      step: "service_menu_by_category",
      category_id: categoryId,
      offset,
    });

    return NextResponse.json({ ok: true });
  }

  // ─────────────────────────────────────────────
  // ✅ Cancelar (cliente) - cancela pendente (se houver) ou a próxima futura
  // ─────────────────────────────────────────────
  async function cancelNextAppointment() {
    const pendingId = ctx?.pending_appointment_id ?? null;
    if (pendingId) {
      await db.from("appointments").update({ status: "CANCELLED", status_v2: "CANCELLED" }).eq("id", pendingId);
      await replyAndLog("✅ Ok! Cancelei a tua marcação. Se quiseres marcar outro horário, escreva: *QUERO MARCAR*.", {
        step: "cancel_ok_pending",
        appointment_id: pendingId,
      });
      await clearSession();
      return NextResponse.json({ ok: true });
    }

    const { data: appt } = await db
      .from("appointments")
      .select("id,start_time,status")
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .or("status_v2.in.(PENDING,CONFIRMED),status.in.(BOOKED,PENDING,CONFIRMED)")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!appt?.id) {
      await replyAndLog(
        "Não encontrei nenhuma marcação futura para cancelar. Se quiseres marcar, escreva: *QUERO MARCAR*.",
        { step: "cancel_none" }
      );
      await clearSession();
      return NextResponse.json({ ok: true });
    }

    await db.from("appointments").update({ status: "CANCELLED", status_v2: "CANCELLED" }).eq("id", appt.id);

    await replyAndLog("✅ Ok! A tua marcação foi cancelada. Se quiseres marcar outro horário, escreva: *QUERO MARCAR*.", {
      step: "cancel_ok",
      appointment_id: appt.id,
    });

    await clearSession();
    return NextResponse.json({ ok: true });
  }

  if (isIntentCancel(text)) {
    return await cancelNextAppointment();
  }

  if (isIntentValues(text)) {
    await replyAndLog(
      `Sobre valores 💶\nO preço pode variar consoante o serviço.\n\nPara ver os serviços e valores, responde: *QUERO MARCAR* (eu mostro as categorias e serviços).\n\nSe quiseres falar com alguém, escreva: *ATENDENTE*.`,
      { step: "values" }
    );
    return NextResponse.json({ ok: true });
  }

  if (isIntentHuman(text)) {
    await replyAndLog(
      `Claro 👍\nVou deixar registado para a equipa falar contigo.\nSe preferires, diz-me em 1 frase o motivo (ex: “dúvida sobre horários/valores”).`,
      { step: "handoff_human" }
    );
    return NextResponse.json({ ok: true });
  }

  // ✅ Cumprimento/ajuda vai direto para categoria
  if (isIntentGreeting(text) || isIntentHelp(text)) {
    await clearSession();
    await maybeWarnOutsideHours("new");

    const hi = getGreetingByTime();
    if (!customerHasName()) {
      await setSession("ASK_NAME", {
        next_action: "CATEGORY_MENU",
        next_ctx: { mode: "NEW", offset: 0 },
        next_header: `${hi} 👋\nPara continuarmos a tua marcação, qual é o teu *nome*, por favor?`,
      });
      await replyAndLog(`${hi} 👋\nPara continuarmos a tua marcação, qual é o teu *nome*, por favor?`, { step: "ask_name" });
      return NextResponse.json({ ok: true });
    }

    return await sendCategoryMenu({ mode: "NEW", offset: 0 }, 0, `${hi} 👋 Olá, ${customer.name}!`);
  }

  // ─────────────────────────────────────────────
  // Função central: gera horários de um dia e responde (reutilizável)
  // ─────────────────────────────────────────────
  async function processDaySelection(isoDate: string) {
    const duration = Number(ctx?.duration_minutes) || 30;

    // Modelo SOLO: horários por dia (owner_working_hours)
    const dayNum = isoDayNumberLisbon(isoDate);

    const { data: cfg } = await db
      .from("companies")
      .select("slot_step_minutes")
      .eq("id", companyId)
      .maybeSingle();

    const stepMinutes = Math.max(5, Number((cfg as any)?.slot_step_minutes ?? 15));

    // owner_id (primeiro profile da company)
    const { data: ownerProf } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const ownerId = (ownerProf as any)?.id as string | undefined;

    const { data: wh } = ownerId
      ? await db
          .from("owner_working_hours")
          .select("start_time,end_time,active")
          .eq("owner_id", ownerId)
          .eq("day_of_week", dayNum)
          .maybeSingle()
      : { data: null as any };

    const workStart = (wh as any)?.active === false ? null : ((wh as any)?.start_time ?? "09:00");
    const workEnd = (wh as any)?.active === false ? null : ((wh as any)?.end_time ?? "18:00");

    if (!workStart || !workEnd) {
      await replyAndLog(`Nesse dia não atendemos 😊\nQueres escolher outro? (ex: AMANHÃ ou 10/02)`, {
        step: "day_not_allowed",
        isoDate,
        dayNum,
      });
      return NextResponse.json({ ok: true });
    }

    const rescheduleFromId = ctx?.reschedule_from_appointment_id ?? null;
    if (ctx?.mode === "RESCHEDULE" && rescheduleFromId) {
      await db.from("appointments").update({ status: "CANCELLED", status_v2: "CANCELLED" }).eq("id", rescheduleFromId);
    }

    // determine chosen slot from context (fallbacks for compatibility)
    const chosen =
      ctx?.chosen ??
      (ctx?.pending_slot
        ? { startISO: ctx.pending_slot.startISO, endISO: ctx.pending_slot.endISO, label: ctx.pending_slot.label }
        : ctx?.start_time && ctx?.end_time
        ? { startISO: ctx.start_time, endISO: ctx.end_time, label: (ctx.start_time || "").slice(11, 16) }
        : null);

    if (!chosen) {
      console.error("processDaySelection: no chosen slot in context", { ctx });
      await replyAndLog("Ups… não consegui reservar esse horário. Por favor tenta novamente ou escolhe outro horário.", {
        step: "no_chosen_slot",
      });
      return NextResponse.json({ ok: true });
    }

    const insert = await db
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        start_time: chosen.startISO,
        end_time: chosen.endISO,
        status: "BOOKED",
        status_v2: "PENDING",
        customer_name_snapshot: customer.name ?? null,
        service_id: ctx?.service_id ?? null,
        service_name_snapshot: ctx?.service_name ?? null,
        service_duration_minutes_snapshot: Number(ctx?.duration_minutes) || null,
        service_price_cents_snapshot: Number(ctx?.price_cents_total ?? null) || null,
        service_currency_snapshot: "EUR",
        staff_id: ctx?.staff_id ?? null,
      })
      .select("id")
      .single();

    const apptId = insert.data?.id ?? null;

// ✅ múltiplos serviços (extensão segura)
const pickedIds: string[] = Array.isArray(ctx?.service_ids) ? ctx.service_ids.map((x: any) => String(x)).filter(Boolean) : [];
if (apptId && pickedIds.length > 1) {
  // carrega detalhes para snapshots (best-effort)
  const { data: svs } = await db.from("services").select("id,name,duration_minutes,price_cents,currency").in("id", pickedIds);
  const rows = (svs ?? []).map((s: any) => ({
    appointment_id: apptId,
    service_id: String(s.id),
    service_name_snapshot: String(s.name ?? ""),
    duration_minutes_snapshot: Number(s.duration_minutes ?? 0),
    price_cents_snapshot: Number(s.price_cents ?? 0),
    currency_snapshot: String(s.currency ?? "EUR"),
  }));
  if (rows.length) await db.from("appointment_services").insert(rows);
}


    await setSession("WAIT_CONFIRM", {
      mode: ctx?.mode ?? "NEW",
      pending_appointment_id: apptId,
    });

    const svcLine = ctx?.service_name ? `\nServiço: *${ctx.service_name}*` : "";
    await replyAndLog(
      `Combinado ✅\nFicou pré-reservado para *${formatDatePt(isoDate)}* às *${chosen.label}*.${svcLine}\n\nConfirmas? Responde *SIM* ou *NÃO*.`,
      { step: "confirm", appointment_id: apptId }
    );

    return NextResponse.json({ ok: true });
  }

  // Fallback IDLE: vai direto para categorias (sem menu extra)
  if (state === "IDLE") {
    await clearSession();
    await maybeWarnOutsideHours("new");

    return await sendCategoryMenu({ mode: "NEW", offset: 0 }, 0, "Olá 😊");
  }

  return NextResponse.json({ ok: true });
}