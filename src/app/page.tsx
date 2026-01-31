import Link from "next/link";
export default function Home(){
  return (<main>
    <h1>Agenda Blindada — MVP</h1>
    <ul><li><Link href="/login">Entrar</Link></li><li><Link href="/dashboard">Dashboard</Link></li></ul>
    <p>Setup: schema Supabase + .env.local + webhook WhatsApp.</p>
  </main>);
}
