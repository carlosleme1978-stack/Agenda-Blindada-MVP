"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  name: string;
  plan: string;
  staff_limit: number;
  created_at: string;
};

export default function AdminCompaniesClient() {
  const sb = supabaseBrowser;
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setMsg(null);
      setLoading(true);
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setMsg("Faça login.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/companies", { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(j?.error || "Sem acesso.");
        setLoading(false);
        return;
      }

      setRows((j?.companies ?? []) as Row[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>Admin · Empresas</h1>
          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>Visão geral (apenas super admin).</div>
        </div>
        <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 900 }}>← Voltar</Link>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(185,28,28,0.22)", background: "rgba(185,28,28,0.07)", color: "#b91c1c" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 14, background: "rgba(255,255,255,0.85)", border: "1px solid rgba(2,6,23,0.08)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 900, fontSize: 13, opacity: 0.8 }}>Empresas</div>
        <div style={{ borderTop: "1px solid rgba(2,6,23,0.06)" }}>
          {loading ? (
            <div style={{ padding: 14, opacity: 0.75 }}>Carregando…</div>
          ) : rows.length ? (
            rows.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.6fr 0.8fr", gap: 10, padding: 12, borderTop: "1px solid rgba(2,6,23,0.06)" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{r.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{r.id}</div>
                </div>
                <div style={{ fontWeight: 800, textTransform: "uppercase" }}>{r.plan}</div>
                <div style={{ fontWeight: 800 }}>{r.staff_limit}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{new Date(r.created_at).toLocaleString("pt-PT")}</div>
              </div>
            ))
          ) : (
            <div style={{ padding: 14, opacity: 0.75 }}>Nenhuma empresa.</div>
          )}
        </div>
      </div>
    </div>
  );
}
