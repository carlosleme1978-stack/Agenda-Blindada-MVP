"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const p = usePathname();

  // Hide header on login page for a cleaner premium look
  if (p === "/login") return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(12px)",
        background: "var(--glass)",
        borderBottom: "1px solid var(--card-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
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
          <strong style={{ letterSpacing: -0.2 }}>
            {process.env.NEXT_PUBLIC_APP_NAME ?? "Agenda Blindada"}
          </strong>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <Link
            href="/dashboard"
            style={{
              textDecoration: "none",
              color: "var(--text)",
              fontSize: 14,
              opacity: p?.startsWith("/dashboard") ? 1 : 0.75,
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/new"
            style={{
              textDecoration: "none",
              color: "var(--text)",
              fontSize: 14,
              opacity: p === "/dashboard/new" ? 1 : 0.75,
            }}
          >
            Nova marcação
          </Link>
          <Link
            href="/dashboard/settings"
            style={{
              textDecoration: "none",
              color: "var(--text)",
              fontSize: 14,
              opacity: p === "/dashboard/settings" ? 1 : 0.75,
            }}
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
