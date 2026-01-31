import type { Metadata } from "next";
export const metadata: Metadata = { title: process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada" };
export default function RootLayout({children}:{children:React.ReactNode}){
  return (<html lang="pt-PT"><body style={{fontFamily:"system-ui",margin:0}}>
    <div style={{padding:16,borderBottom:"1px solid #eee"}}><strong>{process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}</strong></div>
    <div style={{padding:16}}>{children}</div>
  </body></html>);
}
