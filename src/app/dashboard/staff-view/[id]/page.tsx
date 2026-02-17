"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type StaffRow = {
  id: string;
  name: string;
  company_id: string;
  active: boolean;
};

type AppointmentRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  customer_name_snapshot: string | null;
  customers?: { name: string | null; phone: string | null } | null;
};

function startOfDayISO(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return x.toISOString();
}

function fmtDateLabel(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

export default function StaffViewPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => supabaseBrowser, []);
  const staffId = params.id;

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"basic" | "pro">("basic");
  const [staff, setStaff] = useState<StaffRow | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState<"today" | "tomorrow" | "week" | "month">("week");
  const [tab, setTab] = useState<"ALL" | "CONFIRMED" | "PENDING" | "CANCELLED">("ALL");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) {
          setError("Sessão expirada. Faça login novamente.");
          setLoading(false);
          return;
        }

        // profile -> company
        const { data: prof } = await supabase
          .from("profiles")
          .select("company_id, role")
          .eq("id", uid)
          .maybeSingle();

        const companyId = (prof as any)?.company_id as string | null;
        if (!companyId) {
          setError("Conta sem empresa associada.");
          setLoading(false);
          return;
        }

        // company plan
        const { data: comp } = await supabase.from("companies").select("plan").eq("id", companyId).maybeSingle();
        const planLocal = String((comp as any)?.plan ?? "basic").toLowerCase() === "pro" ? "pro" : "basic";
        setPlan(planLocal as any);

        // staff belongs to company
        const { data: st } = await supabase
          .from("staff")
          .select("id,name,company_id,active")
          .eq("id", staffId)
          .maybeSingle();

        if (!st || String((st as any).company_id) !== String(companyId)) {
          setError("Staff inválido ou não pertence à sua empresa.");
          setLoading(false);
          return;
        }
        setStaff(st as any);

        // If not PRO, block the view
        if (planLocal !== "pro") {
          setRows([]);
          setLoading(false);
          return;
        }

        // Date window
        const now = new Date();
        const d0 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
        const from =
          day === "today"
            ? startOfDayISO(d0)
            : day === "tomorrow"
            ? startOfDayISO(new Date(d0.getTime() + 86400000))
            : startOfDayISO(d0);
        const to =
          day === "today"
            ? endOfDayISO(d0)
            : day === "tomorrow"
            ? endOfDayISO(new Date(d0.getTime() + 86400000))
            : endOfDayISO(new Date(d0.getTime() + 6 * 86400000));

        let q = supabase
          .from("appointments")
          .select(
            `
            id,
            start_time,
            end_time,
            status,
            customer_name_snapshot,
            customers ( name, phone )
          `
          )
          .eq("company_id", companyId)
          .eq("staff_id", staffId)
          .gte("start_time", from)
          .lte("start_time", to)
          .order("start_time", { ascending: true })
          .limit(500);

        if (tab !== "ALL") q = (q as any).eq("status", tab);

        const { data: appts, error: qErr } = await (q as any);
        if (qErr) {
          setError("Não consegui carregar as marcações deste staff.");
          setLoading(false);
          return;
        }
        setRows((appts ?? []) as any);
      } catch {
        setError("Erro inesperado ao carregar agenda do staff.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, day, tab]);

  const grouped = useMemo(() => {
    const m = new Map<string, AppointmentRow[]>();
    for (const r of rows) {
      const key = r.start_time.slice(0, 10); // yyyy-mm-dd
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [rows]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
    const pending = rows.filter((r) => r.status === "BOOKED" || r.status === "PENDING").length;
    const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
    return { total, confirmed, pending, cancelled };
  }, [rows]);

  return (
    <main className="wrap">
      <div className="top">
        <div>
          <div className="kicker">PRO · Agenda do staff</div>
          <div className="title">{staff?.name ?? "Staff"}</div>
          <div className="sub">Visão exclusiva das marcações deste atendente.</div>
        </div>
        <div className="topBtns">
          <Link className="btn ghost" href="/dashboard">
            Voltar ao Command Center
          </Link>
          <Link className="btn" href="/dashboard/staff">
            Gestão de staff
          </Link>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}

      {plan !== "pro" && !loading && (
        <div className="gate">
          <div className="gateTitle">Recurso PRO</div>
          <div className="gateText">
            A agenda por staff está disponível apenas no plano <b>PRO</b>.
          </div>
          <Link className="btn" href="/dashboard/billing">
            Fazer upgrade
          </Link>
        </div>
      )}

      <div className="bar">
        <div className="seg">
          <button className={day === "today" ? "segBtn on" : "segBtn"} onClick={() => setDay("today")}>
            Hoje
          </button>
          <button className={day === "tomorrow" ? "segBtn on" : "segBtn"} onClick={() => setDay("tomorrow")}>
            Amanhã
          </button>
          <button className={day === "week" ? "segBtn on" : "segBtn"} onClick={() => setDay("week")}>
            7 dias
          </button>
        </div>

        <div className="seg">
          <button className={tab === "ALL" ? "segBtn on" : "segBtn"} onClick={() => setTab("ALL")}>
            Todas
          </button>
          <button className={tab === "CONFIRMED" ? "segBtn on" : "segBtn"} onClick={() => setTab("CONFIRMED")}>
            Confirmadas
          </button>
          <button className={tab === "PENDING" ? "segBtn on" : "segBtn"} onClick={() => setTab("PENDING")}>
            Pendentes
          </button>
          <button className={tab === "CANCELLED" ? "segBtn on" : "segBtn"} onClick={() => setTab("CANCELLED")}>
            Canceladas
          </button>
        </div>

        <div className="metrics">
          <div className="m"><span>Total</span><b>{metrics.total}</b></div>
          <div className="m"><span>Confirm.</span><b>{metrics.confirmed}</b></div>
          <div className="m"><span>Pend.</span><b>{metrics.pending}</b></div>
          <div className="m"><span>Cancel.</span><b>{metrics.cancelled}</b></div>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading">A carregar…</div>
        ) : plan !== "pro" ? null : grouped.length === 0 ? (
          <div className="empty">Sem marcações neste período.</div>
        ) : (
          grouped.map(([dayKey, list]) => (
            <div key={dayKey} className="day">
              <div className="dayHead">{fmtDateLabel(dayKey + "T00:00:00.000Z")}</div>
              <div className="list">
                {list.map((r) => {
                  const cname = r.customer_name_snapshot || r.customers?.name || "Cliente";
                  const phone = r.customers?.phone || "";
                  const badge =
                    r.status === "CONFIRMED"
                      ? "ok"
                      : r.status === "CANCELLED"
                      ? "bad"
                      : r.status === "BOOKED" || r.status === "PENDING"
                      ? "warn"
                      : "muted";
                  return (
                    <div key={r.id} className="row">
                      <div className="time">{fmtTime(r.start_time)}</div>
                      <div className="who">
                        <div className="nm">{cname}</div>
                        <div className="ph">{phone}</div>
                      </div>
                      <div className={"badge " + badge}>{r.status}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .wrap {
          min-height: calc(100vh - 40px);
          padding: 24px 18px 28px;
          background: radial-gradient(1100px 600px at 20% 10%, rgba(99,102,241,0.20), transparent 60%),
            radial-gradient(900px 500px at 80% 20%, rgba(34,197,94,0.12), transparent 55%),
            linear-gradient(180deg, #0b1220, #070b14 60%, #070b14);
          color: rgba(255, 255, 255, 0.92);
        }
        .top {
          max-width: 1100px;
          margin: 0 auto 16px;
          display: flex;
          gap: 14px;
          align-items: flex-start;
          justify-content: space-between;
        }
        .kicker {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: -0.2px;
          opacity: 0.82;
        }
        .title {
          font-size: 34px;
          font-weight: 950;
          letter-spacing: -0.9px;
          line-height: 1.05;
          margin-top: 6px;
        }
        .sub {
          margin-top: 8px;
          font-size: 13px;
          opacity: 0.78;
          max-width: 720px;
        }
        .topBtns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .btn {
          padding: 10px 12px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(99,102,241,1), rgba(168,85,247,1));
          border: 1px solid rgba(255,255,255,0.10);
          color: white;
          font-weight: 900;
          text-decoration: none;
          box-shadow: 0 16px 30px rgba(99,102,241,0.22);
        }
        .btn.ghost {
          background: rgba(255,255,255,0.06);
          box-shadow: none;
        }
        .alert {
          max-width: 1100px;
          margin: 0 auto 14px;
          padding: 12px 12px;
          border-radius: 14px;
          font-size: 13px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.06);
        }
        .alert.err {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.08);
        }
        .gate {
          max-width: 1100px;
          margin: 0 auto 14px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
        }
        .gateTitle { font-weight: 950; font-size: 16px; }
        .gateText { margin-top: 6px; opacity: 0.8; font-size: 13px; margin-bottom: 12px; }

        .bar {
          max-width: 1100px;
          margin: 0 auto 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
        }
        .seg { display: flex; gap: 8px; flex-wrap: wrap; }
        .segBtn {
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.88);
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
        }
        .segBtn.on {
          background: rgba(99,102,241,0.25);
          border-color: rgba(99,102,241,0.45);
        }
        .metrics { display: flex; gap: 10px; flex-wrap: wrap; }
        .m { display: flex; gap: 8px; align-items: baseline; padding: 8px 10px; border-radius: 12px; background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.08); }
        .m span { font-size: 11px; opacity: 0.75; font-weight: 900; }
        .m b { font-size: 16px; letter-spacing: -0.4px; }

        .panel {
          max-width: 1100px;
          margin: 0 auto;
          padding: 14px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          box-shadow: 0 26px 60px rgba(0,0,0,0.35);
        }
        .loading, .empty { padding: 16px; opacity: 0.8; font-size: 13px; }
        .day { margin-top: 12px; }
        .dayHead { font-weight: 950; font-size: 13px; opacity: 0.9; margin: 10px 6px; }
        .list { display: grid; gap: 10px; }
        .row {
          display: grid;
          grid-template-columns: 90px 1fr 130px;
          gap: 10px;
          align-items: center;
          padding: 12px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(0,0,0,0.20);
        }
        .time { font-weight: 950; letter-spacing: -0.2px; }
        .who .nm { font-weight: 900; }
        .who .ph { font-size: 12px; opacity: 0.75; margin-top: 2px; }
        .badge {
          justify-self: end;
          padding: 8px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 11px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          text-transform: uppercase;
          letter-spacing: 0.2px;
        }
        .badge.ok { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.35); }
        .badge.warn { background: rgba(245,158,11,0.18); border-color: rgba(245,158,11,0.35); }
        .badge.bad { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.35); }
        .badge.muted { opacity: 0.75; }

        @media (max-width: 720px) {
          .row { grid-template-columns: 80px 1fr; grid-auto-rows: auto; }
          .badge { justify-self: start; }
          .top { flex-direction: column; }
        }
      `}</style>
    </main>
  );
}
