import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!,);

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new NextResponse("Missing token", { status: 401 });

    const admin = supabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return new NextResponse("Invalid token", { status: 401 });

    const userId = userRes.user.id;

    const { data: prof } = await admin
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (!prof?.company_id) return new NextResponse("Profile/company not found", { status: 400 });
    if (!["owner", "admin", "manager"].includes(String(prof.role))) {
      return new NextResponse("Only owner/admin/manager can open portal", { status: 403 });
    }

    const companyId = String(prof.company_id);

    const { data: ba } = await admin
      .from("billing_accounts")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .single();

    if (!ba?.stripe_customer_id) return new NextResponse("No stripe customer found", { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const portal = await stripe.billingPortal.sessions.create({
      customer: ba.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });

    return NextResponse.json({ ok: true, url: portal.url });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Erro", { status: 500 });
  }
}