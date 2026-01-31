"use client";

import { useEffect, useState } from "react";
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

export default function DashboardClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();

    (async () => {
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        setMsg("Sem sessão.");
        return;
      }

      const { data, error } = await sb
        .from("v_appointments_dashboard")
        .select("*")
        .order("start_time", { ascending: true })
        .limit(100);

      if (error) setMsg(error.message);
      setRows((data ?? []) as any);
    })();
  }, []);

  async function logout() {
    const sb = supabaseBrowser();
    await sb.auth.signOut();
    location.href = "/";
  }

  return (
    <main>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <Link href="/dashboard/new">Nova marcação</Link>
        <button style={{ marginLeft: "auto" }} onClick={logout}>
          Sair
        </button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <table
        cellPadding={8}
        style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Início</th>
            <th>Cliente</th>
            <th>Telefone</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>{new Date(r.start_time).toLocaleString("pt-PT")}</td>
              <td>{r.customer_name ?? "-"}</td>
              <td>{r.customer_phone}</td>
              <td>{r.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "#666" }}>
                Sem marcações.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
