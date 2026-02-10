// import { createClient } from "@supabase/supabase-js";

// export function browserClient() {
//   return createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//   );
// }

// // Compatível com o projeto: supabaseBrowser() retorna um client
// export function supabaseBrowser() {
//   return browserClient();
// }
import { createBrowserClient } from "@supabase/ssr";

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
