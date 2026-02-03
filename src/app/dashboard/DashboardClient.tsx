"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AppointmentRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  customer_id: string;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
};

function formatDateTimeLisbon(iso: string) {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
  const time = dt.toLocaleTimeString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

function normalizeStatus(s: string) {
  const raw = (s || "").toUpperCase();
  if (raw.includes("CONFIRM")) return "CONFIRMED";
  if (raw.includes("BOOK")) return "BOOKED";
  if (raw.includes("PEND")) return "PENDING";
  if (raw.includes("CANC")) return "CANCELLED";
  return raw || "—";
}

function statusTone(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "green";
  if (s === "BOOKED" || s === "PENDING") return "blue";
  if (s === "CANCELLED") return "gray";
  return "gray";
}

export default function DashboardClient() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const total = rows.length;
    const confirmed = rows.filter((r) => normalizeStatus(r.status) === "CONFIRMED").length;
    const booked = rows.filter((r) => normalizeStatus(r.status) === "BOOKED").length;
    const pending = rows.filter((r) => normalizeStatus(r.status) === "PENDING").length;
    const cancelled = rows.filter((r) => normalizeStatus(r.status) === "CANCELLED").length;

    // dependendo do teu sistema, "pendentes" pode ser booked + pending
    const pendentes = pending + booked;

    return { total, confirmed, pendentes, cancelled };
  }, [rows]);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        // tenta obter session
        const { data: sessionRes } = await supabase.auth.getSession();
        let uid = sessionRes.session?.user?.id ?? null;

        if (!uid) {
          const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            const id = session?.user?.id ?? null;
            if (id) {
              setUserId(id);
              load(id).catch((e) => {
                setError(e?.message || "Erro ao carregar dashboard");
                setLoading(false);
              });
            }
          });
          unsub = () => data.subscription.unsubscribe();
          setLoading(true);
          return;
        }

        setUserId(uid);
        await load(uid);
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar dashboard");
        setLoading(false);
      }
    };

    const getCompanyId = async (uid: string) => {
      // profiles key varies across installs (id/uid/user_id)
      {
        const r = await supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle();
        if (r.data?.company_id) return r.data.company_id as string;
      }
      {
        const r = await supabase.from("profiles").select("company_id").eq("uid", uid).maybeSingle();
        if (r.data?.company_id) return r.data.company_id as string;
      }
      {
        const r = await supabase.from("profiles").select("company_id").eq("user_id", uid).maybeSingle();
        if (r.data?.company_id) return r.data.company_id as string;
      }
      return null;
    };

    const load = async (uid: string) => {
      const companyId = await getCompanyId(uid);
      if (!companyId) {
        setError("User sem company. Verifique profiles.company_id.");
        setLoading(false);
        return;
      }

      const { data, error: qErr } = await supabase
        .from("appointments")
        .select(
          `
          id,
          start_time,
          end_time,
          status,
          customer_id,
          customer_name_snapshot,
          customers ( name, phone )
        `
        )
        .eq("company_id", companyId)
        .order("start_time", { ascending: false })
        .limit(100);

      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }

      setRows((data as any) ?? []);
      setLoading(false);
    };

    run();

    return () => {
      if (unsub) unsub();
    };
  }, [supabase]);

  const refresh = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);

      // reaproveita a lógica do effect: chama getSession e load “por dentro”
      const { data: sessionRes } = await supabase.auth.getSession();
      const uid = sessionRes.session?.user?.id ?? userId;
      // força recarregar
      // (repetindo o load de forma simples)
      // company_id:
      let companyId: string | null = null;
      {
        const r = await supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle();
        companyId = r.data?.company_id ?? null;
      }
      if (!companyId) {
        const r = await supabase.from("profiles").select("company_id").eq("uid", uid).maybeSingle();
        companyId = r.data?.company_id ?? null;
      }
      if (!companyId) {
        const r = await supabase.from("profiles").select("company_id").eq("user_id", uid).maybeSingle();
        companyId = r.data?.company_id ?? null;
      }
      if (!companyId) {
        setError("User sem company. Verifique profiles.company_id.");
        setLoading(false);
        return;
      }

      const { data, error: qErr } = await supabase
        .from("appointments")
        .select(
          `
          id,
          start_time,
          end_time,
          status,
          customer_id,
          customer_name_snapshot,
          customers ( name, phone )
        `
        )
        .eq("company_id", companyId)
        .order("start_time", { ascending: false })
        .limit(100);

      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }

      setRows((data as any) ?? []);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Erro ao atualizar");
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="wrap">
        <div className="topBar">
          <div className="brand">Agenda Blindada</div>
        </div>
        <div className="container">
          <div className="pageHeader">
            <div>
              <h1>Dashboard</h1>
              <p className="sub">Visão geral das marcações e confirmações via WhatsApp.</p>
            </div>
          </div>

          <div className="gridCards">
            <div className="card skeleton" />
            <div className="card skeleton" />
            <div className="card skeleton" />
            <div className="card skeleton" />
          </div>

          <div className="panel skeleton" style={{ height: 220 }} />
        </div>

        <style jsx>{premiumCss}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="topBar">
          <div className="brand">Agenda Blindada</div>
        </div>
        <div className="container">
          <div className="pageHeader">
            <div>
              <h1>Dashboard</h1>
              <p className="sub">Visão geral das marcações e confirmações via WhatsApp.</p>
            </div>
            <div className="actions">
              <Link className="btn" href="/dashboard/new">+ Nova marcação</Link>
              <Link className="btn ghost" href="/dashboard/billing">Faturação</Link>
              <button className="btn ghost" onClick={signOut}>Sair</button>
            </div>
          </div>

          <div className="panel">
            <div className="panelHead">
              <div className="panelTitle">Erro</div>
            </div>
            <div className="panelBody">
              <p className="errorText">{error}</p>
              <p className="sub" style={{ marginTop: 10 }}>
                <Link href="/login">Ir para login</Link>
              </p>
            </div>
          </div>
        </div>

        <style jsx>{premiumCss}</style>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="topBar">
        <div className="brand">Agenda Blindada</div>
        <div className="topLinks">
          <Link className="topLink" href="/dashboard">Dashboard</Link>
          <Link className="topLink" href="/dashboard/new">Nova marcação</Link>
        </div>
      </div>

      <div className="container">
        <div className="pageHeader">
          <div>
            <h1>Dashboard</h1>
            <p className="sub">Visão geral das marcações e confirmações via WhatsApp.</p>
          </div>
          <div className="actions">
            <Link className="btn" href="/dashboard/new">+ Nova marcação</Link>
            <Link className="btn ghost" href="/dashboard/billing">Faturação</Link>
            <button className="btn ghost" onClick={signOut}>Sair</button>
          </div>
        </div>

        <div className="gridCards">
          <div className="card">
            <div className="cardLabel">Total</div>
            <div className="cardValue">{counts.total}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Confirmadas</div>
            <div className="cardValue">{counts.confirmed}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Pendentes</div>
            <div className="cardValue">{counts.pendentes}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Canceladas</div>
            <div className="cardValue">{counts.cancelled}</div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Próximas marcações</div>
              <div className="panelSub">Lista das últimas marcações (máx. 100)</div>
            </div>
            <button className="btn ghost" onClick={refresh}>Atualizar</button>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th style={{ textAlign: "right" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      Nenhuma marcação ainda.
                    </td>
                  </tr>
                ) : (
                  rows.map((a) => {
                    const displayName =
                      a.customer_name_snapshot?.trim() ||
                      a.customers?.name?.trim() ||
                      "Cliente";

                    const phone = a.customers?.phone || "—";
                    const { date, time } = formatDateTimeLisbon(a.start_time);
                    const st = normalizeStatus(a.status);
                    const tone = statusTone(a.status);

                    return (
                      <tr key={a.id}>
                        <td className="mono">{date} às {time}</td>
                        <td className="strong">{displayName}</td>
                        <td className="mono">{phone}</td>
                        <td style={{ textAlign: "right" }}>
                          <span className={`badge ${tone}`}>{st}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="footerSpace" />
      </div>

      <style jsx>{premiumCss}</style>
    </div>
  );
}

const premiumCss = `
.wrap{
  min-height:100vh;
  background: radial-gradient(1200px 700px at 10% 0%, rgba(99,102,241,0.10), transparent 60%),
              radial-gradient(900px 600px at 90% 10%, rgba(16,185,129,0.10), transparent 55%),
              linear-gradient(180deg, #ffffff 0%, #f7f8fb 100%);
  color:#0b1220;
}

.topBar{
  position:sticky;
  top:0;
  z-index:20;
  backdrop-filter:saturate(180%) blur(10px);
  background: rgba(255,255,255,0.65);
  border-bottom:1px solid rgba(15,23,42,0.06);
  height:54px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 18px;
}

.brand{
  font-weight:900;
  letter-spacing:-0.02em;
}

.topLinks{
  display:flex;
  gap:14px;
  font-size:13px;
}

.topLink{
  color: rgba(15,23,42,0.72);
  text-decoration:none;
}
.topLink:hover{ color:#0b1220; }

.container{
  max-width: 1100px;
  margin: 0 auto;
  padding: 22px 18px;
}

.pageHeader{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:14px;
  margin: 10px 0 18px;
}

h1{
  margin:0;
  font-size:32px;
  letter-spacing:-0.03em;
}

.sub{
  margin:6px 0 0;
  color: rgba(15,23,42,0.65);
  font-size:14px;
}

.actions{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  justify-content:flex-end;
}

.btn{
  border:1px solid rgba(15,23,42,0.10);
  background: rgba(15,23,42,0.92);
  color:#fff;
  padding:10px 12px;
  border-radius:12px;
  font-weight:700;
  font-size:13px;
  text-decoration:none;
  cursor:pointer;
  box-shadow: 0 10px 20px rgba(15,23,42,0.10);
}
.btn:hover{ transform: translateY(-1px); }
.btn:active{ transform: translateY(0px); }

.btn.ghost{
  background: rgba(255,255,255,0.85);
  color: rgba(15,23,42,0.85);
  box-shadow:none;
}
.btn.ghost:hover{
  background:#fff;
}

.gridCards{
  display:grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap:12px;
  margin: 8px 0 14px;
}

.card{
  background: rgba(255,255,255,0.80);
  border:1px solid rgba(15,23,42,0.06);
  border-radius:18px;
  padding:14px 14px;
  box-shadow: 0 18px 40px rgba(15,23,42,0.06);
}

.cardLabel{
  font-size:13px;
  color: rgba(15,23,42,0.65);
  font-weight:700;
}

.cardValue{
  font-size:28px;
  font-weight:900;
  margin-top:6px;
  letter-spacing:-0.03em;
}

.panel{
  background: rgba(255,255,255,0.86);
  border:1px solid rgba(15,23,42,0.06);
  border-radius:18px;
  box-shadow: 0 18px 40px rgba(15,23,42,0.06);
  overflow:hidden;
}

.panelHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:14px 14px;
  border-bottom:1px solid rgba(15,23,42,0.06);
}

.panelTitle{
  font-weight:900;
  letter-spacing:-0.02em;
}

.panelSub{
  margin-top:3px;
  font-size:12px;
  color: rgba(15,23,42,0.65);
}

.panelBody{ padding:14px; }

.tableWrap{
  width:100%;
  overflow:auto;
}

.table{
  width:100%;
  border-collapse:collapse;
  min-width: 760px;
}

.table thead th{
  text-align:left;
  font-size:12px;
  letter-spacing:0.02em;
  text-transform:uppercase;
  color: rgba(15,23,42,0.60);
  padding:12px 14px;
  background: rgba(248,250,252,0.7);
}

.table tbody td{
  padding:14px 14px;
  border-top:1px solid rgba(15,23,42,0.06);
  font-size:14px;
  color: rgba(15,23,42,0.92);
}

.table tbody tr:hover{
  background: rgba(99,102,241,0.05);
}

.strong{ font-weight:900; }
.mono{ font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:7px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:900;
  letter-spacing:0.02em;
  border:1px solid rgba(15,23,42,0.08);
  background: rgba(148,163,184,0.18);
  color: rgba(15,23,42,0.85);
}
.badge::before{
  content:"";
  width:8px;
  height:8px;
  border-radius:999px;
  background: rgba(148,163,184,0.8);
}
.badge.green{
  background: rgba(16,185,129,0.12);
  border-color: rgba(16,185,129,0.22);
  color: rgba(16,185,129,0.95);
}
.badge.green::before{ background: rgba(16,185,129,0.9); }

.badge.blue{
  background: rgba(59,130,246,0.12);
  border-color: rgba(59,130,246,0.22);
  color: rgba(59,130,246,0.95);
}
.badge.blue::before{ background: rgba(59,130,246,0.9); }

.badge.gray{
  background: rgba(148,163,184,0.18);
  border-color: rgba(148,163,184,0.28);
  color: rgba(15,23,42,0.72);
}
.badge.gray::before{ background: rgba(148,163,184,0.9); }

.empty{
  padding:18px 14px;
  color: rgba(15,23,42,0.65);
  font-size:14px;
}

.errorText{
  font-weight:800;
  color: #b91c1c;
}

.skeleton{
  position:relative;
}
.skeleton:after{
  content:"";
  position:absolute;
  inset:0;
  background: linear-gradient(90deg, rgba(148,163,184,0.10), rgba(148,163,184,0.18), rgba(148,163,184,0.10));
  background-size: 300% 100%;
  animation: shimmer 1.2s infinite linear;
  border-radius: inherit;
}
@keyframes shimmer{
  0%{ background-position: 0% 0%; }
  100%{ background-position: 100% 0%; }
}

.footerSpace{ height: 40px; }

@media (max-width: 980px){
  .gridCards{ grid-template-columns: repeat(2, minmax(0,1fr)); }
  .pageHeader{ flex-direction:column; align-items:stretch; }
  .actions{ justify-content:flex-start; }
  .table{ min-width: 680px; }
}
@media (max-width: 520px){
  h1{ font-size: 26px; }
  .gridCards{ grid-template-columns: 1fr; }
  .btn{ width:100%; justify-content:center; text-align:center; }
  .topLinks{ display:none; }
}
`;
