import { adminClient, sendWhatsApp } from "./_common";
import { pathToFileURL } from "url";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runThanks() {
  const db = adminClient();

  const now = Date.now();
  const from = new Date(now - 2 * 60 * 60 * 1000);

  const { data, error } = await db
    .from("appointments")
    .select("id,start_time,customers:customers(phone,name)")
    .eq("status", "ATTENDED")
    .gte("start_time", from.toISOString())
    .lte("start_time", new Date(now).toISOString());

  if (error) throw error;

  let sent = 0;
  let skipped = 0;

  for (const a of (data ?? []) as any[]) {
    const raw = a.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;

    if (!c?.phone) {
      skipped++;
      continue;
    }

    const namePart = c.name ? ` ${c.name}` : "";
    const msg = `Obrigado${namePart}! 🙏 Se precisar de algo, é só responder por aqui.`;

    await sendWhatsApp(c.phone, msg);
    sent++;
    await sleep(200);
  }

  console.log("OK thanks", { matched: data?.length ?? 0, sent, skipped });
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runThanks().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}