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
        backdropFilter: "blur(10px)",
        background: "rgba(255,255,255,0.75)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
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
              background:
                "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
              boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
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
              color: "#0f172a",
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
              color: "#0f172a",
              fontSize: 14,
              opacity: p === "/dashboard/new" ? 1 : 0.75,
            }}
          >
            Nova marcação
          </Link>
        </div>
      </div>
    </div>
  );
}
