import type { Metadata } from "next";
import Header from "./Header";
import { ThemeProvider } from "./ThemeProvider";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body style={{ margin: 0, minHeight: "100vh" }}>
        <style>{`
          :root{color-scheme:dark;}
          html,body{height:100%;}
          body{
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            background: var(--page-bg);
            color: var(--text);
          }
          a{color: var(--link);}

          /* ===== Themes ===== */
          :root[data-theme="tech"]{
            --page-bg: radial-gradient(900px 600px at 20% 0%, rgba(59,130,246,0.22), transparent 60%), radial-gradient(900px 600px at 80% 10%, rgba(16,185,129,0.18), transparent 60%), linear-gradient(180deg, rgba(11,18,32,1) 0%, rgba(15,23,42,1) 60%, rgba(11,18,32,1) 100%);
            --text: rgba(255,255,255,0.92);
            --muted: rgba(255,255,255,0.72);
            --link: rgba(255,255,255,0.92);
            --card-bg: rgba(255,255,255,0.08);
            --card-bg-strong: rgba(255,255,255,0.10);
            --card-border: rgba(255,255,255,0.14);
            --glass: rgba(0,0,0,0.22);
            --shadow: 0 30px 60px rgba(0,0,0,0.30);
            --primary: rgba(59,130,246,1);
            --primary-2: rgba(16,185,129,1);
            --primary-gradient: linear-gradient(135deg, rgba(59,130,246,1), rgba(16,185,129,1));
            --btn-bg: rgba(255,255,255,0.10);
            --btn-border: rgba(255,255,255,0.18);
            --btn-fg: rgba(255,255,255,0.94);
            --input-bg: rgba(0,0,0,0.22);
            --input-border: rgba(255,255,255,0.18);
            --table-bg: rgba(255,255,255,0.06);
            --table-border: rgba(255,255,255,0.12);
            --success: rgba(16,185,129,1);
            --danger: rgba(239,68,68,1);
            --warn: rgba(245,158,11,1);
          }

          :root[data-theme="luxury"]{
            --page-bg: radial-gradient(900px 600px at 20% 0%, rgba(212,175,55,0.14), transparent 60%), radial-gradient(900px 600px at 80% 10%, rgba(212,175,55,0.10), transparent 60%), linear-gradient(180deg, #060608 0%, #0b0b10 55%, #060608 100%);
            --text: rgba(255,255,255,0.92);
            --muted: rgba(255,255,255,0.70);
            --link: rgba(255,255,255,0.92);
            --card-bg: rgba(255,255,255,0.06);
            --card-bg-strong: rgba(255,255,255,0.08);
            --card-border: rgba(212,175,55,0.22);
            --glass: rgba(0,0,0,0.35);
            --shadow: 0 28px 70px rgba(0,0,0,0.50);
            --primary: rgba(212,175,55,1);
            --primary-2: rgba(255,255,255,0.92);
            --primary-gradient: linear-gradient(135deg, rgba(212,175,55,1), rgba(255,255,255,0.92));
            --btn-bg: rgba(255,255,255,0.08);
            --btn-border: rgba(212,175,55,0.25);
            --btn-fg: rgba(255,255,255,0.94);
            --input-bg: rgba(0,0,0,0.30);
            --input-border: rgba(212,175,55,0.22);
            --table-bg: rgba(255,255,255,0.06);
            --table-border: rgba(212,175,55,0.18);
            --success: rgba(16,185,129,1);
            --danger: rgba(239,68,68,1);
            --warn: rgba(245,158,11,1);
          }

          /* ===== Shared UI atoms ===== */
          .ab-container{max-width:1120px;margin:0 auto;padding:22px 18px;}
          .ab-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:20px;box-shadow:var(--shadow);backdrop-filter: blur(10px);}
          .ab-card-inner{padding:18px;}
          .ab-muted{opacity:0.78;}
          .ab-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--btn-border);background:var(--btn-bg);color:var(--btn-fg);font-weight:900;letter-spacing:-0.2;cursor:pointer;text-decoration:none;}
          .ab-btn:hover{transform:translateY(-1px);}
          .ab-btn-primary{background:var(--primary-gradient);border-color:rgba(255,255,255,0.18);box-shadow:0 14px 26px rgba(0,0,0,0.24);} 
          .ab-input{width:100%;padding:12px 12px;border-radius:12px;border:1px solid var(--input-border);outline:none;font-size:14px;background:var(--input-bg);color:var(--text);} 
          .ab-input::placeholder{color:rgba(255,255,255,0.55);} 
          .ab-table{border:1px solid var(--table-border);border-radius:16px;overflow:hidden;background:var(--table-bg);backdrop-filter: blur(10px);} 
          .ab-row{border-bottom:1px solid rgba(255,255,255,0.10);} 
          .ab-row:last-child{border-bottom:none;} 
          .ab-pill{display:inline-flex;padding:6px 10px;border-radius:999px;font-weight:950;font-size:12px;border:1px solid rgba(255,255,255,0.18);} 
          .ab-pulse-green{animation: abPulseGreen 1.2s ease-in-out infinite;} 
          @keyframes abPulseGreen{0%,100%{box-shadow:0 0 0 rgba(16,185,129,0.0);}50%{box-shadow:0 0 0 8px rgba(16,185,129,0.12);}} 
        `}</style>

        <ThemeProvider>
          <Header />
          <div className="ab-container">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
