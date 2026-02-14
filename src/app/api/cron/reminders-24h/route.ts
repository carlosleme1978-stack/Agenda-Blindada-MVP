import { NextResponse, type NextRequest } from "next/server";
import { rateLimitOr429, getClientIp } from "@/lib/rate-limit";
import { runReminders24h } from "@/../scripts/send_reminders_24h.ts";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const provided = (request.headers.get("x-cron-secret") || "").trim();
  if (secret && provided !== secret) return unauthorized();

  const ip = getClientIp(request as any);
  const limited = rateLimitOr429(request as any, { key: "reminders-24h:" + ip, limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    await runReminders24h();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Cron error" }, { status: 500 });
  }
}
