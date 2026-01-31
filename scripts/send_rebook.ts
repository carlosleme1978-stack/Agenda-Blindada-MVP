import { adminClient, sendWhatsApp } from "./_common.ts";
(async()=>{
  const db=adminClient();
  const days=28;
  const from=new Date(Date.now()-(days*24*60+60)*60_000);
  const to=new Date(Date.now()-(days*24*60-60)*60_000);
  const { data } = await db.from("appointments").select("id,start_time,customers:customers(phone,name)").eq("status","ATTENDED").gte("start_time",from.toISOString()).lte("start_time",to.toISOString());
  for(const a of (data??[]) as any[]){
    const c=a.customers; if(!c?.phone) continue;
    await sendWhatsApp(c.phone, `Olá${c.name?` ${c.name}`:""}! 😊 Quer marcar novamente para esta semana?`);
  }
  console.log("OK rebook", data?.length ?? 0);
})().catch(e=>{console.error(e);process.exit(1);});
