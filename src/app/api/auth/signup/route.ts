import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

function cleanEmail(e: string) {
  return String(e || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      companyName?: string;
      email?: string;
      password?: string;
      ownerName?: string;
      accessCode?: string;
      sessionId?: string;
    };

    const sessionId = String(body.sessionId ?? "").trim();
    const accessCode = String(body.accessCode ?? "").trim();
    const companyNameInput = String(body.companyName ?? "").trim();
    const ownerName = String(body.ownerName ?? "").trim();
    const email = cleanEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");

    // Two ways to signup:
    // 1) Pay-first: valid Stripe checkout session (sessionId)
    // 2) Legacy: access code (accessCode)
    if (!sessionId && !accessCode) {
      return NextResponse.json({ error: "Cadastro somente após pagamento (sessionId) ou com código de acesso (accessCode)." }, { status: 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "email e password são obrigatórios" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // ------------------------------
    // FLOW A) Stripe pay-first
    // ------------------------------
    if (sessionId) {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer", "subscription"],
      });

      const paymentStatus = String((session as any).payment_status ?? "").toLowerCase();
      if (paymentStatus !== "paid") {
        return NextResponse.json({ error: "Pagamento não confirmado (session ainda não está paid)." }, { status: 403 });
      }

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (!customerId || !subscriptionId) {
        return NextResponse.json({ error: "Stripe session inválida (sem customer/subscription)." }, { status: 400 });
      }

      const meta = (session.metadata ?? {}) as Record<string, string>;
      const plan = (meta.plan || "basic").toLowerCase() === "pro" ? "pro" : "basic";
      const stripeEmail = String(meta.email || session.customer_details?.email || "").trim().toLowerCase();

      if (stripeEmail && stripeEmail !== email) {
        return NextResponse.json({ error: "O email informado não bate com o email do pagamento." }, { status: 400 });
      }

      const finalCompanyName = companyNameInput || String(meta.company_name || "").trim();
      if (!finalCompanyName) {
        return NextResponse.json({ error: "companyName é obrigatório (ou envie no pagamento)." }, { status: 400 });
      }

      // Create company (limit 5)
      const { data: company, error: cErr } = await admin
        .from("companies")
        .insert({
          name: finalCompanyName,
          plan,
          staff_limit: 5,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_subscription_status: "active",
          sub_basic_status: plan === "basic" ? "active" : "inactive",
          sub_pro_status: plan === "pro" ? "active" : "inactive",
        })
        .select("id")
        .single();

      if (cErr || !company?.id) {
        return NextResponse.json({ error: cErr?.message ?? "Falha ao criar empresa" }, { status: 400 });
      }

      // Create auth user
      const { data: userRes, error: uErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          company_name: finalCompanyName,
          owner_name: ownerName,
        },
      });

      if (uErr || !userRes.user) {
        await admin.from("companies").delete().eq("id", company.id);
        return NextResponse.json({ error: uErr?.message ?? "Falha ao criar user" }, { status: 400 });
      }

      // Create profile
      const { error: pErr } = await admin
        .from("profiles")
        .insert({ id: userRes.user.id, company_id: company.id, role: "owner" });

      if (pErr) {
        await admin.auth.admin.deleteUser(userRes.user.id);
        await admin.from("companies").delete().eq("id", company.id);
        return NextResponse.json({ error: pErr.message }, { status: 400 });
      }

      // Defaults
      const { data: staff } = await admin
        .from("staff")
        .insert({ company_id: company.id, name: ownerName || "Dono", role: "owner", active: true })
        .select("id")
        .single();

      await admin
        .from("services")
        .insert({ company_id: company.id, name: "Serviço", duration_minutes: 30, active: true });

      if (staff?.id) {
        await admin.from("profiles").update({ staff_id: staff.id }).eq("id", userRes.user.id);
      }

      return NextResponse.json({ ok: true });
    }

    // 0) Validate code
    const { data: codeRow, error: codeErr } = await admin
      .from("access_codes")
      .select("code,status,expires_at,company_name,plan,staff_limit")
      .eq("code", accessCode)
      .single();

    if (codeErr || !codeRow) {
      return NextResponse.json({ error: "Código não encontrado." }, { status: 404 });
    }

    if (String(codeRow.status).toUpperCase() !== "ACTIVE") {
      return NextResponse.json({ error: "Código já usado/expirado." }, { status: 403 });
    }

    if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "Código expirado." }, { status: 403 });
    }

    const companyName = companyNameInput || String(codeRow.company_name ?? "").trim();
    if (!companyName) {
      return NextResponse.json({ error: "companyName é obrigatório (ou defina company_name no access code)." }, { status: 400 });
    }

    // 1) Create company
    const { data: company, error: cErr } = await admin
      .from("companies")
      .insert({
        name: companyName,
        plan: codeRow.plan ?? "basic",
        staff_limit: codeRow.staff_limit ?? 1,
      })
      .select("id")
      .single();

    if (cErr || !company?.id) {
      return NextResponse.json({ error: cErr?.message ?? "Falha ao criar empresa" }, { status: 400 });
    }

    // 2) Create auth user
    const { data: userRes, error: uErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        company_name: companyName,
        owner_name: ownerName,
      },
    });

    if (uErr || !userRes.user) {
      await admin.from("companies").delete().eq("id", company.id);
      return NextResponse.json({ error: uErr?.message ?? "Falha ao criar user" }, { status: 400 });
    }

    // 3) Create profile
    const { error: pErr } = await admin
      .from("profiles")
      .insert({ id: userRes.user.id, company_id: company.id, role: "owner" });

    if (pErr) {
      await admin.auth.admin.deleteUser(userRes.user.id);
      await admin.from("companies").delete().eq("id", company.id);
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }

    // 4) Consume access code with concurrency protection
    const iso = new Date().toISOString();
    const { data: consumed, error: consumeErr } = await admin
      .from("access_codes")
      .update({ status: "USED", used_by_user_id: userRes.user.id, used_at: iso })
      .eq("code", accessCode)
      .eq("status", "ACTIVE")
      .or(`expires_at.is.null,expires_at.gt.${iso}`)
      .select("code,status")
      .single();

    if (consumeErr || !consumed) {
      // Rollback all
      await admin.auth.admin.deleteUser(userRes.user.id);
      await admin.from("profiles").delete().eq("id", userRes.user.id);
      await admin.from("companies").delete().eq("id", company.id);
      return NextResponse.json({ error: "Não foi possível consumir o código. Use outro código." }, { status: 409 });
    }

    // 5) Create defaults (1 staff, 1 service)
    const { data: staff } = await admin
      .from("staff")
      .insert({ company_id: company.id, name: ownerName || "Dono", role: "owner", active: true })
      .select("id")
      .single();

    await admin
      .from("services")
      .insert({ company_id: company.id, name: "Serviço", duration_minutes: 30, active: true });

    // optional: attach staff_id to profile if staff row exists
    if (staff?.id) {
      await admin.from("profiles").update({ staff_id: staff.id }).eq("id", userRes.user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro no signup" }, { status: 500 });
  }
}
