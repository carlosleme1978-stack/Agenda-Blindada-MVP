"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";

type Row = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_phone: string;
  customer_name: string | null;
};

function pill(status: string) {
  const s = status?.toUpperCase?.() ?? status;
  const common: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: -0.1,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(255,255,255,0.7)",
  };

  const dot: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(2,6,23,0.25)",
  };

  if (s === "CONFIRMED") {
    return { ...common, color: "#065f46", background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.18)", ["--dot" as any]: "rgba(16,185,129,1)" , dot};
  }
  if (s === "CANCELLED") {
    return { ...common, color: "#991b1b", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.18)", ["--dot" as any]: "rgba(239,68,68,1)", dot};
  }
  if (s === "BOOKED") {
    return { ...common, color: "#1d4ed8", background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.18)", ["--dot" as any]: "rgba(59,130,246,1)", dot};
  }
  return { ...common, dot };
}

export default function DashboardClient() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        setMsg("Sem sessão.");
        return;
      }
      const { data, error } = await sb
        .from("v_appointments_dashboard")
        .select("*")
        .order("start_time", { ascending: true })
        .limit(200);

      if (error) setMsg(error.message);
      setRows((data ?? []) as any);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await sb.auth.signOut();
    location.href = "/";
  }

  const total = rows.length;
  const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
  const booked = rows.filter((r) => r.status === "BOOKED").length;
  const cancelled = rows.filter((r) => r.status === "CANCELLED").length;

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.78)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    boxShadow:
      "0 26px 48px rgba(15, 23, 42, 0.08), 0 8px 18px rgba(15, 23, 42, 0.05)",
  };

  return (
    <main>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>
            Dashboard
          </h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>
            Visão geral das marcações e confirmações via WhatsApp.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/dashboard/new"
            style={{
              textDecoration: "none",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(2,6,23,0.10)",
              background: "rgba(255,255,255,0.85)",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            + Nova marcação
          </Link>
          <button
            onClick={logout}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(2,6,23,0.10)",
              background: "rgba(255,255,255,0.85)",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sair
          </button>
        </div>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 14,
            color: "#b91c1c",
            background: "rgba(185, 28, 28, 0.07)",
            border: "1px solid rgba(185, 28, 28, 0.18)",
            padding: "10px 12px",
            borderRadius: 14,
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[
          { label: "Total", value: total },
          { label: "Confirmadas", value: confirmed },
          { label: "Pendentes", value: booked },
          { label: "Canceladas", value: cancelled },
        ].map((k) => (
          <div key={k.label} style={{ ...card, padding: 14 }}>
            <div style={{ opacity: 0.7, fontSize: 12, fontWeight: 700 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ letterSpacing: -0.2 }}>Próximas marcações</strong>
          <button
            onClick={load}
            style={{
              padding: "9px 12px",
              borderRadius: 12,
              border: "1px solid rgba(2,6,23,0.10)",
              background: "rgba(255,255,255,0.85)",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            cellPadding={0}
            cellSpacing={0}
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ textAlign: "left" }}>
                {["Início", "Cliente", "Telefone", "Estado"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 14px",
                      fontSize: 12,
                      opacity: 0.7,
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontWeight: 800,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = pill(r.status);
                const dotColor = (st as any)["--dot"] ?? "rgba(2,6,23,0.25)";
                return (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                      }}
                    >
                      {new Date(r.start_time).toLocaleString("pt-PT")}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {r.customer_name ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                        fontSize: 13,
                        opacity: 0.85,
                      }}
                    >
                      {r.customer_phone}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                        fontSize: 13,
                      }}
                    >
                      <span style={st as any}>
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: dotColor,
                            boxShadow: "0 10px 18px rgba(0,0,0,0.08)",
                          }}
                        />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, opacity: 0.7 }}>
                    Sem marcações.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
