import { createClient } from "@supabase/supabase-js";
export function adminClient(){
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}});
}
export async function sendWhatsApp(toE164:string, body:string){
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID!}/messages`;
  const res = await fetch(url, {
    method:"POST",
    headers:{ Authorization:`Bearer ${process.env.WHATSAPP_TOKEN!}`, "Content-Type":"application/json" },
    body: JSON.stringify({ messaging_product:"whatsapp", to: toE164.replace("+",""), type:"text", text:{ body } })
  });
  if(!res.ok) throw new Error(await res.text());
}
