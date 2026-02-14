import { adminClient, sendWhatsApp } from "./_common";
import { pathToFileURL } from "url";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runReminders24h() {
  const db = adminClient();

  const now = new Date();
  const from = new Date(now.getTime() + (24 * 60 - 5) * 60_000);
  const to = new Date(now.getTime() + (24 * 60 + 5) * 60_000);

  const { data, error } = await db
    .from("appointments")
    .select("id,start_time,customers:customers(phone,name)")
    .in("status", ["BOOKED", "CONFIRMED"])
    .gte("start_time", from.toISOString())
    .lte("start_time", to.toISOString());

  if (error) throw error;

  let sent = 0;

  for (const a of (data ?? []) as any[]) {
    const raw = a.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    if (!c?.phone) continue;

    const when = new Date(a.start_time).toLocaleString("pt-PT", {
      timeZone: "Europe/Lisbon",
    });

    const namePart = c.name ? ` ${c.name}` : "";
    const msg =
      `LEMBRETE ⏰\n\n` +
      `Olá${namePart}, só para relembrar o seu horário:\n` +
      `🗓️ ${when}\n\n` +
      `Responda SIM ou NÃO.`;

    await sendWhatsApp(c.phone, msg);
    sent++;
    await sleep(200);
  }

  console.log("OK reminders-24h", { matched: data?.length ?? 0, sent });
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReminders24h().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}