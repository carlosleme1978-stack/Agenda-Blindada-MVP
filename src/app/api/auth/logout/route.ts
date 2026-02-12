import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // cookies mais comuns do supabase auth (SSR)
  const names = [
    "sb-access-token",
    "sb-refresh-token",
    "sb-auth-token",
    "supabase-auth-token",
  ];

  // apaga no path "/" (padrão)
  for (const name of names) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
    res.cookies.delete?.(name); // caso exista nesta versão
  }

  // fallback: expirar qualquer cookie que comece com "sb-"
  // (Next não permite listar e reaplicar "options" com tipagem estável)
  // então fazemos uma limpeza segura para os nomes conhecidos.
  return res;
}
