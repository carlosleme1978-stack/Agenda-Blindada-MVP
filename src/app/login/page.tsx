"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
export default function Login(){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [msg,setMsg]=useState<string|null>(null);
  const r=useRouter();
  async function onSubmit(e:React.FormEvent){ e.preventDefault(); setMsg(null);
    const sb=supabaseBrowser();
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error) return setMsg(error.message);
    r.push("/dashboard");
  }
  return (<main style={{maxWidth:420}}>
    <h2>Entrar</h2>
    <form onSubmit={onSubmit}>
      <label>Email</label><input style={{width:"100%",padding:8}} value={email} onChange={e=>setEmail(e.target.value)} />
      <div style={{height:8}} />
      <label>Password</label><input style={{width:"100%",padding:8}} type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <div style={{height:12}} />
      <button style={{padding:"8px 12px"}}>Entrar</button>
    </form>
    {msg && <p style={{color:"crimson"}}>{msg}</p>}
  </main>);
}
