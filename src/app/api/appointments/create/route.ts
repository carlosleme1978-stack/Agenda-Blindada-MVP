import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/server/auth";
import { sendWhatsApp } from "@/lib/whatsapp/send";

type Body = {
  customerPhone?: string;
  customerName?: string;
  startISO?: string; // vindo do input datetime-local (ex: "2026-02-10T14:30")
  durationMinutes?: number;
  serviceId?: string | null;
  staffId?: string | null;
};

function normalizePhone(p: string): string {
  const s = String(p || "").trim();
  if (!s) return s;
  if (s.startsWith("+")) return "+" + s.slice(1).replace(/\D/g, "");
  return s.replace(/\D/g, "");
}

// datetime-local NÃO tem timezone. Precisamos interpretar como horário local e converter para ISO (UTC).
function parseLocalDateTimeToUTCISOString(dt: string): { startISO: string; start: Date } | null {
  // aceita "YYYY-MM-DDTHH:mm" (ou com segundos)
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dt);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] ? Number(m[6]) : 0;

  const d = new Date(year, month, day, hour, minute, second); // local time
  if (isNaN(d.getTime())) return null;

  return { startISO: d.toISOString(), start: d };
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60 * 1000);
}

export async function POST(req: NextRequest) {
  try {
    // ✅ SSR cookies auth (companyId vem do server/auth)
    const { supabase, companyId } = await getAuthContext();

    const body = (await req.json().catch(() => ({}))) as Body;

    const customerPhone = normalizePhone(body.customerPhone || "");
    const customerName = (body.customerName || "").trim() || null;
    const startISOInput = String(body.startISO || "").trim();

    // ✅ staff obrigatório (agenda por staff)
    const staffId = (body.staffId || "").trim();
    if (!staffId) {
      return NextResponse.json({ error: "Staff é obrigatório" }, { status: 400 });
    }

    if (!customerPhone) {
      return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    }
    if (!startISOInput) {
      return NextResponse.json({ error: "Data/hora inválida" }, { status: 400 });
    }

    // duration: se vier vazio, tenta pegar do service; senão usa 30
    let durationMinutes = Number(body.durationMinutes ?? NaN);

    // ✅ valida e resolve service_id (e garante que o service pertence à empresa)
    const serviceId = body.serviceId ? String(body.serviceId) : null;
    if (serviceId) {
      const { data: svc, error: svcErr } = await supabase
        .from("services")
        .select("id,duration_minutes")
        .eq("company_id", companyId)
        .eq("id", serviceId)
        .single();

      if (svcErr) {
        return NextResponse.json({ error: "Serviço inválido" }, { status: 400 });
      }
      if (!Number.isFinite(durationMinutes)) {
        durationMinutes = Number(svc?.duration_minutes ?? 30);
      }
    }

    if (!Number.isFinite(durationMinutes)) durationMinutes = 30;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 8 * 60) {
      return NextResponse.json({ error: "Duração inválida" }, { status: 400 });
    }

    const parsed = parseLocalDateTimeToUTCISOString(startISOInput);
    if (!parsed) {
      return NextResponse.json({ error: "Data/hora inválida" }, { status: 400 });
    }

    const startUTCISO = parsed.startISO;
    const startLocal = parsed.start;
    const endLocal = addMinutes(startLocal, durationMinutes);
    const endUTCISO = endLocal.toISOString();

    // ✅ garante que o staff pertence à empresa
    const { data: staff, error: staffErr } = await supabase
      .from("staff")
      .select("id, active")
      .eq("company_id", companyId)
      .eq("id", staffId)
      .single();

    if (staffErr || !staff?.id) {
      return NextResponse.json({ error: "Staff inválido" }, { status: 400 });
    }
    if (staff.active === false) {
      return NextResponse.json({ error: "Staff inativo" }, { status: 400 });
    }

    // ✅ anti-conflito por staff (não deixa sobrepor)
    // overlap: start < existing_end AND end > existing_start
    const { data: conflicts, error: confErr } = await supabase
      .from("appointments")
      .select("id")
      .eq("company_id", companyId)
      .eq("staff_id", staffId)
      .neq("status", "CANCELLED")
      .lt("start_time", endUTCISO)
      .gt("end_time", startUTCISO)
      .limit(1);

    if (confErr) {
      return NextResponse.json({ error: confErr.message }, { status: 500 });
    }
    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "Horário indisponível para este staff" },
        { status: 409 }
      );
    }

    // 1) upsert customer (unique by company_id + phone)
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .upsert(
        {
          company_id: companyId,
          phone: customerPhone,
          name: customerName,
          consent_whatsapp: true,
        },
        { onConflict: "company_id,phone" }
      )
      .select("id,phone,name")
      .single();

    if (custErr || !customer) {
      return NextResponse.json(
        { error: custErr?.message || "Falha ao criar cliente" },
        { status: 500 }
      );
    }

    // 2) create appointment
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        start_time: startUTCISO,
        end_time: endUTCISO,
        status: "BOOKED", // ✅ sem PENDING
        customer_name_snapshot: customerName,
        service_id: serviceId,
        staff_id: staffId,
      })
      .select("id,start_time,end_time,status,staff_id,service_id")
      .single();

    if (apptErr || !appt) {
      return NextResponse.json(
        { error: apptErr?.message || "Falha ao criar marcação" },
        { status: 500 }
      );
    }

    // 3) WhatsApp (best-effort)
    try {
      const when = startLocal.toLocaleString("pt-PT", {
        dateStyle: "short",
        timeStyle: "short",
      });
      const hello = customerName ? `Olá, ${customerName}!` : "Olá!";
      const msg =
        `${hello}\n\n` +
        `A sua marcação está registada para ${when}.\n` +
        `Responda SIM para confirmar ou NAO para cancelar.`;

      await sendWhatsApp(customerPhone, msg);
    } catch (e) {
      console.error("WHATSAPP send failed (non-blocking):", e);
    }

    return NextResponse.json({ appointment: appt }, { status: 201 });
  } catch (err: any) {
    console.error("APPOINTMENTS/CREATE ERROR:", err);
    const msg = err?.message || "Erro interno";

    if (msg.toLowerCase().includes("não autorizado") || msg.toLowerCase().includes("sessão")) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
