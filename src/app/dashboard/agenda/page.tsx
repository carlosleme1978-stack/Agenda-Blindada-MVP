"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
};

function fmt(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

export default function AgendaPage() {
  const supabase = useMemo(() => supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle();
      const companyId = (prof as any)?.company_id;
      if (!companyId) {
        setErr("Sem company_id no perfil.");
        setLoading(false);
        return;
      }

      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);

      const { data, error } = await supabase
        .from("appointments")
        .select("id,start_time,end_time,status,customer_name_snapshot,customers(name,phone)")
        .eq("owner_id", uid)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true })
        .limit(500);

      if (error) setErr("Não consegui carregar marcações.");
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  return (
    <main style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Agenda</div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Marcações (empresa)</div>
        </div>

        <Link href="/dashboard" style={{ fontWeight: 900, textDecoration: "none" }}>
          ← Voltar ao Command Center
        </Link>
      </div>

      {loading ? (
        <div style={{ marginTop: 18, opacity: 0.75 }}>Carregando…</div>
      ) : err ? (
        <div style={{ marginTop: 18, color: "#b91c1c", fontWeight: 800 }}>{err}</div>
      ) : (
        <div style={{ marginTop: 18, border: "1px solid rgba(2,6,23,0.10)", borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.85)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px", gap: 12, padding: "12px 14px", fontSize: 12, fontWeight: 900, opacity: 0.7, borderBottom: "1px solid rgba(2,6,23,0.08)" }}>
            <div>Início</div>
            <div>Cliente</div>
            <div>Status</div>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Sem marcações neste período.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px", gap: 12, padding: "12px 14px", borderBottom: "1px solid rgba(2,6,23,0.06)" }}>
                <div style={{ fontWeight: 900 }}>{fmt(r.start_time)}</div>
                <div style={{ fontWeight: 800 }}>{r.customer_name_snapshot ?? r.customers?.name ?? "—"}</div>
                <div style={{ fontWeight: 900, opacity: 0.85 }}>{r.status}</div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
