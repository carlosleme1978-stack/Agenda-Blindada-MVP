"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";

type StaffRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  created_at?: string;
};

export default function StaffClient() {
  const sb = supabaseBrowser;
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("staff");

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.12)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.95)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    background: "rgba(255,255,255,0.85)",
  };

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.86)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 20,
    boxShadow: "0 30px 60px rgba(15, 23, 42, 0.08), 0 8px 18px rgba(15, 23, 42, 0.05)",
    padding: 18,
    maxWidth: 980,
    margin: "0 auto",
  };

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await ensureAccess(sb, {
        requireActiveSubscription: true,
        requireOnboardingComplete: false,
      });
      if (!res.ok || !res.company) return;

      setCompany(res.company);

      const r = await sb
        .from("staff")
        .select("id,name,phone,role,active,created_at")
        .eq("company_id", res.company.id)
        .order("created_at", { ascending: true });

      if (r.error) throw r.error;
      setStaff((r.data ?? []) as any);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar staff.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (!res.ok) {
        throw new Error(json?.error || "Erro ao adicionar.");
      }

      setStaff((p) => [...p, (json.staff as any)]);
      setName("");
      setPhone("");
      setRole("staff");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao adicionar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb.from("staff").update({ active: !active }).eq("id", id);
      if (error) throw error;
      setStaff((p) => p.map((s) => (s.id === id ? { ...s, active: !active } : s)));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao atualizar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Staff</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Cadastre quem atende. (Ativos aparecem nas marcações.)</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" style={{ ...btn, textDecoration: "none", color: "#0f172a" }}>Voltar</Link>
          <Link href="/dashboard/services" style={{ ...btn, textDecoration: "none", color: "#0f172a" }}>Serviços</Link>
          <Link href="/dashboard/settings" style={{ ...btn, textDecoration: "none", color: "#0f172a" }}>Settings</Link>
        </div>
      </div>


      <div style={card}>
        {company && (
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Plano: <b>{company.plan?.toUpperCase?.() ? company.plan.toUpperCase() : company.plan}</b> · Staff ativo:{" "}
              <b>{staff.filter((x) => x.active).length}</b> / <b>{company.staff_limit ?? 1}</b>
            </div>
            {staff.filter((x) => x.active).length >= (company.staff_limit ?? 1) && (
              <Link href="/dashboard/billing" style={{ fontSize: 13, fontWeight: 900, textDecoration: "none" }}>
                Atualizar para PRO →
              </Link>
            )}
          </div>
        )}

        {msg && (
          <div
            style={{
              marginBottom: 12,
              color: "#b91c1c",
              background: "rgba(185, 28, 28, 0.07)",
              border: "1px solid rgba(185, 28, 28, 0.18)",
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        )}

        {loading ? (
          <div style={{ opacity: 0.7 }}>Carregando…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Nome</div>
                <input style={{ ...input, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ana" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Telefone</div>
                <input style={{ ...input, marginTop: 6 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Cargo</div>
                <select style={{ ...input, marginTop: 6 }} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="assistant">Assistente</option>
                  <option value="owner">Owner</option>
                </select>
              </div>

              <button
                disabled={saving || (!!company && staff.filter((x) => x.active).length >= (company.staff_limit ?? 1))}
                style={btn}
                onClick={add}
                type="button"
              >
                {saving ? "…" : "Adicionar"}
              </button>
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "grid", gap: 10 }}>
              {staff.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Nenhum staff cadastrado.</div>
              ) : (
                staff.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(2,6,23,0.08)",
                      background: "rgba(255,255,255,0.8)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{s.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{s.role ?? "staff"}</div>
                    </div>
                    <div style={{ fontFamily: "ui-monospace, SFMono-Regular" }}>{s.phone ?? "—"}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{s.active ? "Ativo" : "Inativo"}</div>
                    <button disabled={saving} style={btn} onClick={() => toggleActive(s.id, s.active)} type="button">
                      {s.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
