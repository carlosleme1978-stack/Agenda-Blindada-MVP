import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/whatsapp/send";

const TZ = "Europe/Lisbon";

// ───────────────────────── Helpers ─────────────────────────
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

function isYesNo(text: string) {
  const t = stripDiacritics(text);
  return t === "SIM" || t === "NAO" || t === "NÃO";
}

function isIntentMark(text: string) {
  const t = stripDiacritics(text);
  return (
    t.includes("QUERO MARCAR") ||
    t === "MARCAR" ||
    t === "AGENDAR" ||
    t.includes("AGENDAR") ||
    t.includes("MARCACAO") ||
    t.includes("MARCAÇÃO")
  );
}

function isIntentReschedule(text: string) {
  const t = stripDiacritics(text);
  return t.includes("REAGENDAR") || t.includes("REMARCAR") || t === "REAGENDAR" || t === "REMARCAR";
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

function parseDayPt(text: string): string | null {
  const raw = normalizeInboundText(text);
  const t = stripDiacritics(raw);

  if (t === "HOJE") return toISODateLisbon(new Date());
  if (t === "AMANHA") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODateLisbon(d);
  }

  const clean = t.replace(/[^\d\/\-]/g, "");

  // dd/mm (ano opcional)
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

// ───────────────────────── Webhook Verification ─────────────────────────
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ───────────────────────── Webhook Messages ─────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message?.text?.body || !message?.from) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();

  const fromDigits = onlyDigits(message.from);
  const textRaw = normalizeInboundText(message.text.body);
  const waMessageId: string | undefined = message.id;

  // Idempotência (inbound)
  if (waMessageId) {
    const { data: existing } = await db
      .from("message_log")
      .select("id")
      .contains("meta", { wa_message_id: waMessageId })
      .limit(1);
    if (existing && existing.length > 0) return NextResponse.json({ ok: true });
  }

  // Log inbound
  await db.from("message_log").insert({
    direction: "inbound",
    customer_phone: fromDigits,
    body: textRaw,
    meta: { wa_message_id: waMessageId ?? null, raw: message },
  });

  // Customer + company (MVP simples)
  const candidates = [fromDigits, `+${fromDigits}`];

  const { data: custFound } = await db
    .from("customers")
    .select("id, phone, company_id, name")
    .in("phone", candidates)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let customer = custFound;

  if (!customer) {
    const { data: company } = await db.from("companies").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!company?.id) return NextResponse.json({ ok: true });

    const created = await db
      .from("customers")
      .insert({ company_id: company.id, phone: fromDigits, name: null, consent_whatsapp: true })
      .select("id, phone, company_id, name")
      .single();

    customer = created.data;
  }

  const companyId = customer.company_id;

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

  // Carregar sessão
  const { data: session0 } = await db
    .from("chat_sessions")
    .select("state, context")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  const state = session0?.state || "IDLE";
  const ctx: any = session0?.context || {};

  // ✅ setSession CORRIGIDO (onConflict)
  async function setSession(nextState: string, nextCtx: any) {
    const payload = {
      company_id: companyId,
      customer_id: customer.id,
      state: nextState,
      context: nextCtx ?? {},
      updated_at: new Date().toISOString(),
    };

    const r = await db.from("chat_sessions").upsert(payload, {
      onConflict: "company_id,customer_id",
    });

    if (r.error) {
      await db.from("message_log").insert({
        company_id: companyId,
        direction: "outbound",
        customer_phone: fromDigits,
        body: "DEBUG: setSession error",
        meta: { error: r.error.message, payload },
      });
    }
  }

  async function clearSession() {
    await setSession("IDLE", {});
  }

  // ───────────────────────── Intent: REAGENDAR ─────────────────────────
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

    // tenta serviços
    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);

    if (services && services.length > 0) {
      await setSession("ASK_SERVICE", {
        mode: "RESCHEDULE",
        reschedule_from_appointment_id: nextAppt?.id ?? null,
        offset: 0,
      });
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(`🔁 Reagendar\nQual serviço você deseja?\n${lines.join("\n")}\nResponda 1, 2 ou 3.`, {
        flow: "reschedule",
        step: "service",
        state_before: state,
        state_after: "ASK_SERVICE",
      });
    } else {
      await setSession("ASK_DAY", {
        mode: "RESCHEDULE",
        reschedule_from_appointment_id: nextAppt?.id ?? null,
        duration_minutes: 30,
        offset: 0,
      });
      await replyAndLog("🔁 Reagendar\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)", {
        flow: "reschedule",
        step: "day",
        state_before: state,
        state_after: "ASK_DAY",
      });
    }

    return NextResponse.json({ ok: true });
  }

  // ───────────────────────── Intent: QUERO MARCAR ─────────────────────────
  if (isIntentMark(textRaw)) {
    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);

    if (services && services.length > 0) {
      await setSession("ASK_SERVICE", { mode: "NEW", offset: 0 });
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(`📅 Marcação\nQual serviço você deseja?\n${lines.join("\n")}\nResponda 1, 2 ou 3.`, {
        flow: "new",
        step: "service",
        state_before: state,
        state_after: "ASK_SERVICE",
      });
    } else {
      await setSession("ASK_DAY", { mode: "NEW", duration_minutes: 30, offset: 0 });
      await replyAndLog("📅 Marcação\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)", {
        flow: "new",
        step: "day",
        state_before: state,
        state_after: "ASK_DAY",
      });
    }

    return NextResponse.json({ ok: true });
  }

  // ───────────────────────── SIM/NÃO (confirmação) ─────────────────────────
  if (isYesNo(textRaw)) {
    const yn = stripDiacritics(textRaw) === "NAO" ? "NÃO" : textRaw;

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

    await replyAndLog(reply, { flow: "confirm", appointment_id: appt.id });
    await clearSession();
    return NextResponse.json({ ok: true });
  }

  // ───────────────────────── State: ASK_SERVICE ─────────────────────────
  if (state === "ASK_SERVICE") {
    const choice = Number(stripDiacritics(textRaw));

    const { data: services } = await db
      .from("services")
      .select("id,name,duration_minutes")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);

    if (!services || services.length === 0) {
      await setSession("ASK_DAY", { ...ctx, duration_minutes: 30, offset: 0 });
      await replyAndLog("Qual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)", { step: "day" });
      return NextResponse.json({ ok: true });
    }

    if (![1, 2, 3].includes(choice) || !services[choice - 1]) {
      const lines = services.slice(0, 3).map((s, i) => `${i + 1}) ${s.name} (${s.duration_minutes}min)`);
      await replyAndLog(`Responda 1, 2 ou 3:\n${lines.join("\n")}`, { step: "service_retry" });
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

    await replyAndLog(`✅ Serviço: ${svc.name}\nQual dia você prefere? (ex: HOJE, AMANHÃ, 10/02)`, { step: "day" });
    return NextResponse.json({ ok: true });
  }

  // ───────────────────────── State: ASK_DAY ─────────────────────────
  if (state === "ASK_DAY") {
    const isoDate = parseDayPt(textRaw);

    if (!isoDate) {
      await replyAndLog("Não entendi o dia. Envie: HOJE, AMANHÃ ou 10/02", { step: "day_retry" });
      return NextResponse.json({ ok: true });
    }

    const duration = Number(ctx?.duration_minutes) || 30;

    const allSlots = buildSlotsForDay({
      isoDate,
      durationMinutes: duration,
      stepMinutes: 30,
      workStart: "09:00",
      workEnd: "18:00",
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

    const free = allSlots.filter((s) => !(dayAppts || []).some((a: any) => overlaps(s.startISO, s.endISO, a.start_time, a.end_time)));

    if (free.length === 0) {
      await replyAndLog(`Não há horários disponíveis em ${formatDatePt(isoDate)}. Tente outro dia.`, { step: "no_slots" });
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

    await replyAndLog(`📅 ${formatDatePt(isoDate)}\nEscolha um horário:\n${lines}\n4) Ver mais horários`, { step: "slots_page_0" });
    return NextResponse.json({ ok: true });
  }

  // ───────────────────────── State: SHOW_SLOTS ─────────────────────────
  if (state === "SHOW_SLOTS") {
    const n = Number(stripDiacritics(textRaw));
    const slots: any[] = Array.isArray(ctx?.slots) ? ctx.slots : [];
    const isoDate: string | null = ctx?.isoDate ?? null;
    const offset: number = Number(ctx?.offset) || 0;

    if (!isoDate || slots.length === 0) {
      await clearSession();
      await replyAndLog("Vamos começar de novo. Envie: QUERO MARCAR", { step: "reset" });
      return NextResponse.json({ ok: true });
    }

    if (n === 4) {
      const nextOffset = offset + 3;
      const page = slots.slice(nextOffset, nextOffset + 3);

      if (page.length === 0) {
        await replyAndLog("Não há mais horários. Escolha 1, 2 ou 3 da lista anterior, ou envie outro dia.", { step: "no_more_slots" });
        return NextResponse.json({ ok: true });
      }

      const lines = page.map((s, i) => `${i + 1}) ${s.label}`).join("\n");
      await setSession("SHOW_SLOTS", { ...ctx, offset: nextOffset });
      await replyAndLog(`📅 ${formatDatePt(isoDate)}\nMais horários:\n${lines}\n4) Ver mais horários`, { step: `slots_page_${nextOffset}` });
      return NextResponse.json({ ok: true });
    }

    if (![1, 2, 3].includes(n)) {
      await replyAndLog("Responda 1, 2, 3 ou 4 (mais horários).", { step: "slot_retry" });
      return NextResponse.json({ ok: true });
    }

    const chosen = slots[offset + (n - 1)];
    if (!chosen) {
      await replyAndLog("Esse horário não está disponível. Responda 4 para ver mais horários.", { step: "slot_invalid" });
      return NextResponse.json({ ok: true });
    }

    // Reagendar: cancela a marcação antiga (se existir)
    const rescheduleFromId = ctx?.reschedule_from_appointment_id ?? null;
    if (ctx?.mode === "RESCHEDULE" && rescheduleFromId) {
      await db.from("appointments").update({ status: "CANCELLED" }).eq("id", rescheduleFromId);
    }

    const ins = await db
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

    await setSession("WAIT_CONFIRM", {
      pending_appointment_id: ins.data?.id ?? null,
      mode: ctx?.mode ?? "NEW",
    });

    const svcLine = ctx?.service_name ? `\nServiço: ${ctx.service_name}` : "";
    await replyAndLog(`✅ Reservei para ${formatDatePt(isoDate)} às ${chosen.label}.${svcLine}\nConfirma? Responda SIM ou NÃO.`, {
      step: "confirm",
      appointment_id: ins.data?.id ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
