// src/app/api/appointments/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserFromAuthHeader } from "@/lib/supabase/user";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import { SCHEDULE_CONFIG } from "@/config/schedule";

const TZ = "Europe/Lisbon";

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function formatPtLisbon(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-PT", { timeZone: TZ }),
    time: d.toLocaleTimeString("pt-PT", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

// ✅ supabase pode devolver customers como array (join) → pegamos o primeiro
function pickCustomerName(customers: any): string {
  if (!customers) return "";
  if (Array.isArray(customers)) return String(customers?.[0]?.name || "");
  return String(customers?.name || "");
}
function pickCustomerPhone(customers: any): string {
  if (!customers) return "";
  if (Array.isArray(customers)) return String(customers?.[0]?.phone || "");
  return String(customers?.phone || "");
}

async function getCompanyIdFromProfiles(admin: SupabaseClient, uid: string) {
  {
    const r = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", uid)
      .maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  {
    const r = await admin
      .from("profiles")
      .select("company_id")
      .eq("uid", uid)
      .maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  {
    const r = await admin
      .from("profiles")
      .select("company_id")
      .eq("user_id", uid)
      .maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // ✅ teu supabaseAdmin é função
    const admin = supabaseAdmin();

    // ─────────────────────────────────────
    // Auth via Bearer token
    // ─────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const auth = await getUserFromAuthHeader(authHeader);

    if (!auth?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const uid = auth.user.id;

    // ─────────────────────────────────────
    // Body
    // ─────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const appointment_id = String(body?.appointment_id || "").trim();

    if (!appointment_id) {
      return NextResponse.json(
        { error: "appointment_id é obrigatório" },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────
    // Company do dono
    // ─────────────────────────────────────
    const companyId = await getCompanyIdFromProfiles(admin, uid);
    if (!companyId) {
      return NextResponse.json(
        { error: "User sem company (profiles.company_id)" },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────
    // Buscar marcação (e cliente)
    // ─────────────────────────────────────
    const apptRes = await admin
      .from("appointments")
      .select(
        `
        id,
        company_id,
        start_time,
        status,
        customer_name_snapshot,
        customers ( name, phone )
      `
      )
      .eq("id", appointment_id)
      .maybeSingle();

    if (apptRes.error) {
      return NextResponse.json({ error: apptRes.error.message }, { status: 500 });
    }
    if (!apptRes.data) {
      return NextResponse.json(
        { error: "Marcação não encontrada" },
        { status: 404 }
      );
    }

    if (apptRes.data.company_id !== companyId) {
      return NextResponse.json(
        { error: "Sem permissão para cancelar esta marcação" },
        { status: 403 }
      );
    }

    // ─────────────────────────────────────
    // Já cancelada?
    // ─────────────────────────────────────
    if (String(apptRes.data.status || "").toUpperCase().includes("CANC")) {
      return NextResponse.json({ ok: true, already_cancelled: true });
    }

    // ─────────────────────────────────────
    // Cancelar no Supabase (blindado)
    // ─────────────────────────────────────
    const upd = await admin
      .from("appointments")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment_id)
      .eq("company_id", companyId)
      .not("status", "ilike", "%canc%");

    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }

    // ─────────────────────────────────────
    // WhatsApp – reagendar
    // ─────────────────────────────────────
    const displayName =
      (apptRes.data.customer_name_snapshot || "").trim() ||
      pickCustomerName((apptRes.data as any).customers).trim() ||
      "Cliente";

    const rawPhone = pickCustomerPhone((apptRes.data as any).customers).trim();
    const phone = onlyDigits(rawPhone);

    if (phone) {
      const { date, time } = formatPtLisbon(apptRes.data.start_time);

      const bookingLink =
        (SCHEDULE_CONFIG as any)?.booking_url ||
        (SCHEDULE_CONFIG as any)?.public_booking_url ||
        "";

      const msg =
        `Olá ${displayName}! 😊\n\n` +
        `A sua marcação de ${date} às ${time} foi cancelada pelo estabelecimento.\n\n` +
        `Para reagendar, responda *REAGENDAR* aqui no WhatsApp` +
        (bookingLink ? ` ou clique no link: ${bookingLink}` : "") +
        `\n\nObrigado!`;

      // ✅ teu sendWhatsApp espera 2 args
      await sendWhatsApp(phone, msg);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
