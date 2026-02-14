import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function sendWhatsApp(toE164: string, body: string) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID!}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) throw new Error(await res.text());
}

// ------------------------------
// Hardening helpers
// ------------------------------

/**
 * Idempotência: tenta registrar um envio (appointment_id + type).
 * - true  => pode enviar (primeira vez)
 * - false => já foi enviado (duplicado)
 */
export async function registerDeliveryOnce(
  db: SupabaseClient,
  params: { company_id: string; appointment_id: string; type: string }
): Promise<boolean> {
  const { error } = await db.from("message_deliveries").insert({
    company_id: params.company_id,
    appointment_id: params.appointment_id,
    type: params.type,
  });

  if (!error) return true;

  // Duplicado (unique violation)
  // Postgres: 23505
  if ((error as any).code === "23505") return false;

  throw error;
}

/**
 * Lock leve para impedir dois cron jobs simultâneos (TTL em segundos).
 * Requer RPC try_acquire_lock / release_lock (criados via migration).
 */
export async function tryAcquireLock(
  db: SupabaseClient,
  key: string,
  ttlSeconds = 15 * 60
): Promise<boolean> {
  const { data, error } = await db.rpc("try_acquire_lock", {
    p_key: key,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return !!data;
}

export async function releaseLock(db: SupabaseClient, key: string) {
  const { error } = await db.rpc("release_lock", { p_key: key });
  if (error) throw error;
}
