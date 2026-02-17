import { redirect } from "next/navigation";
import StaffClient from "./StaffClient";
import { createSupabaseServer } from "@/lib/supabase/server";

type Company = {
  id: string;
  name: string | null;
  plan?: string | null;
  sub_basic_status?: string | null;
  sub_pro_status?: string | null;
  stripe_subscription_status?: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at?: string;
};

type StaffFinancial = {
  staff_id: string;
  revenue_realized_cents: number | null;
  revenue_expected_cents: number | null;
  revenue_lost_cents: number | null;
  total_completed: number | null;
  total_no_show: number | null;
  avg_ticket_cents: number | null;
};

type StaffOccupancy = {
  staff_id: string;
  booked_minutes: number | null;
  available_minutes: number | null;
};

function isActiveSubscription(company: Company): boolean {
  const v = (s?: string | null) => String(s ?? "").toLowerCase();
  const basic = v(company.sub_basic_status) === "active";
  const pro = v(company.sub_pro_status) === "active";
  const stripe = ["active", "trialing"].includes(v(company.stripe_subscription_status));
  return basic || pro || stripe;
}

async function getCompanyIdForUser(sb: any, userId: string): Promise<string | null> {
  // profiles.id
  {
    const r = await sb.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  // profiles.uid (legacy)
  {
    const r = await sb.from("profiles").select("company_id").eq("uid", userId).maybeSingle();
    if (r.data?.company_id) return r.data.company_id as string;
  }
  return null;
}

export default async function Page() {
  const sb = await createSupabaseServer();

  const { data: sess, error: serr } = await sb.auth.getSession();
  if (serr) {
    // If auth cookies are invalid, force login
    redirect("/login");
  }
  if (!sess.session) redirect("/login");

  const userId = sess.session.user.id;
  const companyId = await getCompanyIdForUser(sb, userId);
  if (!companyId) redirect("/login");

  const { data: company, error: cerr } = await sb
    .from("companies")
    .select("id,name,plan,sub_basic_status,sub_pro_status,stripe_subscription_status")
    .eq("id", companyId)
    .maybeSingle();

  if (cerr || !company?.id) redirect("/login");

  // Optional gating: if your DB stores subscription status, we can redirect to billing when inactive.
  // We keep this permissive: only redirect if we are sure it's inactive (i.e., field exists and not active).
  if (
    (company.sub_basic_status !== undefined ||
      company.sub_pro_status !== undefined ||
      company.stripe_subscription_status !== undefined) &&
    !isActiveSubscription(company as any)
  ) {
    redirect("/dashboard/billing");
  }

  const { data: staff, error: sErr } = await sb
    .from("staff")
    .select("id,name,phone,role,active,created_at")
    .eq("owner_id", uid)
    .order("created_at", { ascending: true });

  if (sErr) {
    // Render empty state rather than crash
  }

  const { data: fin } = await sb
    .from("v_staff_financial_metrics")
    .select("staff_id,revenue_realized_cents,revenue_expected_cents,revenue_lost_cents,total_completed,total_no_show,avg_ticket_cents")
    .eq("owner_id", uid);

  const { data: occ } = await sb
    .from("v_staff_occupancy")
    .select("staff_id,booked_minutes,available_minutes")
    .eq("owner_id", uid);

  return (
    <StaffClient
      initialCompany={company as any}
      initialStaff={(staff ?? []) as StaffRow[]}
      initialFinancial={(fin ?? []) as StaffFinancial[]}
      initialOccupancy={(occ ?? []) as StaffOccupancy[]}
    />
  );
}
