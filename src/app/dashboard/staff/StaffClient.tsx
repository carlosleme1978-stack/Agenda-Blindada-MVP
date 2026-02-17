"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Company = {
  id: string;
  name: string | null;
  plan?: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at?: string;
};

type StaffFinancial = {
  staff_id: string;
  revenue_realized_cents: number | null;
  revenue_expected_cents: number | null;
  revenue_lost_cents: number | null;
  total_completed: number | null;
  total_no_show: number | null;
  avg_ticket_cents: number | null;
};

type StaffOccupancy = {
  staff_id: string;
  booked_minutes: number | null;
  available_minutes: number | null;
};

function fmtEuro(cents?: number | null) {
  const v = Number(cents ?? 0) / 100;
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function pct(booked?: number | null, avail?: number | null) {
  const b = Number(booked ?? 0);
  const a = Number(avail ?? 0);
  if (!a) return "—";
  return `${Math.round((b / a) * 100)}%`;
}

export default function StaffClient(props: {
  initialCompany: Company;
  initialStaff: StaffRow[];
  initialFinancial: StaffFinancial[];
  initialOccupancy: StaffOccupancy[];
}) {
  const sb = supabaseBrowser;

  const [company] = useState<Company>(props.initialCompany);
  const [staff, setStaff] = useState<StaffRow[]>(props.initialStaff);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursStaff, setHoursStaff] = useState<StaffRow | null>(null);
  const [hours, setHours] = useState<{ day_of_week: number; start_time: string; end_time: string; active: boolean }[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("staff");

  const finMap = useMemo(() => {
    const m = new Map<string, StaffFinancial>();
    for (const r of props.initialFinancial ?? []) m.set(String(r.staff_id), r);
    return m;
  }, [props.initialFinancial]);

  const occMap = useMemo(() => {
    const m = new Map<string, StaffOccupancy>();
    for (const r of props.initialOccupancy ?? []) m.set(String(r.staff_id), r);
    return m;
  }, [props.initialOccupancy]);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(255,255,255,0.92)",
    color: "#0b1220",
    outline: "none",
    fontWeight: 800,
  };

  async function authedJson(url: string, body: any) {
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Faça login novamente.");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Falha.");
    return json;
  }

  async function add() {
    setMsg(null);
    const nm = name.trim();
    if (!nm) return setMsg("Informe o nome.");

    setSaving(true);
    try {
      const json = await authedJson("/api/staff/create", { name: nm, phone: phone.trim() || null, role: role.trim() || "staff" });
      setStaff((prev) => [...prev, json.staff].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")));
      setName("");
      setPhone("");
      setRole("staff");
      setMsg("Staff criado.");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao criar staff.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: StaffRow) {
    setMsg(null);
    setSaving(true);
    try {
      await authedJson("/api/staff/toggle", { staff_id: s.id, active: !s.active });
      setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
      setMsg("Atualizado.");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao atualizar staff.");
    } finally {
      setSaving(false);
    }
  }

  async function openHours(s: StaffRow) {
    setMsg(null);
    setLoading(true);
    try {
      const json = await authedJson("/api/staff/hours", { staff_id: s.id, action: "get" });
      setHoursStaff(s);
      setHours(json.hours ?? []);
      setHoursOpen(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar horários.");
    } finally {
      setLoading(false);
    }
  }

  async function saveHours() {
    if (!hoursStaff) return;
    setMsg(null);
    setSaving(true);
    try {
      await authedJson("/api/staff/hours", { staff_id: hoursStaff.id, action: "set", hours });
      setMsg("Horários salvos.");
      setHoursOpen(false);
      setHoursStaff(null);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar horários.");
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(() => {
    return staff
      .map((s) => {
        const f = finMap.get(String(s.id));
        const o = occMap.get(String(s.id));
        return {
          ...s,
          revenueReal: fmtEuro(f?.revenue_realized_cents),
          revenueExpected: fmtEuro(f?.revenue_expected_cents),
          ticket: fmtEuro(f?.avg_ticket_cents),
          noShow: Number(f?.total_no_show ?? 0),
          completed: Number(f?.total_completed ?? 0),
          occ: pct(o?.booked_minutes, o?.available_minutes),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, finMap, occMap]);

  return (
    <main style={{ minHeight: "100vh", padding: 18, background: "linear-gradient(180deg, rgba(15,23,42,0.06) 0%, rgba(15,23,42,0.00) 45%), radial-gradient(1200px 600px at 15% -10%, rgba(139,92,246,0.25), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(59,130,246,0.18), transparent 60%)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 950 }}>STAFF · Gestão premium</div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.6 }}>Equipe</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8, fontWeight: 700 }}>{company?.name ?? ""}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 900, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.85)" }}>
              ← Voltar
            </Link>
            <Link href="/dashboard/services" style={{ textDecoration: "none", fontWeight: 900, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.85)" }}>
              Serviços & Categorias
            </Link>
          </div>
        </div>

        {msg ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.90)", border: "1px solid rgba(2,6,23,0.10)", fontWeight: 800 }}>
            {msg}
          </div>
        ) : null}

        <section style={{ marginTop: 14, padding: 14, borderRadius: 18, background: "rgba(255,255,255,0.92)", border: "1px solid rgba(2,6,23,0.10)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 950 }}>Adicionar staff</div>
              <div style={{ fontSize: 16, fontWeight: 950 }}>Novo membro</div>
            </div>
            {loading ? <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Carregando…</div> : null}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.2fr 1fr 220px 140px", gap: 10 }}>
            <input style={input} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={input} placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <select style={input as any} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={add}
              disabled={saving}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(2,6,23,0.10)",
                background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.16))",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              + Criar
            </button>
          </div>
        </section>

        <section style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.92)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 110px 150px 150px 110px 90px 1fr", gap: 10, padding: "12px 14px", fontSize: 12, fontWeight: 950, opacity: 0.7, borderBottom: "1px solid rgba(2,6,23,0.08)" }}>
            <div>Nome</div>
            <div>Ativo</div>
            <div>Receita</div>
            <div>Prevista</div>
            <div>Ticket</div>
            <div>No-show</div>
            <div>Ações</div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.7 }}>Nenhum staff cadastrado.</div>
          ) : (
            rows.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 110px 150px 150px 110px 90px 1fr", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(2,6,23,0.06)", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 950 }}>{s.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{s.phone ?? ""}</div>
                  <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>Ocupação (28d): {s.occ}</div>
                </div>
                <div>
                  <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(2,6,23,0.10)", background: s.active ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", fontWeight: 950 }}>
                    {s.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div style={{ fontWeight: 950 }}>{s.revenueReal}</div>
                <div style={{ fontWeight: 950 }}>{s.revenueExpected}</div>
                <div style={{ fontWeight: 950 }}>{s.ticket}</div>
                <div style={{ fontWeight: 950 }}>{s.noShow}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    href={`/dashboard/staff-view/${encodeURIComponent(s.id)}`}
                    style={{ textDecoration: "none", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(2,6,23,0.04)", fontWeight: 950 }}
                  >
                    Agenda
                  </Link>
                  <button
                    onClick={() => openHours(s)}
                    disabled={saving || loading}
                    style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(59,130,246,0.10)", fontWeight: 950, cursor: "pointer" }}
                  >
                    Horários
                  </button>
                  <button
                    onClick={() => toggle(s)}
                    disabled={saving}
                    style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(2,6,23,0.10)", background: s.active ? "rgba(239,68,68,0.10)" : "rgba(34,197,94,0.10)", fontWeight: 950, cursor: "pointer" }}
                  >
                    {s.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {hoursOpen && hoursStaff ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
            <div style={{ width: 760, maxWidth: "100%", borderRadius: 18, border: "1px solid rgba(255,255,255,0.18)", background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(2,6,23,0.92))", color: "white", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Horários</div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>{hoursStaff.name}</div>
                </div>
                <button
                  onClick={() => {
                    setHoursOpen(false);
                    setHoursStaff(null);
                  }}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.20)", color: "white", fontWeight: 900, cursor: "pointer" }}
                >
                  Fechar
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "120px 1fr 1fr 90px", gap: 10, fontSize: 12, opacity: 0.85, fontWeight: 900 }}>
                <div>Dia</div>
                <div>Início</div>
                <div>Fim</div>
                <div>Ativo</div>
              </div>

              {hours.map((h, idx) => (
                <div key={idx} style={{ marginTop: 10, display: "grid", gridTemplateColumns: "120px 1fr 1fr 90px", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 900 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.day_of_week]}</div>
                  <input
                    style={{ ...input, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.16)", color: "white" }}
                    value={h.start_time}
                    onChange={(e) => setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, start_time: e.target.value } : x)))}
                  />
                  <input
                    style={{ ...input, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.16)", color: "white" }}
                    value={h.end_time}
                    onChange={(e) => setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, end_time: e.target.value } : x)))}
                  />
                  <input type="checkbox" checked={h.active} onChange={(e) => setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, active: e.target.checked } : x)))} />
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button
                  onClick={saveHours}
                  disabled={saving}
                  style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(34,197,94,0.16)", color: "white", fontWeight: 950, cursor: "pointer" }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
