import { adminClient, sendWhatsApp } from "./_common.ts";

export async function runReminders24h() {
const db=adminClient();
  const now=new Date();
  const from=new Date(now.getTime()+(24*60-5)*60_000);
  const to=new Date(now.getTime()+(24*60+5)*60_000);
  const { data } = await db.from("appointments").select("id,company_id,start_time,customers:customers(phone,name)").in("status",["BOOKED","CONFIRMED"]).gte("start_time",from.toISOString()).lte("start_time",to.toISOString());
  for(const a of (data??[]) as any[]){
    const c=a.customers; if(!c?.phone) continue;
    const when=new Date(a.start_time).toLocaleString("pt-PT",{timeZone:"Europe/Lisbon"});
    const msg=`LEMBRETE ⏰\n\nOlá ${c.name ?? ""}, só para relembrar o seu horário:\n🗓️ ${when}\n\nResponda SIM ou NÃO.`;
    await sendWhatsApp(c.phone, msg);
  }
  console.log("OK reminders", data?.length ?? 0);
})().catch(e=>{console.error(e);process.exit(1);});
}

// CLI
if (process.argv[1] && process.argv[1].includes('send_reminders_24h')) {
  runReminders24h().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
