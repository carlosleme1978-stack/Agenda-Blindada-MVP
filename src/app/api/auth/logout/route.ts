import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();

    const res = NextResponse.json({ ok: true });

    // "Desloga" zerando cada cookie (expira no passado)
    for (const c of all) {
      res.cookies.set({
        name: c.name,
        value: "",
        // mantém o path padrão se existir, senão "/"
        path: (c as any).path ?? "/",
        expires: new Date(0),
      });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro" },
      { status: 500 }
    );
  }
}