import { adminClient, sendWhatsApp, registerDeliveryOnce } from "./_common";
import { pathToFileURL } from "url";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runRebook() {
  const db = adminClient();

  const days = 28;
  const center = Date.now() - days * DAY;

  // janela de 2h: 28d atrás +/- 1h
  const from = new Date(center - HOUR);
  const to = new Date(center + HOUR);

  const { data, error } = await db
    .from("appointments")
    .select("id,company_id,start_time,customers:customers(phone,name)")
    .eq("status", "ATTENDED")
    .gte("start_time", from.toISOString())
    .lte("start_time", to.toISOString());

  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let duplicated = 0;

  for (const a of (data ?? []) as any[]) {
    const raw = a.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;

    if (!c?.phone) {
      skipped++;
      continue;
    }

    // ✅ idempotência por appointment
    const first = await registerDeliveryOnce(db, {
      company_id: a.company_id,
      appointment_id: a.id,
      type: "rebook",
    });

    if (!first) {
      duplicated++;
      continue;
    }

    const namePart = c.name ? ` ${c.name}` : "";
    const msg = `Olá${namePart}! 😊 Quer marcar novamente para esta semana?`;

    await sendWhatsApp(c.phone, msg);
    sent++;
    await sleep(250);
  }

  console.log("OK rebook", {
    matched: data?.length ?? 0,
    sent,
    skipped,
    duplicated,
    window: { from: from.toISOString(), to: to.toISOString() },
  });
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRebook().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
