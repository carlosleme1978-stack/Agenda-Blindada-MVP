// src/lib/supabase/user.ts
import { createClient } from "@supabase/supabase-js";

export async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const { data, error } = await client.auth.getUser();

  if (error || !data?.user) return null;

  return {
    user: data.user,
    token,
  };
}
