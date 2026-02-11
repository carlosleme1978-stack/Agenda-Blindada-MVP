import { supabaseAdmin } from "@/lib/supabase/admin";

export type CompanyWhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
};

/**
 * SaaS strategy:
 * - Token usually comes from a single Meta Business (WHATSAPP_ACCESS_TOKEN).
 * - Each company can have its own whatsapp_phone_number_id in DB.
 *
 * If companies store their own token later, you can extend this safely.
 */
export async function getWhatsAppConfigForCompany(companyId: string): Promise<CompanyWhatsAppConfig> {
  const admin = supabaseAdmin();

  const { data: comp, error } = await admin
    .from("companies")
    .select("whatsapp_phone_number_id")
    .eq("id", companyId)
    .single();

  if (error) throw new Error(error.message);

  const phoneNumberId = comp?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId) throw new Error("Missing whatsapp_phone_number_id (company) or WHATSAPP_PHONE_NUMBER_ID (env)");
  if (!accessToken) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_TOKEN");

  return { phoneNumberId, accessToken };
}

export async function sendWhatsAppTextForCompany(companyId: string, to: string, body: string) {
  const { phoneNumberId, accessToken } = await getWhatsAppConfigForCompany(companyId);

  const toDigits = String(to).replace(/\D/g, "");
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `WhatsApp send failed (${res.status})`);
  }
}
