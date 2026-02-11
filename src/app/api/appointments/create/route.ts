import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}

function toDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  try {
    const token = bearerToken(req);
    if (!token) return new NextResponse("Missing bearer token", { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userRes.user) return new NextResponse("Invalid token", { status: 401 });

    const userId = userRes.user.id;

    // Get profile + company + role + staff_id (if exists)
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("company_id, role, staff_id")
      .eq("id", userId)
      .single();
    if (pErr || !profile?.company_id) return new NextResponse("Profile without company_id", { status: 400 });

    const companyId = profile.company_id as string;
    const role = String(profile.role || "owner");
    const staffIdFromProfile = (profile as any).staff_id as string | null | undefined;

    const body = (await req.json().catch(() => ({}))) as {
      customerPhone?: string;
      customerName?: string;
      startISO?: string;
      durationMinutes?: number;
      staffId?: string;
      serviceId?: string;
    };

    const customerPhoneRaw = String(body.customerPhone ?? "");
    const customerPhone = toDigits(customerPhoneRaw);
    const customerName = String(body.customerName ?? "").trim() || null;
    const startISO = String(body.startISO ?? "");
    const durationMinutes = Math.max(5, Number(body.durationMinutes ?? 30));

    if (!customerPhone || !startISO) {
      return new NextResponse("customerPhone e startISO são obrigatórios", { status: 400 });
    }

    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) {
      return new NextResponse("startISO inválido", { status: 400 });
    }
    const end = new Date(start.getTime() + durationMinutes * 60000);

    // Choose staff
    let staffId: string | null = null;
    if (role === "staff") {
      staffId = staffIdFromProfile || null;
      if (!staffId) return new NextResponse("Staff sem staff_id no profiles", { status: 400 });
    } else {
      staffId = body.staffId ? String(body.staffId) : null;
    }

    // Owner/manager fallback: if no staff selected, assign the first active staff.
    if (!staffId) {
      const { data: firstStaff } = await admin
        .from("staff")
        .select("id")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      staffId = (firstStaff as any)?.id ?? null;
    }

    if (!staffId) {
      return new NextResponse("Sem staff disponível. Crie pelo menos 1 staff ativo.", { status: 400 });
    }

    const serviceId = body.serviceId ? String(body.serviceId) : null;

    // Upsert customer (unique: company_id+phone)
    const { data: cust, error: cErr } = await admin
      .from("customers")
      .upsert(
        { company_id: companyId, phone: customerPhone, name: customerName },
        { onConflict: "company_id,phone" }
      )
      .select("id")
      .single();

    if (cErr || !cust?.id) {
      return new NextResponse(cErr?.message ?? "Falha ao criar cliente", { status: 400 });
    }

    const { data: appt, error: aErr } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        customer_id: cust.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "BOOKED",
        staff_id: staffId,
        service_id: serviceId,
        customer_name_snapshot: customerName,
      })
      .select("id")
      .single();

    if (aErr) {
      // overlap constraint returns 23505/23P01 depending; expose readable
      const msg = aErr.message || "Erro ao criar marcação";
      return new NextResponse(msg, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: appt.id });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}
