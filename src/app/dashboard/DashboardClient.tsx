"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type StatusFilter = "ALL" | "CONFIRMED" | "PENDING" | "CANCELLED";

function lisbonYMD(d: Date) {
  // YYYY-MM-DD in Europe/Lisbon
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysLisbon(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

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

/** ✅ “agora” real em Europe/Lisbon */
function nowLisbonDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
}
function diffMinutes(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}
function humanEta(mins: number) {
  if (mins === 0) return "agora";
  if (mins > 0) return `em ${mins} min`;
  return `há ${Math.abs(mins)} min`;
}

function normalizeStatus(s: string) {
  const raw = (s || "").toUpperCase();
  if (raw.includes("CONFIRM")) return "CONFIRMED";
  if (raw.includes("BOOK")) return "BOOKED";
  if (raw.includes("PEND")) return "PENDING";
  if (raw.includes("CANC")) return "CANCELLED";
  return raw || "—";
}

// No teu sistema “pendentes” = BOOKED + PENDING
function statusBucket(normalized: string): StatusFilter {
  if (normalized === "CONFIRMED") return "CONFIRMED";
  if (normalized === "CANCELLED") return "CANCELLED";
  if (normalized === "BOOKED" || normalized === "PENDING") return "PENDING";
  return "ALL";
}

function statusTone(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "green";
  if (s === "BOOKED" || s === "PENDING") return "blue";
  if (s === "CANCELLED") return "gray";
  return "gray";
}

function statusLabelPT(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "CONFIRMADO";
  if (s === "CANCELLED") return "CANCELADO";
  if (s === "BOOKED") return "RESERVADO";
  if (s === "PENDING") return "PENDENTE";
  return s || "—";
}

function cleanStr(x: any) {
  return (x ?? "").toString().trim().toLowerCase();
}

export default function DashboardClient() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string>("owner");
  const [meStaffId, setMeStaffId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [ownerStaffFilter, setOwnerStaffFilter] = useState<string>("");
  const [metricsToday, setMetricsToday] = useState<number>(0);
  const [metricsWeek, setMetricsWeek] = useState<number>(0);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ NOVO: estado do botão cancelar
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // B: filtros
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

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

    
    const getProfile = async (uid: string) => {
      // tenta diferentes chaves, pois alguns projetos antigos usavam uid/user_id
      {
        const r = await supabase.from("profiles").select("company_id,role,staff_id").eq("id", uid).maybeSingle();
        if (r.data) return r.data as any;
      }
      {
        const r = await supabase.from("profiles").select("company_id,role,staff_id").eq("uid", uid).maybeSingle();
        if (r.data) return r.data as any;
      }
      {
        const r = await supabase.from("profiles").select("company_id,role,staff_id").eq("user_id", uid).maybeSingle();
        if (r.data) return r.data as any;
      }
      return null;
    };

const getCompanyId = async (uid: string) => {
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
      const prof = await getProfile(uid);
      const role = String((prof as any)?.role ?? "owner").toLowerCase();
      const staffId = ((prof as any)?.staff_id as string) ?? null;
      setMeRole(role);
      setMeStaffId(staffId);


      const companyId = await getCompanyId(uid);

      // owner pode filtrar agenda por staff via ?staff=ID
      const qsStaff = searchParams?.get("staff") || "";
      if (qsStaff) setOwnerStaffFilter(qsStaff);

      if (!companyId) {
        setError("User sem company. Verifique profiles.company_id.");
        setLoading(false);
        return;
      }

      // tenta obter o plano da company para saber se o filtro por staff é suportado
      let companyPlan: string | null = null;
      try {
        const { data: compRes, error: compErr } = await supabase
          .from("companies")
          .select("plan")
          .eq("id", companyId)
          .maybeSingle();
        if (compErr) {
          console.warn("Erro ao buscar plan da company:", compErr);
        } else {
          companyPlan = (compRes as any)?.plan ?? null;
        }
      } catch (err) {
        console.warn("Erro ao buscar plan da company:", err);
      }

      if (role === "owner") {
        const { data: st } = await supabase
          .from("staff")
          .select("id,name,active,created_at")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("created_at", { ascending: true });
        setStaffList(((st as any) ?? []).map((s: any) => ({ id: String(s.id), name: String(s.name) })));
      }

      let q = supabase
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
        .eq("company_id", companyId);

      // Staff view:
      // - se for staff logado => filtra automaticamente
      // - se for owner e escolher um staff => filtra por esse staff
      // calcula um staffFilter local a partir do estado (evita referência indefinida)
      const staffFilter = meRole === "staff" ? meStaffId : (ownerStaffFilter || null);
      if (staffFilter && companyPlan === "pro") {
        q = (q as any).eq("staff_id", staffFilter);
      }

      const { data, error: qErr } = await (q as any)
        .order("start_time", { ascending: true })
        .limit(200);

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

      const { data: sessionRes } = await supabase.auth.getSession();
      const uid = sessionRes.session?.user?.id ?? userId;

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
        .order("start_time", { ascending: true })
        .limit(200);

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

  // ✅ NOVO: ação de cancelar (chama tua API /api/appointments/cancel)
     async function cancelAppointment(a: any) {
  const st = normalizeStatus(a.status);
  if (st === "CANCELLED") return;

  const ok = window.confirm(
    `Cancelar a marcação de ${a._displayName}?\n\nIsso vai cancelar no sistema e enviar mensagem de reagendar ao cliente.`
  );
  if (!ok) return;

  try {
    setCancellingId(a.id);
    setError(null);

    // ✅ pega o access_token da sessão atual
    const { data: sessionRes } = await supabase.auth.getSession();
    const token = sessionRes.session?.access_token;

    if (!token) {
      throw new Error("Sessão inválida. Faça login novamente.");
    }

    const res = await fetch("/api/appointments/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // ✅ obrigatório no teu setup
      },
      body: JSON.stringify({ appointment_id: a.id }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Falha ao cancelar");

    // ✅ Atualiza UI
    setRows((prev) =>
      prev.map((r) => (r.id === a.id ? { ...r, status: "CANCELLED" } : r))
    );

    // Aviso se WhatsApp falhar (cancelamento foi feito mesmo assim)
    if (json && json.whatsapp_sent === false && json.whatsapp_error) {
      setError(`Cancelado, mas WhatsApp falhou: ${json.whatsapp_error}`);
    }

    await refresh();
  } catch (e: any) {
    setError(e?.message || "Erro ao cancelar");
  } finally {
    setCancellingId(null);
  }
}


  // ✅ dataset “enriquecido” (nome/telefone/status normalizado)
  const enriched = useMemo(() => {
    return rows.map((a) => {
      const displayName = a.customer_name_snapshot?.trim() || a.customers?.name?.trim() || "Cliente";
      const phone = a.customers?.phone || "—";
      const st = normalizeStatus(a.status);
      const bucket = statusBucket(st);

      return {
        ...a,
        _displayName: displayName,
        _phone: phone,
        _st: st,
        _bucket: bucket,
        _startMs: new Date(a.start_time).getTime(),
      };
    });
  }, [rows]);

  // ✅ ordenação “próximas primeiro”
  const sorted = useMemo(() => {
    const now = Date.now();
    const copy = [...enriched];

    copy.sort((a, b) => {
      const aFuture = a._startMs >= now;
      const bFuture = b._startMs >= now;

      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      if (aFuture && bFuture) return a._startMs - b._startMs;
      return b._startMs - a._startMs;
    });

    return copy;
  }, [enriched]);

  // ✅ filtro + busca
  const filtered = useMemo(() => {
    const qq = cleanStr(q);
    return sorted.filter((a) => {
      const okFilter = filter === "ALL" ? true : a._bucket === filter;

      if (!okFilter) return false;
      if (!qq) return true;

      const name = cleanStr(a._displayName);
      const phone = cleanStr(a._phone);
      return name.includes(qq) || phone.includes(qq);
    });
  }, [sorted, filter, q]);

  // ✅ contadores
  const counts = useMemo(() => {
    const total = filtered.length;
    const confirmed = filtered.filter((r) => r._bucket === "CONFIRMED").length;
    const pending = filtered.filter((r) => r._bucket === "PENDING").length;
    const cancelled = filtered.filter((r) => r._bucket === "CANCELLED").length;
    return { total, confirmed, pendentes: pending, cancelled };
  }, [filtered]);

  const activeChip = (v: StatusFilter) => (v === filter ? "chip active" : "chip");

  const nowLisbon = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => lisbonYMD(nowLisbon), [nowLisbon]);
  const tomorrowYmd = useMemo(() => lisbonYMD(addDaysLisbon(nowLisbon, 1)), [nowLisbon]);

  // ✅ Apenas hoje/amanhã/depois (sem passado)
  const grouped = useMemo(() => {
    const today: any[] = [];
    const tomorrow: any[] = [];
    const after: any[] = [];

    const nowMs = Date.now();
    for (const a of filtered as any[]) {
      const ms = a._startMs ?? new Date(a.start_time).getTime();
      if (ms < nowMs - 60 * 1000) continue; // ignora passado
      const ymd = lisbonYMD(new Date(a.start_time));
      if (ymd === todayYmd) today.push(a);
      else if (ymd === tomorrowYmd) tomorrow.push(a);
      else after.push(a);
    }

    const byTime = (x: any, y: any) => (x._startMs ?? 0) - (y._startMs ?? 0);
    today.sort(byTime);
    tomorrow.sort(byTime);
    after.sort(byTime);

    return { today, tomorrow, after };
  }, [filtered, todayYmd, tomorrowYmd]);

  const { today, tomorrow, after } = grouped;

  /** ✅ Próxima marcação (a mais próxima futura) + ETA */
  const nextAppointment = useMemo(() => {
    const nowMs = nowLisbonDate().getTime();
    const all = [...today, ...tomorrow, ...after]
      .filter((a: any) => (a._startMs ?? new Date(a.start_time).getTime()) >= nowMs)
      .sort((a: any, b: any) => (a._startMs ?? 0) - (b._startMs ?? 0));
    return all[0] ?? null;
  }, [today, tomorrow, after]);

  const nextEtaLabel = useMemo(() => {
    if (!nextAppointment) return null;
    const mins = diffMinutes(nowLisbonDate(), new Date(nextAppointment.start_time));
    return humanEta(mins);
  }, [nextAppointment]);

  // ✅ Tabela com botão cancelar
  const renderTable = (list: any[]) => (
    <div className="tableWrap">
      <table className="table">
        <thead>
          <tr>
            <th>Início</th>
            <th>Cliente</th>
            <th>Telefone</th>
            <th style={{ textAlign: "right" }}>Estado</th>
            <th style={{ textAlign: "right" }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty">
                Sem marcações.
              </td>
            </tr>
          ) : (
            list.map((a: any) => {
              const { date, time } = formatDateTimeLisbon(a.start_time);
              const tone = statusTone(a.status);
              const label = statusLabelPT(a.status);

              const isCancelled = normalizeStatus(a.status) === "CANCELLED";
              const busy = cancellingId === a.id;

              return (
                <tr key={a.id}>
                  <td className="mono">
                    {date} às {time}
                  </td>
                  <td className="strong">{a._displayName}</td>
                  <td className="mono">{a._phone}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`badge ${tone}`}>{label}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className={`btnDanger ${isCancelled ? "disabled" : ""}`}
                      disabled={isCancelled || busy}
                      onClick={() => cancelAppointment(a)}
                      title={isCancelled ? "Já está cancelada" : "Cancelar marcação"}
                    >
                      {busy ? "Cancelando..." : "Cancelar"}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

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

          <div className="panel skeleton" style={{ height: 240 }} />
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
              <Link className="btn" href="/dashboard/new">
                + Nova marcação
              </Link>
              <Link className="btn ghost" href="/dashboard/billing">
                Faturação
              </Link>
              <button className="btn ghost" onClick={signOut}>
                Sair
              </button>
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
          <Link className="topLink" href="/dashboard">
            Hoje
          </Link>
          <Link className="topLink" href="/dashboard/new">
            Nova marcação
          </Link>
          <Link className="topLink" href="/dashboard/services">
            Serviços
          </Link>
          <Link className="topLink" href="/dashboard/staff">
            Staff
          </Link>
          <Link className="topLink" href="/dashboard/settings">
            Settings
          </Link>
        </div>
      </div>

      <div className="container">
        <div className="pageHeader">
          <div>
            <h1>Dashboard</h1>
            <p className="sub">Visão geral das marcações e confirmações via WhatsApp.</p>
          </div>
          <div className="actions">
            <Link className="btn" href="/dashboard/new">
              + Nova marcação
            </Link>
            <Link className="btn ghost" href="/dashboard/billing">
              Faturação
            </Link>
            <button className="btn ghost" onClick={signOut}>
              Sair
            </button>
          </div>
        </div>

        {/* ✅ barra premium de filtros + busca */}
        <div className="toolbar">
          <div className="chips">
            <button className={activeChip("ALL")} onClick={() => setFilter("ALL")}>
              Todas
            </button>
            <button className={activeChip("CONFIRMED")} onClick={() => setFilter("CONFIRMED")}>
              Confirmadas
            </button>
            <button className={activeChip("PENDING")} onClick={() => setFilter("PENDING")}>
              Pendentes
            </button>
            <button className={activeChip("CANCELLED")} onClick={() => setFilter("CANCELLED")}>
              Canceladas
            </button>
          </div>

          <div className="searchWrap">
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente ou telefone…"
            />
            <button className="btn ghost" onClick={refresh}>
              Atualizar
            </button>
          </div>
        </div>

        <div className="gridCards">
          <div className="card">
            <div className="cardLabel">Total</div>
            <div className="cardValue">{counts.total}</div>
            <div className="cardHint">Considera filtro + busca</div>
          </div>
          <div className="card">
            <div className="cardLabel">Confirmadas</div>
            <div className="cardValue">{counts.confirmed}</div>
            <div className="cardHint">Estado: confirmado</div>
          </div>
          <div className="card">
            <div className="cardLabel">Pendentes</div>
            <div className="cardValue">{counts.pendentes}</div>
            <div className="cardHint">Reservado / pendente</div>
          </div>
          <div className="card">
            <div className="cardLabel">Canceladas</div>
            <div className="cardValue">{counts.cancelled}</div>
            <div className="cardHint">Estado: cancelado</div>
          </div>
        </div>

        {/* ✅ Próxima marcação (card) */}
        <div className="card nextCard">
          <div>
            <div className="cardLabel">Próxima marcação</div>

            {!nextAppointment ? (
              <div className="nextBig">Nenhuma marcada ✅</div>
            ) : (
              <>
                <div className="nextBig">
                  {formatDateTimeLisbon(nextAppointment.start_time).date} às{" "}
                  {formatDateTimeLisbon(nextAppointment.start_time).time} —{" "}
                  {nextAppointment._displayName}
                </div>
                <div className="nextSmall">
                  {statusLabelPT(nextAppointment.status)}
                  {nextEtaLabel ? ` · ${nextEtaLabel}` : ""}
                </div>
              </>
            )}
          </div>

          {nextAppointment ? (
            <span className={`badge ${statusTone(nextAppointment.status)}`}>
              {statusLabelPT(nextAppointment.status)}
            </span>
          ) : null}
        </div>

        <div className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Marcações</div>
            </div>

            <div className="panelRight">
              {q ? (
                <button className="chip subtle" onClick={() => setQ("")}>
                  Limpar busca
                </button>
              ) : null}
            </div>
          </div>

          <div className="section">
            <div className="sectionHead">
              <div className="sectionTitle">Hoje</div>
              <div className="sectionSub">{todayYmd}</div>
            </div>
            {renderTable(today)}
          </div>

          <div className="section">
            <div className="sectionHead">
              <div className="sectionTitle">Amanhã</div>
              <div className="sectionSub">{tomorrowYmd}</div>
            </div>
            {renderTable(tomorrow)}
          </div>

          <div className="section">
            <div className="sectionHead">
              <div className="sectionTitle">Depois</div>
              <div className="sectionSub">Próximos dias</div>
            </div>
            {renderTable(after)}
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
  padding: 18px;
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

/* ✅ toolbar premium */
.toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin: 6px 0 14px;
  flex-wrap: wrap;
}

.chips{
  display:flex;
  gap:8px;
  flex-wrap: wrap;
}

.chip{
  appearance:none;
  border:1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.86);
  color: rgba(15,23,42,0.85);
  padding:9px 10px;
  border-radius:999px;
  font-weight:900;
  font-size:12px;
  cursor:pointer;
}
.chip:hover{ background:#fff; transform: translateY(-1px); }
.chip:active{ transform: translateY(0px); }
.chip.active{
  background: rgba(15,23,42,0.92);
  color:#fff;
  border-color: rgba(15,23,42,0.18);
}
.chip.subtle{
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.18);
  color: rgba(99,102,241,0.95);
}

.searchWrap{
  display:flex;
  gap:10px;
  align-items:center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search{
  border:1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.90);
  padding:10px 12px;
  border-radius:12px;
  min-width: 320px;
  outline:none;
  font-size:13px;
}
.search:focus{
  border-color: rgba(99,102,241,0.35);
  box-shadow: 0 0 0 4px rgba(99,102,241,0.10);
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
  margin-left:20px;
}

.cardLabel{
  font-size:13px;
  color: rgba(15,23,42,0.65);
  font-weight:700;
  margin-left:20px;
}

.cardValue{
  font-size:28px;
  font-weight:900;
  margin-top:6px;
  letter-spacing:-0.03em;
  margin-left:20px;
}

.cardHint{
  margin-top:10px;
  font-size:12px;
  color: rgba(15,23,42,0.60);
  margin-left:20px;
}

.panel{
  background: rgba(255,255,255,0.86);
  border:1px solid rgba(15,23,42,0.06);
  border-radius:18px;
  box-shadow: 0 18px 40px rgba(3, 15, 45, 0.06);
  overflow:hidden;
}

.panelHead{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:14px 14px;
  border-bottom:1px solid rgba(62, 115, 237, 0.06);
  margin-left:20px;
}

.panelTitle{
  font-weight:900;
  letter-spacing:-0.10em;
}

.panelSub{
  margin-top:3px;
  font-size:12px;
  color: rgba(25, 172, 167, 0.65);
  margin-left:20px;
}

.panelRight{
  display:flex;
  align-items:center;
  gap:10px;
  margin-left:20px;
}

.panelBody{ padding:14px; }

.tableWrap{
  width:100%;
  overflow:auto;
}

.table{
  width:100%;
  border-collapse:collapse;
  min-width: 860px;
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
  color: rgba(15, 17, 13, 0.92);
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

.section{margin-top:14px;}
.sectionTitle{font-weight:900; }
.sectionSub{font-size:12px;color:rgba(15,23,42,0.55);}

.footerSpace{ height: 40px; }

@media (max-width: 980px){
  .gridCards{ grid-template-columns: repeat(2, minmax(0,1fr)); }
  .pageHeader{ flex-direction:column; align-items:stretch; }
  .actions{ justify-content:flex-start; }
  .table{ min-width: 760px; }
  .search{ min-width: 240px; }
}
@media (max-width: 520px){
  h1{ font-size: 26px; }
  .gridCards{ grid-template-columns: 1fr; }
  .btn{ width:100%; justify-content:center; text-align:center; }
  .topLinks{ display:none; }
  .search{ width:100%; min-width: unset; }
  .searchWrap{ width:100%; justify-content: stretch; }
}

/* ✅ card “Próxima marcação” */
.nextCard{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  margin: 10px 0 14px;
}
.nextBig{
  font-size:16px;
  font-weight:900;
  letter-spacing:-0.01em;
  margin-top:6px;
}
.nextSmall{
  margin-top:6px;
  font-size:12px;
  color: rgba(15,23,42,0.65);
  font-weight:700;
}

/* ✅ NOVO: botão cancelar */
.btnDanger{
  border:1px solid rgba(185,28,28,0.18);
  background: rgba(185,28,28,0.10);
  color: rgba(185,28,28,0.95);
  padding:9px 10px;
  border-radius:12px;
  font-weight:900;
  font-size:12px;
  cursor:pointer;
}
.btnDanger:hover{
  background: rgba(185,28,28,0.14);
  transform: translateY(-1px);
}
.btnDanger:active{ transform: translateY(0px); }
.btnDanger.disabled{
  opacity:0.55;
  cursor:not-allowed;
}
`;
