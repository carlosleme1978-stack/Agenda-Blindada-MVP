import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function clearAllCookies(res: NextResponse) {
  const cookieStore = cookies();
  const all = cookieStore.getAll();

  // "Desloga" zerando cada cookie (expira no passado)
  for (const c of all) {
    res.cookies.set({
      name: c.name,
      value: "",
      path: (c as any).path ?? "/",
      expires: new Date(0),
    });
  }
}

export async function GET(req: Request) {
  // Quando o usuário clica em "Sair" (link), isso é um GET.
  // Redireciona imediatamente para /login e remove cookies.
  const res = NextResponse.redirect(new URL("/login", req.url));
  try {
    clearAllCookies(res);
  } catch {}
  return res;
}

export async function POST() {
  try {
    const res = NextResponse.json({ ok: true });

    clearAllCookies(res);
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro" },
      { status: 500 }
    );
  }
}