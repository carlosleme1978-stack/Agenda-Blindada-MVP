"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
  active: boolean;
  created_at?: string;
};

export default function ServicesClient() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [name, setName] = useState("");
  const [mins, setMins] = useState<number>(30);
  const [price, setPrice] = useState<string>("");

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

      const s = await sb
        .from("services")
        .select("id,name,duration_minutes,price_cents,active,created_at")
        .eq("company_id", res.company.id)
        .order("created_at", { ascending: true });

      if (s.error) throw s.error;
      setServices((s.data ?? []) as any);

      // defaults do formulário
      setMins(((res.company as any).default_service_minutes ?? (res.company as any).default_duration_minutes ?? 30) as number);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar serviços.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function eurToCents(v: string) {
    const t = (v || "").trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  async function add() {
    setMsg(null);
    if (!company?.id) return;

    const nm = name.trim();
    if (!nm) return setMsg("Informe o nome do serviço.");
    if (!mins || mins < 5) return setMsg("Duração inválida.");

    setSaving(true);
    try {
      const ins = await sb
        .from("services")
        .insert({
          company_id: company.id,
          name: nm,
          duration_minutes: mins,
          price_cents: eurToCents(price),
          active: true,
        })
        .select("id,name,duration_minutes,price_cents,active,created_at")
        .single();

      if (ins.error) throw ins.error;

      setServices((p) => [...p, ins.data as any]);
      setName("");
      setPrice("");
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
      const { error } = await sb.from("services").update({ active: !active }).eq("id", id);
      if (error) throw error;
      setServices((p) => p.map((s) => (s.id === id ? { ...s, active: !active } : s)));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao atualizar.");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(id: string, patch: Partial<ServiceRow>) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb
        .from("services")
        .update({
          name: patch.name,
          duration_minutes: patch.duration_minutes,
          price_cents: patch.price_cents,
        } as any)
        .eq("id", id);

      if (error) throw error;

      setServices((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar edição.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Serviços</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>O WhatsApp lista os serviços ativos.</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" style={{ ...btn, textDecoration: "none", color: "#0f172a" }}>Voltar</Link>
          <Link href="/dashboard/settings" style={{ ...btn, textDecoration: "none", color: "#0f172a" }}>Horários</Link>
        </div>
      </div>

      <div style={card}>
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
                <input style={{ ...input, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Unhas" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Duração (min)</div>
                <input style={{ ...input, marginTop: 6 }} type="number" min={5} step={5} value={mins} onChange={(e) => setMins(parseInt(e.target.value || "30", 10))} />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Preço (€)</div>
                <input style={{ ...input, marginTop: 6 }} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Opcional" />
              </div>

              <button disabled={saving} style={btn} onClick={add} type="button">
                {saving ? "…" : "Adicionar"}
              </button>
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "grid", gap: 10 }}>
              {services.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Nenhum serviço cadastrado.</div>
              ) : (
                services.map((s) => (
                  <ServiceRowItem
                    key={s.id}
                    s={s}
                    saving={saving}
                    onToggle={() => toggleActive(s.id, s.active)}
                    onSave={(patch) => quickUpdate(s.id, patch)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ServiceRowItem({
  s,
  saving,
  onToggle,
  onSave,
}: {
  s: ServiceRow;
  saving: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<ServiceRow>) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const [mins, setMins] = useState<number>(s.duration_minutes);
  const [price, setPrice] = useState<string>(s.price_cents != null ? (s.price_cents / 100).toFixed(2) : "");

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 10px",
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
    background: "rgba(255,255,255,0.85)",
  };

  function eurToCents(v: string) {
    const t = (v || "").trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  return (
    <div style={{ padding: "12px 12px", borderRadius: 16, border: "1px solid rgba(2,6,23,0.10)", background: "rgba(255,255,255,0.85)", opacity: s.active ? 1 : 0.55 }}>
      {!edit ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 950 }}>{s.name}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {s.duration_minutes} min {s.price_cents != null ? `· €${(s.price_cents / 100).toFixed(2)}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn} onClick={() => setEdit(true)} disabled={saving} type="button">Editar</button>
            <button style={btn} onClick={onToggle} disabled={saving} type="button">{s.active ? "Desativar" : "Ativar"}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Nome</div>
            <input style={{ ...input, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Min</div>
            <input style={{ ...input, marginTop: 6 }} type="number" min={5} step={5} value={mins} onChange={(e) => setMins(parseInt(e.target.value || "30", 10))} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Preço (€)</div>
            <input style={{ ...input, marginTop: 6 }} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>

          <button
            style={btn}
            disabled={saving}
            onClick={() => {
              onSave({ name: name.trim(), duration_minutes: mins, price_cents: eurToCents(price) });
              setEdit(false);
            }}
            type="button"
          >
            Salvar
          </button>

          <button style={btn} disabled={saving} onClick={() => setEdit(false)} type="button">Cancelar</button>
        </div>
      )}
    </div>
  );
}
