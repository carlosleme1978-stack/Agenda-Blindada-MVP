"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ensureAccess } from "@/lib/access";

export default function NewClient() {
  const r = useRouter();

  const [phone, setPhone] = useState("+351");
  const [name, setName] = useState("");

  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [minutes, setMinutes] = useState(30);


  const [slots, setSlots] = useState<{ label: string; startISO: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [services, setServices] = useState<{ id: string; name: string; duration_minutes: number; price_cents?: number | null; currency?: string | null; category_id?: string | null }[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [slotISO, setSlotISO] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    // Protect route + load categories/services
    (async () => {
      const sb = supabaseBrowser();
      const access = await ensureAccess(sb, { requireActiveSubscription: true, requireOnboardingComplete: true });
      if (!access.ok) return;

      // carrega categorias/serviços
      const { data: cats } = await sb.from("service_categories").select("id,name").order("name");
      const catList = (cats ?? []) as any[];
      setCategories(catList.map((c) => ({ id: String(c.id), name: String(c.name) })));
      if (catList[0]?.id) setCategoryId(String(catList[0].id));

      const { data: svs } = await sb.from("services").select("id,name,duration_minutes,price_cents,currency,category_id").eq("active", true).order("name");
      const svList = (svs ?? []) as any[];
      // filtra pela primeira categoria se existir
      const firstCat = String(catList[0]?.id ?? "");
      const filtered = firstCat ? svList.filter((s) => String(s.category_id) === firstCat) : svList;
      setServices(filtered.map((s) => ({ id: String(s.id), name: String(s.name), duration_minutes: Number((s as any).duration_minutes ?? 30), price_cents: (s as any).price_cents ?? null, currency: (s as any).currency ?? null, category_id: (s as any).category_id ?? null })));
      if (filtered[0]?.id) {
        setServiceId(String(filtered[0].id));
        setServiceIds([String(filtered[0].id)]);
        setMinutes(Number(filtered[0].duration_minutes ?? 30));
      }

    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChangeCategory(newCatId: string) {
    setCategoryId(newCatId);
    setServiceId("");
    const sb = supabaseBrowser();
    const { data: svs } = await sb.from("services").select("id,name,duration_minutes,price_cents,currency,category_id").eq("active", true).order("name");
    const svList = (svs ?? []) as any[];
    const filtered = newCatId ? svList.filter((s) => String(s.category_id) === String(newCatId)) : svList;
    setServices(filtered.map((s) => ({ id: String(s.id), name: String(s.name), duration_minutes: Number((s as any).duration_minutes ?? 30), price_cents: (s as any).price_cents ?? null, currency: (s as any).currency ?? null, category_id: (s as any).category_id ?? null })));
    if (filtered[0]?.id) {
      setServiceId(String(filtered[0].id));
      setMinutes(Number(filtered[0].duration_minutes ?? 30));
      if (date) await loadSlots(undefined, undefined, Number(filtered[0].duration_minutes ?? 30));
    }
  }

  
function calcTotals(ids: string[]) {
  const picked = services.filter((s) => ids.includes(s.id));
  const totalMin = picked.reduce((a, s) => a + Number(s.duration_minutes || 0), 0) || 30;
  const totalCents = picked.reduce((a, s) => a + Number(s.price_cents || 0), 0);
  const currency = (picked.find((s) => s.currency)?.currency ?? "EUR") as string;
  return { totalMin, totalCents, currency, picked };
}

function toggleService(id: string) {
  setServiceIds((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    const { totalMin } = calcTotals(next.length ? next : [id]);
    setMinutes(totalMin);
    // keep legacy serviceId as first selected
    setServiceId((next.length ? next : [id])[0]);
    // refresh slots
    setTimeout(() => loadSlots(undefined, undefined, totalMin), 0);
    return next.length ? next : [id];
  });
}

function fmtMoney(cents: number, currency: string) {
  const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
  return `${v} ${currency}`;
}

async function loadSlots(nextDate?: string, _nextStaffId?: string, nextMinutes?: number) {
    const d = nextDate ?? date;
    const dur = nextMinutes ?? minutes;

    setSlots([]);
    setSlotISO("");

    if (!d) return;

    setLoadingSlots(true);
    setMsg(null);

    try {
      const sb = supabaseBrowser();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setMsg("Faz login.");
        return;
      }

      const res = await fetch(
        `/api/availability?date=${encodeURIComponent(d)}&duration=${encodeURIComponent(String(dur))}&service_ids=${encodeURIComponent(serviceIds.join(","))}&step=15`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(j?.error || "Falha ao carregar horários.");
        return;
      }

      const got = (j?.slots ?? []) as { label: string; startISO: string }[];
      setSlots(got);
      if (got[0]?.startISO) setSlotISO(got[0].startISO);

      if (!got.length) {
        setMsg("Sem horários disponíveis para este dia.");
      }
    } finally {
      setLoadingSlots(false);
    }
  }

  const card = useMemo(
    () => ({
      width: "100%",
      margin: "0 auto",
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: 20,
      boxShadow: "var(--shadow)",
      backdropFilter: "blur(10px)",
      padding: 18,
      maxWidth: 450,
    }),
    []
  );

  const inputStyle = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--text)",
  } as const;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const sb = supabaseBrowser();

      const access = await ensureAccess(sb, { requireActiveSubscription: true, requireOnboardingComplete: true });
      if (!access.ok) return;
      if (!access.ok) return;

      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return setMsg("Faz login.");

      if (!phone || phone.replace(/\D/g, "").length < 9) return setMsg("Informe um telefone válido.");
      if (!name.trim()) return setMsg("Informe o nome do cliente.");
      if (!slotISO) return setMsg("Escolha um horário disponível.");

      const res = await fetch("/api/appointments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerPhone: phone,
          customerName: name,
          startISO: slotISO,
          durationMinutes: minutes,
          serviceId: serviceId || undefined,
        }),
      });

      const t = await res.text();
      if (!res.ok) return setMsg(t);

      r.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

    const totals = calcTotals(serviceIds);

  return (
    <div style={{ minHeight: "calc(100vh - 72px)", display: "flex", flexDirection: "column", padding: "clamp(12px, 3vw, 24px)" }}>
      <main style={{ maxWidth: 900, margin: "0 auto", width: "100%", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 800, color: "var(--text)" }}>
              ← Voltar
            </Link>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link
              href="/dashboard/billing"
              className="ab-btn"
              style={{ textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" }}
            >
              Faturação
            </Link>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>Nova marcação</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>
            Escolha o dia e um horário disponível. O sistema impede marcações fora da agenda.
          </p>
        </div>

        <div style={card}>
          <form onSubmit={save}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>Telefone</label>
            <input
              type="tel"
              required
              inputMode="tel"
              placeholder="+351912345678"
              style={{ ...inputStyle, marginTop: 6 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Formato: +351… (o sistema normaliza para WhatsApp automaticamente)
            </div>
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, opacity: 0.85 }}>
              Total: {totals.totalMin}min{totals.totalCents ? ` · ${fmtMoney(totals.totalCents, totals.currency)}` : ""}
            </div>

            <div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 700 }}>Nome (opcional)</label>
            <input style={{ ...inputStyle, marginTop: 6 }} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carlos" />

            
            <div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 700 }}>Categoria</label>
            <select
              style={{ ...inputStyle, marginTop: 6 }}
              value={categoryId}
              onChange={(e) => onChangeCategory(e.target.value)}
              disabled={!categories.length}
            >
              {categories.length ? (
                categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="">Sem categorias</option>
              )}
            </select>

            <div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 800 }}>Serviços (pode escolher mais de um)</label>
<div style={{ marginTop: 8, display: "grid", gap: 8 }}>
  {services.map((s) => {
    const checked = serviceIds.includes(s.id);
    return (
      <label
        key={s.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--card-border)",
          background: checked ? "var(--card-bg-strong)" : "var(--card-bg)",
          cursor: "pointer",
        }}
      >
        <input type="checkbox" checked={checked} onChange={() => toggleService(s.id)} />
        <div style={{ display: "grid" }}>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{s.name}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {s.duration_minutes}min{typeof s.price_cents === "number" ? ` · ${fmtMoney(s.price_cents, s.currency ?? "EUR")}` : ""}
          </div>
        </div>
      </label>
    );
  })}
</div>

<div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 700 }}>Dia</label>
            <input
              type="date"
              style={{ ...inputStyle, marginTop: 6 }}
              value={date}
              onChange={(e) => {
                const v = e.target.value;
                setDate(v);
                loadSlots(v, undefined, undefined);
              }}
            />

            <div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 700 }}>Duração (min)</label>
            <input
              type="number"
              style={{ ...inputStyle, marginTop: 6 }}
              value={minutes}
              onChange={(e) => {
                const v = parseInt(e.target.value || "30", 10);
                setMinutes(v);
                loadSlots(undefined, undefined, v);
              }}
              min={5}
            />

            <div style={{ height: 12 }} />

            <label style={{ fontSize: 13, fontWeight: 700 }}>Horário disponível</label>
            <select
              style={{ ...inputStyle, marginTop: 6 }}
              value={slotISO}
              onChange={(e) => setSlotISO(e.target.value)}
              disabled={!date || loadingSlots}
            >
              {loadingSlots ? (
                <option value="">A carregar...</option>
              ) : slots.length ? (
                slots.map((s) => (
                  <option key={s.startISO} value={s.startISO}>
                    {s.label}
                  </option>
                ))
              ) : (
                <option value="">Sem horários</option>
              )}
            </select>

            <div style={{ height: 16 }} />

            <button
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(2, 6, 23, 0.10)",
                cursor: "pointer",
                fontWeight: 800,
                letterSpacing: -0.2,
                color: "white",
                background: "linear-gradient(135deg, rgba(17,94,89,1), rgba(59,130,246,1))",
                boxShadow: "0 14px 26px rgba(59,130,246,0.25)",
                opacity: loading ? 0.85 : 1,
              }}
              disabled={loading}
            >
              {loading ? "A guardar..." : "Guardar e voltar"}
            </button>

            {msg && (
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  color: "#b91c1c",
                  background: "rgba(185, 28, 28, 0.07)",
                  border: "1px solid rgba(185, 28, 28, 0.18)",
                  padding: "10px 12px",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              >
                {msg}
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
