"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CustomerRow = { id: string; name: string | null; phone: string | null; created_at?: string | null };
type ApptRow = { customer_id: string; start_time: string; status: string; service_price_cents_snapshot: number | null; service_name_snapshot: string | null };

function eur(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `${v} €`;
}

export default function CRMPage() {
  const sb = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const tab = sp.get("tab") ?? "all";

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [insight, setInsight] = useState<Record<string, { last: Date | null; future: boolean; canc30: number; spent: number }>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: sess } = await sb.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: prof } = await sb.from("profiles").select("company_id").eq("id", uid).maybeSingle();
      const cid = (prof as any)?.company_id ? String((prof as any).company_id) : null;
      setCompanyId(cid);
      if (!cid) {
        setLoading(false);
        return;
      }

      const { data: custRows } = await sb
        .from("customers")
        .select("id,name,phone,created_at")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
      .limit(800);

      setCustomers((custRows ?? []) as any);

      const start180 = new Date();
      start180.setDate(start180.getDate() - 180);

      const { data: appts } = await sb
        .from("appointments")
        .select("customer_id,start_time,status,service_price_cents_snapshot,service_name_snapshot")
        .eq("company_id", cid)
        .gte("start_time", start180.toISOString())
        .limit(5000);

      const map: Record<string, { last: Date | null; future: boolean; canc30: number; spent: number }> = {};
      const now = new Date();
      const cut30 = new Date();
      cut30.setDate(cut30.getDate() - 30);

      for (const a of (appts ?? []) as any as ApptRow[]) {
        const c = String(a.customer_id ?? "");
        if (!c) continue;
        map[c] ||= { last: null, future: false, canc30: 0, spent: 0 };
        const st = new Date(String(a.start_time));
        const status = String(a.status);

        if (["BOOKED", "CONFIRMED", "PENDING", "COMPLETED"].includes(status)) {
          if (!map[c].last || st > map[c].last!) map[c].last = st;
          if (st > now) map[c].future = true;
        }
        if (status === "CANCELLED" && st >= cut30) map[c].canc30 += 1;

        if (["BOOKED", "CONFIRMED", "COMPLETED"].includes(status)) {
          map[c].spent += Number(a.service_price_cents_snapshot ?? 0);
        }
      }

      setInsight(map);
      setLoading(false);
    })();
  }, []);

  function passFilter(c: CustomerRow) {
    const info = insight[c.id];
    if (!info) return tab === "all";
    const now = new Date();
    const cut30 = new Date();
    cut30.setDate(cut30.getDate() - 30);

    if (tab === "inactive") {
      if (info.future) return false;
      return info.last ? info.last < cut30 : false;
    }
    if (tab === "risk") return info.canc30 >= 2;
    return true;
  }

  const filtered = customers.filter(passFilter);

  return (
    <main style={{ padding: 22 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>CRM</div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.5 }}>Clientes</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75, maxWidth: 700, lineHeight: 1.45 }}>
              Visão rápida de retenção, risco e histórico. (Não envia mensagens automaticamente nesta fase.)
            </div>
          </div>
          <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 900 }}>
            ← Voltar ao Command Center
          </Link>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/dashboard/crm?tab=all" style={{ textDecoration: "none", fontWeight: 900, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(2,6,23,0.10)", background: tab === "all" ? "rgba(2,6,23,0.06)" : "white" }}>
            Todos
          </Link>
          <Link href="/dashboard/crm?tab=inactive" style={{ textDecoration: "none", fontWeight: 900, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(2,6,23,0.10)", background: tab === "inactive" ? "rgba(2,6,23,0.06)" : "white" }}>
            Inativos (30d+)
          </Link>
          <Link href="/dashboard/crm?tab=risk" style={{ textDecoration: "none", fontWeight: 900, padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(2,6,23,0.10)", background: tab === "risk" ? "rgba(2,6,23,0.06)" : "white" }}>
            Risco (2+ cancel.)
          </Link>
        </div>

        <div style={{ marginTop: 14, borderRadius: 18, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 140px 120px", gap: 12, padding: "12px 14px", fontSize: 12, fontWeight: 950, opacity: 0.7, borderBottom: "1px solid rgba(2,6,23,0.08)" }}>
            <div>Cliente</div>
            <div>Última visita</div>
            <div>Risco</div>
            <div style={{ textAlign: "right" }}>Total gasto</div>
          </div>

          {loading ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Carregando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Sem clientes para este filtro.</div>
          ) : (
            filtered.map((c) => {
              const info = insight[c.id];
              const last = info?.last ? info.last.toLocaleDateString("pt-PT") : "—";
              const risk = info?.canc30 ? (info.canc30 >= 2 ? "ALTO" : "—") : "—";
              const spent = eur(info?.spent ?? 0);
              return (
                <Link key={c.id} href={`/dashboard/crm/${encodeURIComponent(c.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 140px 120px", gap: 12, padding: "12px 14px", borderBottom: "1px solid rgba(2,6,23,0.06)" }}>
                    <div style={{ fontWeight: 950 }}>{c.name ?? c.phone ?? "Cliente"}</div>
                    <div style={{ fontWeight: 800, opacity: 0.8 }}>{last}</div>
                    <div style={{ fontWeight: 950, color: risk === "ALTO" ? "#b91c1c" : "rgba(2,6,23,0.65)" }}>{risk}</div>
                    <div style={{ textAlign: "right", fontWeight: 950 }}>{spent}</div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
