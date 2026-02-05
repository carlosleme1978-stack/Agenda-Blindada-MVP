
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const TZ = "Europe/Lisbon";

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeInboundText(v: string) {
  return String(v || "")
    .normalize("NFKC") // normaliza unicode (iOS/WhatsApp)
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isIntentMark(text: string) {
  return (
    text.includes("QUERO MARCAR") ||
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

function isYesNo(text: string) {
  return text === "SIM" || text === "NÃO" || text === "NAO";
}

function toISODateLisbon(date: Date) {
  // queremos só a data (YYYY-MM-DD) em Lisboa
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

/**
 * NOVO – usado para validar dias de trabalho da empresa
 * Retorna: 1=Seg ... 7=Dom
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

function stripDiacritics(s: string) {
  // remove acentos (AMANHÃ -> AMANHA)
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function parseDayPt(text: string): string | null {
  const t0 = normalizeInboundText(text);
  const t = stripDiacritics(t0); // agora fica sem acentos

  if (t === "HOJE") return toISODateLisbon(new Date());

  if (t === "AMANHA") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODateLisbon(d);
  }

  // mantém só dígitos e separadores
  const clean = t.replace(/[^\d\/\-]/g, "");

  // dd/mm ou dd-mm
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

function formatTimePt(isoDate: string, hhmm: string) {
  // hhmm "10:30"
  return hhmm;
}

function addMinutesHHMM(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  // strings ISO
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

function buildSlotsForDay(params: {
  isoDate: string; // YYYY-MM-DD
  durationMinutes: number;
  stepMinutes: number;
  workStart: string; // "09:00"
  workEnd: string; // "18:00"
}) {
  const { isoDate, durationMinutes, stepMinutes, workStart, workEnd } = params;
  const slots: { startISO: string; endISO: string; label: string }[] = [];

  // Vamos construir horários em Lisboa, mas gravar ISO em UTC
  // truque: criar base em Lisboa como string e converter via Date
  // usando "Europe/Lisbon" é chato sem lib; então fazemos assim:
  // - assumimos que start/end enviados para criação usam ISO e backend aceita
  // - aqui só geramos labels e depois, ao gravar, usamos Date com TZ Lisbon via toLocaleString não confiável
  // Para MVP: vamos gravar start_time/end_time como ISO usando Date do servidor (UTC),
  // MAS mantendo o horário que o utilizador vê. Em produção, o ideal é usar luxon/dayjs.
  // Como já tens cron e UI a usar Lisbon no template, isto fica ok para MVP.

  let cur = workStart;
  while (true) {
    const next = addMinutesHHMM(cur, durationMinutes);
    // se next > workEnd, para
    if (next > workEnd) break;

    // ISO (UTC) - MVP: usar `${isoDate}T${cur}:00.000Z` (assume Z)
    const startISO = `${isoDate}T${cur}:00.000Z`;
    const endISO = `${isoDate}T${next}:00.000Z`;

    slots.push({ startISO, endISO, label: cur });
    cur = addMinutesHHMM(cur, stepMinutes);
  }

  return slots;
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
  if (!message?.text?.body || !message?.from) {
    return NextResponse.json({ ok: true });
  }

  const rawFrom: string = message.from;
  const fromDigits = onlyDigits(rawFrom);
  const textRaw = normalizeInboundText(message.text.body);
  const waMessageId: string | undefined = message.id;

  const db = supabaseAdmin();

  // Idempotência inbound
  if (waMessageId) {
    const { data: existing } = await db
      .from("message_log")
      .select("id")
      .contains("meta", { wa_message_id: waMessageId })
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  // Log inbound
  await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: fromDigits,
    body: textRaw,
    meta: {
      wa_message_id: waMessageId ?? null,
      raw: message,
    },
  });

  // ─────────────────────────────────────────────
  // Encontrar customer e company (MVP: pelo phone; se não existir, tenta 1ª company)
  // ─────────────────────────────────────────────
  const candidates = [fromDigits, `+${fromDigits}`];

  let customer: any = null;

  // tenta achar customer em qualquer company (MVP)
  {
    const r = await db
      .from("customers")
      .select("id, phone, company_id, name")
      .in("phone", candidates)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    customer = r.data ?? null;
  }

  // Se não existe customer, cria na 1ª empresa (MVP simples)
  if (!customer) {
    const { data: company } = await db
      .from("companies")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!company?.id) {
      return NextResponse.json({ ok: true });
    }

    const created = await db
      .from("customers")
      .insert({
        company_id: company.id,
        phone: fromDigits,
        name: null,
        consent_whatsapp: true,
      })
      .select("id, phone, company_id, name")
      .single();

    customer = created.data;
  }

  const companyId = customer.company_id;

  // ─────────────────────────────────────────────
  // Sessão do chat (estado)
  // ─────────────────────────────────────────────
  const { data: session0 } = await db
    .from("chat_sessions")
    .select("id, state, context")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  const session = session0 ?? { state: "IDLE", context: {} };
  const state: string = session.state || "IDLE";
  const ctx: any = session.context || {};

async function setSession(nextState: string, nextCtx: any) {
  // 1) tenta UPDATE
  const upd = await db
    .from("chat_sessions")
    .update({
      state: nextState,
      context: nextCtx ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .select("id");

  if (upd.error) {
    console.error("setSession update error:", upd.error);
    return;
  }

  // se atualizou, acabou
  if (upd.data && upd.data.length > 0) return;

  // 2) se não existia linha, faz INSERT
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
    await sendWhatsApp(fromDigits, bodyText);
    await db.from("message_log").insert({
      company_id: companyId,
      direction: "outbound",
      customer_phone: fromDigits,
      body: bodyText,
      meta: { in_reply_to: waMessageId ?? null, ...meta },
    });
  }

  // ─────────────────────────────────────────────
  // Comandos globais
  // ─────────────────────────────────────────────
  // ⛔️ Só processa intents globais se NÃO estivermos num fluxo
if (state === "IDLE") {

  if (isIntentReschedule(textRaw)) {
    // buscar próxima marcação ativa (BOOKED/CONFIRMED) e guardar para cancelar quando escolher novo slot
    const { data: nextAppt } = await db
      .from("appointments")
      .select("id,status,start_time")
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .in("status", ["BOOKED", "CONFIRMED"])
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    await setSession("ASK_SERVICE", {
      mode: "RESCHEDULE",
      reschedule_from_appointment_id: nextAppt?.id ?? null,
      offset: 0,
    });

    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);

    if (services && services.length > 0) {
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(
        `🔁 Reagendar\nQual serviço você deseja?\n${lines.join("\n")}\nResponda 1, 2 ou 3.`,
        { flow: "reschedule", step: "service" }
      );
    } else {
      await setSession("ASK_DAY", {
        mode: "RESCHEDULE",
        reschedule_from_appointment_id: nextAppt?.id ?? null,
        service_id: null,
        duration_minutes: 30,
        offset: 0,
      });
      await replyAndLog(
        "🔁 Reagendar\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)",
        { flow: "reschedule", step: "day" }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (isIntentMark(textRaw)) {
    await setSession("ASK_SERVICE", { mode: "NEW", offset: 0 });

    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);

    if (services && services.length > 0) {
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(
        `📅 Marcação\nQual serviço você deseja?\n${lines.join("\n")}\nResponda 1, 2 ou 3.`,
        { flow: "new", step: "service" }
      );
    } else {
      await setSession("ASK_DAY", { mode: "NEW", service_id: null, duration_minutes: 30, offset: 0 });
      await replyAndLog(
        "📅 Marcação\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)",
        { flow: "new", step: "day" }
      );
    }

    return NextResponse.json({ ok: true });
  }

}

  // ─────────────────────────────────────────────
  // CONFIRMAÇÃO SIM / NÃO (mantém o teu comportamento, mas também suporta WAIT_CONFIRM)
  // ─────────────────────────────────────────────
  if (isYesNo(textRaw)) {
    const yn = textRaw === "NAO" ? "NÃO" : textRaw;

    // Se temos no contexto um appointment pendente, usa ele
    const pendingId = ctx?.pending_appointment_id ?? null;

    let appt: any = null;
    if (pendingId) {
      const r = await db
        .from("appointments")
        .select("id,status")
        .eq("id", pendingId)
        .maybeSingle();
      appt = r.data ?? null;
    }

    // fallback: última BOOKED do cliente
    if (!appt) {
      const r = await db
        .from("appointments")
        .select("id,status")
        .eq("company_id", companyId)
        .eq("customer_id", customer.id)
        .eq("status", "BOOKED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      appt = r.data ?? null;
    }

    if (!appt) return NextResponse.json({ ok: true });

    const newStatus = yn === "SIM" ? "CONFIRMED" : "CANCELLED";
    await db.from("appointments").update({ status: newStatus }).eq("id", appt.id);

    const reply =
      yn === "SIM"
        ? "✅ Perfeito! Sua marcação foi confirmada. Obrigado."
        : "❌ Ok! Sua marcação foi cancelada. Se quiser remarcar, responda: QUERO MARCAR";

    await replyAndLog(reply, { appointment_id: appt.id, flow: "confirm" });
    await clearSession();
    return NextResponse.json({ ok: true });
  }

  // ─────────────────────────────────────────────
  // State machine (serviço → dia → horários → escolher → criar BOOKED)
  // ─────────────────────────────────────────────
  if (state === "ASK_SERVICE") {
  // força leitura segura do número
  const choiceRaw = stripDiacritics(textRaw).replace(/[^\d]/g, "");
  const choice = Number(choiceRaw);

  const { data: services } = await db
    .from("services")
    .select("id,name,duration_minutes")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  // segurança: se não houver serviços, pula direto para o dia
  if (!services || services.length === 0) {
    await setSession("ASK_DAY", { duration_minutes: 30, offset: 0 });
    await replyAndLog("📅 Qual dia você prefere? (HOJE, AMANHÃ, 10/02)");
    return NextResponse.json({ ok: true });
  }

  // se não for 1,2,3 válido
  if (!choice || !services[choice - 1]) {
    const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
    await replyAndLog(`Responda com o número do serviço:\n${lines.join("\n")}`);
    return NextResponse.json({ ok: true });
  }

  const svc = services[choice - 1];

  // AVANÇA DE VERDADE O ESTADO
  await setSession("ASK_DAY", {
    service_id: svc.id,
    service_name: svc.name,
    duration_minutes: svc.duration_minutes,
    offset: 0,
  });

  await replyAndLog(
    `✅ Serviço escolhido: ${svc.name}\nAgora, qual dia você prefere? (HOJE, AMANHÃ, 10/02)`
  );

  return NextResponse.json({ ok: true });
}

if (state === "ASK_DAY") {
  const isoDate = parseDayPt(textRaw);
  if (!isoDate) {
    await replyAndLog("Não entendi o dia. Envie: HOJE, AMANHÃ ou 10/02", {
      step: "day_retry",
    });
    return NextResponse.json({ ok: true });
  }

  const duration = Number(ctx?.duration_minutes) || 30;

  // ─────────────────────────────
  // LER CONFIGURAÇÕES DA EMPRESA
  // ─────────────────────────────
  const { data: cfg, error: cfgErr } = await db
    .from("companies")
    .select("work_start, work_end, slot_step_minutes, work_days")
    .eq("id", companyId)
    .maybeSingle();

  if (cfgErr || !cfg) {
    await replyAndLog("Erro ao carregar horários da empresa.", {
      step: "cfg_error",
    });
    return NextResponse.json({ ok: true });
  }

  const workStart = cfg.work_start ?? "09:00";
  const workEnd = cfg.work_end ?? "18:00";
  const stepMinutes = Number(cfg.slot_step_minutes ?? 30);
  const workDays: number[] = cfg.work_days ?? [1, 2, 3, 4, 5];

  // validar dia da semana
  const dayNum = isoDayNumberLisbon(isoDate);
  if (!workDays.includes(dayNum)) {
    await replyAndLog(
      "Não atendemos nesse dia. Escolha outro dia.",
      { step: "day_not_allowed", isoDate }
    );
    return NextResponse.json({ ok: true });
  }

  // ─────────────────────────────
  // GERAR HORÁRIOS DISPONÍVEIS
  // ─────────────────────────────
  const allSlots = buildSlotsForDay({
    isoDate,
    durationMinutes: duration,
    stepMinutes,
    workStart,
    workEnd,
  });

  const dayStart = `${isoDate}T00:00:00.000Z`;
  const dayEnd = `${isoDate}T23:59:59.999Z`;

  const { data: dayAppts } = await db
    .from("appointments")
    .select("start_time,end_time,status")
    .eq("company_id", companyId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .in("status", ["BOOKED", "CONFIRMED"]);

  const free = allSlots.filter((s) => {
    return !(dayAppts || []).some((a: any) =>
      overlaps(s.startISO, s.endISO, a.start_time, a.end_time)
    );
  });

  if (free.length === 0) {
    await replyAndLog(
      "Não há horários disponíveis nesse dia. Escolha outro.",
      { step: "no_slots" }
    );
    return NextResponse.json({ ok: true });
  }

  const page = free.slice(0, 3);
  const lines = page
    .map((s, i) => `${i + 1}) ${s.label}`)
    .join("\n");

  await setSession("SHOW_SLOTS", {
    ...ctx,
    isoDate,
    offset: 0,
    slots: free,
  });

  await replyAndLog(
    `📅 ${formatDatePt(isoDate)}\nEscolha um horário:\n${lines}\n4) Ver mais horários`,
    { step: "slots_page_0" }
  );

  return NextResponse.json({ ok: true });
}
}

