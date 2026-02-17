"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; name: string | null; phone: string | null; created_at: string | null };
type Appt = { id: string; start_time: string; status: string; service_name_snapshot: string | null; service_price_cents_snapshot: number | null };

function eur(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `${v} €`;
}

export default function CRMCustomerPage() {
  const { id } = useParams() as any;
  const sb = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [stats, setStats] = useState({ spent: 0, visits: 0, avg: 0, last: "—", fav: "—" });

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: sess } = await sb.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const cid = uid;

      const { data: c } = await sb.from("customers").select("id,name,phone,created_at").eq("id", id).eq("owner_id", cid).maybeSingle();
      setCustomer((c as any) ?? null);

      const { data: rows } = await sb
        .from("appointments")
        .select("id,start_time,status,service_name_snapshot,service_price_cents_snapshot")
        .eq("owner_id", cid)
        .eq("customer_id", id)
        .order("start_time", { ascending: false })
        .limit(200);

      const list = ((rows ?? []) as any) as Appt[];
      setAppts(list);

      const ok = list.filter((a) => ["BOOKED", "CONFIRMED", "COMPLETED"].includes(String(a.status)));
      const spent = ok.reduce((a, r) => a + Number(r.service_price_cents_snapshot ?? 0), 0);
      const visits = ok.length;
      const avg = visits ? Math.round(spent / visits) : 0;
      const last = ok[0]?.start_time ? new Date(ok[0].start_time).toLocaleDateString("pt-PT") : "—";

      const freq: Record<string, number> = {};
      for (const a of ok) {
        const s = String(a.service_name_snapshot ?? "").trim();
        if (!s) continue;
        freq[s] = (freq[s] ?? 0) + 1;
      }
      let fav = "—";
      let best = 0;
      for (const [k, v] of Object.entries(freq)) {
        if (v > best) {
          best = v;
          fav = k;
        }
      }

      setStats({ spent, visits, avg, last, fav });
      setLoading(false);
    })();
  }, [id]);

  return (
    <main style={{ padding: 22 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>CRM</div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.5 }}>
              {customer?.name ?? customer?.phone ?? "Cliente"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
              {customer?.phone ? `📱 ${customer.phone}` : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/dashboard/crm" style={{ textDecoration: "none", fontWeight: 900 }}>
              ← Voltar
            </Link>
            <Link href="/dashboard/new" style={{ textDecoration: "none", fontWeight: 900 }}>
              Nova marcação →
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Total gasto</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{loading ? "…" : eur(stats.spent)}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Visitas</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{loading ? "…" : stats.visits}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Ticket médio</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{loading ? "…" : eur(stats.avg)}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Última visita</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950 }}>{loading ? "…" : stats.last}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Serviço favorito</div>
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 950, lineHeight: 1.2 }}>{loading ? "…" : stats.fav}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, borderRadius: 18, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 140px 120px", gap: 12, padding: "12px 14px", fontSize: 12, fontWeight: 950, opacity: 0.7, borderBottom: "1px solid rgba(2,6,23,0.08)" }}>
            <div>Data</div>
            <div>Serviço</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Valor</div>
          </div>

          {loading ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Carregando…</div>
          ) : appts.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Sem histórico.</div>
          ) : (
            appts.map((a) => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 140px 120px", gap: 12, padding: "12px 14px", borderBottom: "1px solid rgba(2,6,23,0.06)" }}>
                <div style={{ fontWeight: 950 }}>{new Date(a.start_time).toLocaleString("pt-PT")}</div>
                <div style={{ fontWeight: 900, opacity: 0.85 }}>{a.service_name_snapshot ?? "—"}</div>
                <div style={{ fontWeight: 950, opacity: 0.8 }}>{a.status}</div>
                <div style={{ textAlign: "right", fontWeight: 950 }}>{eur(Number(a.service_price_cents_snapshot ?? 0))}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
