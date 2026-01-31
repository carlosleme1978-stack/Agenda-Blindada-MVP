import { createClient } from "@supabase/supabase-js";
import { must } from "@/lib/env";
export function supabaseAdmin(){
  return createClient(must("NEXT_PUBLIC_SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"), {auth:{persistSession:false}});
}
