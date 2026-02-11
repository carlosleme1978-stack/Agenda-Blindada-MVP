"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
};

function formatLisbon(iso: string) {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
  const time = dt.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function normalizeStatus(s: string) {
  const raw = (s || "").toUpperCase();
  if (raw.includes("CONFIRM")) return "CONFIRMED";
  if (raw.includes("BOOK")) return "BOOKED";
  if (raw.includes("CANC")) return "CANCELLED";
  return raw || "—";
}

export default function DashboardLiteClient() {
  const sb = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sess } = await sb.auth.getSession();
        const uid = sess.session?.user?.id;
        const t = sess.session?.access_token ?? null;
        setToken(t);
        if (!uid) {
          setError("Faça login.");
          setLoading(false);
          return;
        }

        // resolve company id from profiles (supports legacy columns)
        let companyId: string | null = null;
        {
          const r = await sb.from("profiles").select("company_id").eq("id", uid).maybeSingle();
          companyId = (r.data as any)?.company_id ?? null;
        }
        if (!companyId) {
          const r = await sb.from("profiles").select("company_id").eq("uid", uid).maybeSingle();
          companyId = (r.data as any)?.company_id ?? null;
        }
        if (!companyId) {
          const r = await sb.from("profiles").select("company_id").eq("user_id", uid).maybeSingle();
          companyId = (r.data as any)?.company_id ?? null;
        }
        if (!companyId) {
          setError("User sem company. Verifique profiles.company_id.");
          setLoading(false);
          return;
        }

        const { data, error: qErr } = await sb
          .from("appointments")
          .select(
            `id,start_time,end_time,status,customer_name_snapshot,customers(name,phone)`
          )
          .eq("company_id", companyId)
          .order("start_time", { ascending: true })
          .limit(120);

        if (qErr) throw qErr;
        setRows((data as any) ?? []);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "Erro ao carregar");
        setLoading(false);
      }
    })();
  }, [sb]);

  async function cancel(id: string, displayName: string) {
    if (!token) return;
    if (!confirm(`Cancelar a marcação de ${displayName}?`)) return;
    try {
      setCancellingId(id);
      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appointmentId: id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Falha ao cancelar");

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "CANCELLED" } : r)));
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Agenda</div>
        <div style={{ marginTop: 10, opacity: 0.7 }}>A carregar…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Agenda</div>
        <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/login">Ir para login</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Agenda</div>
        <Link
          href="/dashboard/new"
          style={{
            textDecoration: "none",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(2,6,23,0.12)",
            fontWeight: 900,
            background: "rgba(59,130,246,0.10)",
          }}
        >
          + Nova
        </Link>
      </div>

      <div style={{ height: 12 }} />

      {rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Sem marcações.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((a) => {
            const st = normalizeStatus(a.status);
            const name = a.customer_name_snapshot || a.customers?.name || a.customers?.phone || "Cliente";
            const busy = cancellingId === a.id;
            return (
              <div
                key={a.id}
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(2,6,23,0.08)",
                  background: "rgba(255,255,255,0.85)",
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 900, letterSpacing: -0.2 }}>{name}</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>{formatLisbon(a.start_time)}</div>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>{st}</div>
                  <button
                    onClick={() => cancel(a.id, name)}
                    disabled={st === "CANCELLED" || busy}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(185,28,28,0.25)",
                      background: "rgba(185,28,28,0.08)",
                      fontWeight: 900,
                      cursor: "pointer",
                      opacity: st === "CANCELLED" ? 0.4 : 1,
                    }}
                  >
                    {busy ? "..." : "Cancelar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 16 }} />

      <div style={{ fontSize: 12, opacity: 0.65 }}>
        Modo Lite (telemóvel): aqui só aparece a agenda + cancelar/nova marcação.
      </div>
    </div>
  );
}
