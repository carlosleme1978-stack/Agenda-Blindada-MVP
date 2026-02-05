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
 * usado para validar dias de trabalho da empresa
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
  const t = stripDiacritics(t0);

  if (t === "HOJE") return toISODateLisbon(new Date());

  if (t === "AMANHA") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODateLisbon(d);
  }

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
  isoDate: string; // YYYY-MM-DD
  durationMinutes: number;
  stepMinutes: number;
  workStart: string; // "09:00"
  workEnd: string; // "18:00"
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

  // Log inbound (sempre)
  await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: fromDigits,
    body: textRaw,
    meta: { wa_message_id: waMessageId ?? null, raw: message },
  });

  // ─────────────────────────────────────────────
  // Encontrar customer e company
  // ─────────────────────────────────────────────
  const candidates = [fromDigits, `+${fromDigits}`];

  let customer: any = null;

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

  if (!customer) {
    const { data: company } = await db
      .from("companies")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!company?.id) return NextResponse.json({ ok: true });

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
    .select("state, context")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  const state: string = session0?.state || "IDLE";
  const ctx: any = session0?.context || {};

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
      .select("company_id");

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

  // ─────────────────────────────────────────────
  // Intents globais só quando IDLE
  // ─────────────────────────────────────────────
  if (state === "IDLE") {
    if (isIntentReschedule(textRaw)) {
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
        const lines = services
          .slice(0, 3)
          .map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);

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

        await replyAndLog("🔁 Reagendar\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)", {
          flow: "reschedule",
          step: "day",
        });
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
        const lines = services
          .slice(0, 3)
          .map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);

        await replyAndLog(
          `📅 Marcação\nQual serviço você deseja?\n${lines.join("\n")}\nResponda 1, 2 ou 3.`,
          { flow: "new", step: "service" }
        );
      } else {
        await setSession("ASK_DAY", { mode: "NEW", service_id: null, duration_minutes: 30, offset: 0 });

        await replyAndLog("📅 Marcação\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)", {
          flow: "new",
          step: "day",
        });
      }

      return NextResponse.json({ ok: true });
    }
  }

  // ─────────────────────────────────────────────
  // Confirmação SIM / NÃO (funciona em qualquer estado)
  // ─────────────────────────────────────────────
  if (isYesNo(textRaw)) {
    const yn = textRaw === "NAO" ? "NÃO" : textRaw;
    const pendingId = ctx?.pending_appointment_id ?? null;

    let appt: any = null;

    if (pendingId) {
      const r = await db.from("appointments").select("id,status").eq("id", pendingId).maybeSingle();
      appt = r.data ?? null;
    }

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
  // State machine
  // ─────────────────────────────────────────────

  // ASK_SERVICE
  if (state === "ASK_SERVICE") {
    const choiceRaw = stripDiacritics(textRaw).replace(/[^\d]/g, "");
    const choice = Number(choiceRaw);

    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (!services || services.length === 0) {
      await setSession("ASK_DAY", { ...ctx, duration_minutes: 30, offset: 0 });
      await replyAndLog("📅 Qual dia você prefere? (HOJE, AMANHÃ, 10/02)");
      return NextResponse.json({ ok: true });
    }

    if (!choice || !services[choice - 1]) {
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(`Responda com o número do serviço:\n${lines.join("\n")}`, { step: "service_retry" });
      return NextResponse.json({ ok: true });
    }

    const svc = services[choice - 1];

    await setSession("ASK_DAY", {
      ...ctx,
      service_id: svc.id,
      service_name: svc.name,
      duration_minutes: svc.duration_minutes,
      offset: 0,
    });

    await replyAndLog(`✅ Serviço escolhido: ${svc.name}\nAgora, qual dia você prefere? (HOJE, AMANHÃ, 10/02)`, {
      step: "day",
    });

    return NextResponse.json({ ok: true });
  }

  // ASK_DAY
  if (state === "ASK_DAY") {
    const isoDate = parseDayPt(textRaw);
    if (!isoDate) {
      await replyAndLog("Não entendi o dia. Envie: HOJE, AMANHÃ ou 10/02", { step: "day_retry" });
      return NextResponse.json({ ok: true });
    }

    const duration = Number(ctx?.duration_minutes) || 30;

    const { data: cfg, error: cfgErr } = await db
      .from("companies")
      .select("work_start, work_end, slot_step_minutes, work_days")
      .eq("id", companyId)
      .maybeSingle();

    if (cfgErr || !cfg) {
      await replyAndLog("Erro ao carregar horários da empresa.", { step: "cfg_error" });
      return NextResponse.json({ ok: true });
    }

    const workStart = cfg.work_start ?? "09:00";
    const workEnd = cfg.work_end ?? "18:00";
    const stepMinutes = Number(cfg.slot_step_minutes ?? 30) || 30;
    const workDays: number[] = (cfg.work_days as any) ?? [1, 2, 3, 4, 5];

    const dayNum = isoDayNumberLisbon(isoDate);
    if (!workDays.includes(dayNum)) {
      await replyAndLog("Não atendemos nesse dia. Escolha outro dia.", { step: "day_not_allowed", isoDate, dayNum });
      return NextResponse.json({ ok: true });
    }

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
      return !(dayAppts || []).some((a: any) => overlaps(s.startISO, s.endISO, a.start_time, a.end_time));
    });

    if (free.length === 0) {
      await replyAndLog("Não há horários disponíveis nesse dia. Escolha outro.", { step: "no_slots" });
      return NextResponse.json({ ok: true });
    }

    const page = free.slice(0, 3);
    const lines = page.map((s, i) => `${i + 1}) ${s.label}`).join("\n");

    await setSession("SHOW_SLOTS", {
      ...ctx,
      isoDate,
      offset: 0,
      slots: free,
    });

    await replyAndLog(`📅 ${formatDatePt(isoDate)}\nEscolha um horário:\n${lines}\n4) Ver mais horários`, {
      step: "slots_page_0",
    });

    return NextResponse.json({ ok: true });
  }

  // SHOW_SLOTS
  if (state === "SHOW_SLOTS") {
    // aceita "4", "4 ", "4️⃣" etc.
    const nRaw = stripDiacritics(textRaw).replace(/[^\d]/g, "");
    const n = Number(nRaw);

    const slots: any[] = Array.isArray(ctx?.slots) ? ctx.slots : [];
    const isoDate: string | null = ctx?.isoDate ?? null;
    const offset: number = Number(ctx?.offset) || 0;

    if (!isoDate || slots.length === 0) {
      await clearSession();
      await replyAndLog("Vamos começar de novo. Envie: QUERO MARCAR", { step: "reset" });
      return NextResponse.json({ ok: true });
    }

    // 4 = mais horários
    if (n === 4) {
      const nextOffset = offset + 3;
      const page = slots.slice(nextOffset, nextOffset + 3);

      if (page.length === 0) {
        await replyAndLog(
          "Não há mais horários. Escolha 1, 2 ou 3 da lista anterior, ou envie outro dia.",
          { step: "no_more_slots" }
        );
        return NextResponse.json({ ok: true });
      }

      const lines = page.map((s, i) => `${i + 1}) ${s.label}`).join("\n");

      await setSession("SHOW_SLOTS", { ...ctx, offset: nextOffset });

      await replyAndLog(`📅 ${formatDatePt(isoDate)}\nMais horários:\n${lines}\n4) Ver mais horários`, {
        step: `slots_page_${nextOffset}`,
      });

      return NextResponse.json({ ok: true });
    }

    // escolher 1/2/3
    if (![1, 2, 3].includes(n)) {
      await replyAndLog("Responda 1, 2, 3 ou 4 (mais horários).", { step: "slot_retry" });
      return NextResponse.json({ ok: true });
    }

    const chosen = slots[offset + (n - 1)];
    if (!chosen) {
      await replyAndLog("Esse horário não está disponível. Responda 4 para ver mais horários.", { step: "slot_invalid" });
      return NextResponse.json({ ok: true });
    }

    // reagendar: cancelar antiga
    const rescheduleFromId = ctx?.reschedule_from_appointment_id ?? null;
    if (ctx?.mode === "RESCHEDULE" && rescheduleFromId) {
      await db.from("appointments").update({ status: "CANCELLED" }).eq("id", rescheduleFromId);
    }

    // criar BOOKED
    const insert = await db
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        start_time: chosen.startISO,
        end_time: chosen.endISO,
        status: "BOOKED",
        customer_name_snapshot: customer.name ?? null,
        service_id: ctx?.service_id ?? null,
        service_name_snapshot: ctx?.service_name ?? null,
        service_duration_minutes_snapshot: Number(ctx?.duration_minutes) || null,
      })
      .select("id")
      .single();

    const apptId = insert.data?.id ?? null;

    await setSession("WAIT_CONFIRM", {
      mode: ctx?.mode ?? "NEW",
      pending_appointment_id: apptId,
    });

    const svcLine = ctx?.service_name ? `\nServiço: ${ctx.service_name}` : "";
    await replyAndLog(
      `✅ Reservei para ${formatDatePt(isoDate)} às ${chosen.label}.${svcLine}\nConfirma? Responda SIM ou NÃO.`,
      { step: "confirm", appointment_id: apptId }
    );

    return NextResponse.json({ ok: true });
  }

  // fallback
  return NextResponse.json({ ok: true });
}

