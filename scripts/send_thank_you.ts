import { adminClient, sendWhatsApp } from "./_common.ts";

export async function runThankYou() {
const db=adminClient();
  const since=new Date(Date.now()-60*60_000);
  const until=new Date(Date.now()-5*60_000);
  const { data } = await db.from("appointments").select("id,start_time,customers:customers(phone,name)").eq("status","ATTENDED").gte("start_time",since.toISOString()).lte("start_time",until.toISOString());
  for(const a of (data??[]) as any[]){
    const c=a.customers; if(!c?.phone) continue;
    await sendWhatsApp(c.phone, `Obrigado pela sua visita${c.name?`, ${c.name}`:""}! 🙌`);
  }
  console.log("OK thanks", data?.length ?? 0);
})().catch(e=>{console.error(e);process.exit(1);});
}

// CLI
if (process.argv[1] && process.argv[1].includes('send_thank_you')) {
  runThankYou().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
