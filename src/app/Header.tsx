"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function NavLink({ href, label }: { href: string; label: string }) {
  const p = usePathname();
  const active = p === href || (href !== "/dashboard" && p?.startsWith(href));
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: "var(--text)",
        fontSize: 14,
        opacity: active ? 1 : 0.7,
        padding: "8px 10px",
        borderRadius: 10,
        border: active ? "1px solid var(--card-border)" : "1px solid transparent",
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
      }}
    >
      {label}
    </Link>
  );
}

export default function Header() {
  const p = usePathname();
  const router = useRouter();

  // Hide header on auth/billing landing pages for a cleaner premium look
  if (!p) return null;
  if (p === "/login" || p === "/signup" || p === "/forgot-password" || p === "/planos") return null;

  async function onLogout() {
    try {
      await supabaseBrowser.auth.signOut();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(14px)",
        background: "var(--glass)",
        borderBottom: "1px solid var(--card-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "var(--primary-gradient)",
              boxShadow: "0 10px 22px rgba(0,0,0,0.30)",
            }}
          />
          <strong style={{ letterSpacing: -0.2 }}>{process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}</strong>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/dashboard/agenda" label="Agenda" />
          <NavLink href="/dashboard/clientes" label="Clientes" />
          <NavLink href="/dashboard/financeiro" label="Financeiro" />
          <NavLink href="/dashboard/insights" label="Insights" />

          <Link
            href="/dashboard/settings"
            title="Configurações"
            style={{
              marginLeft: 6,
              width: 34,
              height: 34,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              textDecoration: "none",
              color: "var(--text)",
              border: "1px solid var(--btn-border)",
              background: "var(--btn-bg)",
            }}
          >
            ⚙︎
          </Link>

          <button
            onClick={onLogout}
            title="Sair"
            style={{
              marginLeft: 6,
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid var(--btn-border)",
              background: "var(--btn-bg)",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
