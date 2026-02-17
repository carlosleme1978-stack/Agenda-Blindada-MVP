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

export default function StaffClient(props: {
  initialCompany: Company;
  initialStaff: StaffRow[];
  initialFinancial: StaffFinancial[];
  initialOccupancy: StaffOccupancy[];
}) {
  const sb = supabaseBrowser;

  const [company] = useState<Company>(props.initialCompany);
  const [staff, setStaff] = useState<StaffRow[]>(props.initialStaff);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursStaff, setHoursStaff] = useState<StaffRow | null>(null);
  const [hours, setHours] = useState<{ day_of_week: number; start_time: string; end_time: string; active: boolean }[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("staff");

  const finMap = useMemo(() => {
    const m = new Map<string, StaffFinancial>();
    for (const r of props.initialFinancial ?? []) m.set(r.staff_id, r);
    return m;
  }, [props.initialFinancial]);

  const occMap = useMemo(() => {
    const m = new Map<string, StaffOccupancy>();
    for (const r of props.initialOccupancy ?? []) m.set(r.staff_id, r);
    return m;
  }, [props.initialOccupancy]);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    outline: "none",
  };

  function fmtEuro(cents?: number | null) {
    const v = Number(cents ?? 0) / 100;
    return v.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  }

  function fmtPct(num: number) {
    return (num * 100).toFixed(0) + "%";
  }

  function occupancyFor(staffId: string) {
    const o = occMap.get(staffId);
    const booked = Number(o?.booked_minutes ?? 0);
    const avail = Number(o?.available_minutes ?? 0);
    if (!avail || avail <= 0) return { rate: 0, label: "—" };
    const rate = booked / avail;
    return { rate, label: fmtPct(rate) };
  }

  async function add() {
    setMsg(null);
    if (!company?.id) return;

    const nm = name.trim();
    if (!nm) return setMsg("Informe o nome.");

    setSaving(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: nm, phone: phone.trim() || null, role: role.trim() || "staff" }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Falha ao criar staff.");

      // Update UI optimistically
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
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/staff/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ staff_id: s.id, active: !s.active }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Falha ao atualizar staff.");

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
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/staff/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ staff_id: s.id, action: "get" }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Falha ao carregar horários.");

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
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");

      const res = await fetch("/api/staff/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ staff_id: hoursStaff.id, action: "set", hours }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Falha ao salvar horários.");

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
    return staff.map((s) => {
      const f = finMap.get(s.id);
      const o = occupancyFor(s.id);
      return {
        ...s,
        revenue: fmtEuro(f?.revenue_realized_cents),
        ticket: fmtEuro(f?.avg_ticket_cents),
        noShow: Number(f?.total_no_show ?? 0),
        completed: Number(f?.total_completed ?? 0),
        occupancy: o.label,
        occupancyRate: o.rate,
      };
    });
  }, [staff, finMap, occMap]);

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Staff</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>{company?.name ?? ""}</div>
        </div>
        <Link href="/dashboard" style={{ opacity: 0.9, textDecoration: "none" }}>
          ← Voltar
        </Link>
      </div>

      {msg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {msg}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <input style={input} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={input} placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select style={input as any} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={add}
          disabled={saving}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(145, 92, 255, 0.18)",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Adicionar
        </button>
        {loading ? <span style={{ opacity: 0.8 }}>Carregando…</span> : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Nome</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Ativo</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Receita</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Ticket</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Ocupação</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>No-show</th>
              <th style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>{s.name}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{s.phone ?? ""}</div>
                </td>
                <td style={{ padding: 12 }}>
                  <span style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: s.active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}>
                    {s.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td style={{ padding: 12 }}>{s.revenue}</td>
                <td style={{ padding: 12 }}>{s.ticket}</td>
                <td style={{ padding: 12 }}>{s.occupancy}</td>
                <td style={{ padding: 12 }}>{s.noShow}</td>
                <td style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => toggle(s)}
                    disabled={saving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {s.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => openHours(s)}
                    disabled={saving || loading}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(59,130,246,0.10)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Horários
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} style={{ padding: 14, opacity: 0.75 }}>
                  Nenhum staff cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {hoursOpen && hoursStaff ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ width: 720, maxWidth: "100%", borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", background: "#0B0B12", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Horários — {hoursStaff.name}</div>
              <button
                onClick={() => {
                  setHoursOpen(false);
                  setHoursStaff(null);
                }}
                style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff" }}
              >
                Fechar
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 90px", gap: 10, fontSize: 12, opacity: 0.85, padding: "6px 0" }}>
              <div>Dia</div>
              <div>Início</div>
              <div>Fim</div>
              <div>Ativo</div>
            </div>

            {hours.map((h, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 90px", gap: 10, alignItems: "center", padding: "8px 0" }}>
                <div style={{ opacity: 0.9 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.day_of_week]}</div>
                <input
                  style={input}
                  value={h.start_time}
                  onChange={(e) =>
                    setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, start_time: e.target.value } : x)))
                  }
                />
                <input
                  style={input}
                  value={h.end_time}
                  onChange={(e) =>
                    setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, end_time: e.target.value } : x)))
                  }
                />
                <input
                  type="checkbox"
                  checked={h.active}
                  onChange={(e) => setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, active: e.target.checked } : x)))}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={saveHours}
                disabled={saving}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(34,197,94,0.14)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
