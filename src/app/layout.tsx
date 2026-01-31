import type { Metadata } from "next";
import Header from "./Header";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
          margin: 0,
          color: "#0f172a",
          background:
            "radial-gradient(1200px 600px at 20% 0%, rgba(59,130,246,0.18), transparent 55%), radial-gradient(900px 500px at 80% 10%, rgba(16,185,129,0.14), transparent 55%), linear-gradient(180deg, #ffffff 0%, #f7f8fb 45%, #ffffff 100%)",
          minHeight: "100vh",
        }}
      >
        <Header />
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 18px" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
