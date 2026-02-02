import "server-only";
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Alias para compatibilidade com o código existente:
 * requirePro.ts e rotas /api/* importam supabaseAdmin
 */
export function supabaseAdmin() {
  return adminClient();
}
