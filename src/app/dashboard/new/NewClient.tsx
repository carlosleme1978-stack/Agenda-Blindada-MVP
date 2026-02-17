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

  const [slots, setSlots] = useState<{ label: string; startISO: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [services, setServices] = useState<{ id: string; name: string; duration_minutes: number; price_cents?: number | null; currency?: string | null; category_id?: string | null }[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [slotISO, setSlotISO] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser;
      const access = await ensureAccess(sb, { requireActiveSubscription: true, requireOnboardingComplete: true });
      if (!access.ok) return;

      // categorias/serviços
      const { data: cats } = await sb.from("service_categories").select("id,name").order("name");
      const catList = (cats ?? []) as any[];
      setCategories(catList.map((c) => ({ id: String(c.id), name: String(c.name) })));
      if (catList[0]?.id) setCategoryId(String(catList[0].id));

      const { data: svs } = await sb.from("services").select("id,name,duration_minutes,price_cents,currency,category_id").eq("active", true).order("name");
      const svList = (svs ?? []) as any[];
      const firstCat = String(catList[0]?.id ?? "");
      const filtered = firstCat ? svList.filter((s) => String(s.category_id) === firstCat) : svList;

      setServices(
        filtered.map((s) => ({
          id: String(s.id),
          name: String(s.name),
          duration_minutes: Number((s as any).duration_minutes ?? 30),
          price_cents: (s as any).price_cents ?? null,
          currency: (s as any).currency ?? null,
          category_id: (s as any).category_id ?? null,
        }))
      );

      if (filtered[0]?.id) {
        setServiceIds([String(filtered[0].id)]);
      }
    })();
  }, []);

  async function onChangeCategory(newCatId: string) {
    setCategoryId(newCatId);
    setServiceIds([]);

    const sb = supabaseBrowser;
    const { data: svs } = await sb.from("services").select("id,name,duration_minutes,price_cents,currency,category_id").eq("active", true).order("name");
    const svList = (svs ?? []) as any[];
    const filtered = newCatId ? svList.filter((s) => String(s.category_id) === String(newCatId)) : svList;

    setServices(
      filtered.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        duration_minutes: Number((s as any).duration_minutes ?? 30),
        price_cents: (s as any).price_cents ?? null,
        currency: (s as any).currency ?? null,
        category_id: (s as any).category_id ?? null,
      }))
    );

    if (filtered[0]?.id) {
      setServiceIds([String(filtered[0].id)]);
      if (date) await loadSlots(date, [String(filtered[0].id)]);
    }
  }

  function calcTotals(ids: string[]) {
    const picked = services.filter((s) => ids.includes(s.id));
    const totalMin = picked.reduce((a, s) => a + Number(s.duration_minutes || 0), 0) || 30;
    const totalCents = picked.reduce((a, s) => a + Number(s.price_cents || 0), 0);
    const currency = (picked.find((s) => s.currency)?.currency ?? "EUR") as string;
    return { totalMin, totalCents, currency, picked };
  }

  function fmtMoney(cents: number, currency: string) {
    const v = (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
    return `${v} ${currency}`;
  }

  function toggleService(id: string) {
    setServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const safe = next.length ? next : [id];
      setTimeout(() => loadSlots(undefined, safe), 0);
      return safe;
    });
  }

  async function loadSlots(nextDate?: string, nextServiceIds?: string[]) {
    const d = nextDate ?? date;
    const ids = nextServiceIds ?? serviceIds;

    setSlots([]);
    setSlotISO("");

    if (!d || !ids.length) return;

    const totals = calcTotals(ids);

    setLoadingSlots(true);
    setMsg(null);

    try {
      const sb = supabaseBrowser;
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setMsg("Faz login.");
        return;
      }

      const res = await fetch(
        `/api/availability?date=${encodeURIComponent(d)}&duration=${encodeURIComponent(String(totals.totalMin))}&service_ids=${encodeURIComponent(ids.join(","))}&step=15`,
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

      if (!got.length) setMsg("Sem horários disponíveis para este dia.");
    } finally {
      setLoadingSlots(false);
    }
  }

  const card = useMemo(
    () => ({
      width: "100%",
      margin: "0 auto",
      background: "rgba(255,255,255,0.82)",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: 20,
      boxShadow: "0 26px 48px rgba(15, 23, 42, 0.08), 0 8px 18px rgba(15, 23, 42, 0.05)",
      padding: 18,
      maxWidth: 470,
    }),
    []
  );

  const inputStyle = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2, 6, 23, 0.12)",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.9)",
  } as const;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const sb = supabaseBrowser;
      const access = await ensureAccess(sb, { requireActiveSubscription: true, requireOnboardingComplete: true });
      if (!access.ok) return;

      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return setMsg("Faz login.");

      if (!phone || phone.replace(/\D/g, "").length < 9) return setMsg("Informe um telefone válido.");
      if (!name.trim()) return setMsg("Informe o nome do cliente.");
      if (!slotISO) return setMsg("Escolha um horário disponível.");
      if (!serviceIds.length) return setMsg("Escolha pelo menos 1 serviço.");

      const totals = calcTotals(serviceIds);

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
          durationMinutes: totals.totalMin,
          serviceIds: serviceIds,
          serviceId: serviceIds[0],
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(1200px 800px at 20% 20%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(900px 700px at 80% 30%, rgba(236,72,153,0.14), transparent 55%), radial-gradient(900px 700px at 55% 85%, rgba(16,185,129,0.12), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 60%, #ecfeff 100%)",
        padding: "clamp(12px, 3vw, 24px)",
      }}
    >
      <main style={{ maxWidth: 900, margin: "0 auto", width: "100%", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Nova marcação</div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.6 }}>Escolha dia e horário</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.78, maxWidth: 720, lineHeight: 1.5 }}>
              Modelo SOLO: você vê apenas <b>horários disponíveis</b> (o sistema bloqueia conflitos automaticamente).
            </div>
          </div>
          <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 900 }}>
            ← Voltar ao Command Center
          </Link>
        </div>

        <div style={{ height: 16 }} />

        <form onSubmit={save} style={card}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Telefone</label>
          <input style={{ ...inputStyle, marginTop: 6 }} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Formato: +351... (o sistema normaliza para WhatsApp automaticamente)</div>

          <div style={{ height: 10 }} />

          <div style={{ fontSize: 13, fontWeight: 900 }}>
            Total: {totals.totalMin}min · {fmtMoney(totals.totalCents, totals.currency)}
          </div>

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>Nome (opcional)</label>
          <input style={{ ...inputStyle, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cliente" />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>Categoria</label>
          <select style={{ ...inputStyle, marginTop: 6 }} value={categoryId} onChange={(e) => onChangeCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
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
                    border: "1px solid rgba(2,6,23,0.10)",
                    background: checked ? "rgba(2,6,23,0.04)" : "rgba(255,255,255,0.9)",
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
              loadSlots(v, undefined);
            }}
          />

          <div style={{ height: 12 }} />

          <label style={{ fontSize: 13, fontWeight: 700 }}>Horário disponível</label>
          <select style={{ ...inputStyle, marginTop: 6 }} value={slotISO} onChange={(e) => setSlotISO(e.target.value)} disabled={loadingSlots || !slots.length}>
            {!slots.length ? <option value="">{loadingSlots ? "Carregando…" : "Sem horários"}</option> : null}
            {slots.map((s) => (
              <option key={s.startISO} value={s.startISO}>
                {s.label}
              </option>
            ))}
          </select>

          <div style={{ height: 14 }} />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "none",
              cursor: "pointer",
              fontWeight: 950,
              background: "linear-gradient(90deg, rgba(16,185,129,0.95), rgba(59,130,246,0.95))",
              color: "white",
              boxShadow: "0 18px 36px rgba(15, 23, 42, 0.12)",
            }}
          >
            {loading ? "Salvando…" : "Guardar e voltar"}
          </button>

          {msg ? (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(185,28,28,0.18)", background: "rgba(185,28,28,0.06)", color: "#b91c1c", fontWeight: 800 }}>
              {msg}
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
