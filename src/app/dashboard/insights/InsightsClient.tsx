"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type CardData = {
  icon: "calendar" | "clock" | "users" | "alert";
  title: string;
  subtitle: string;
  lines?: string[];
  cta?: { label: string; kind: "promo" | "inactive" };
};

type PromoDraft = {
  audience: "inactive_30" | "all_recent";
  message: string;
};

function ymdLisbon(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNamePt(dow: number) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dow] ?? "Dia";
}

function fmtEURFromCents(cents: number) {
  const eur = (Number(cents || 0) / 100) || 0;
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(eur);
  } catch {
    return `€ ${eur.toFixed(2)}`;
  }
}

function pctLess(weak: number, avg: number) {
  if (!avg || avg <= 0) return null;
  if (weak >= avg) return 0;
  const p = Math.round((1 - weak / avg) * 100);
  return p;
}

function Icon({ name, color }: { name: CardData["icon"]; color: string }) {
  const common = { width: 22, height: 22, display: "block" as const };
  const sw = 1.6;
  const stroke = color;
  if (name === "calendar") {
    return (
      <svg style={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v3M17 3v3" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        <path d="M4.5 8.5h15" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        <path
          d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V8A2.5 2.5 0 0 1 6.5 5.5Z"
          stroke={stroke}
          strokeWidth={sw}
        />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg style={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke={stroke} strokeWidth={sw} />
        <path d="M12 7v5l3 2" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg style={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke={stroke} strokeWidth={sw} />
        <path d="M4 21a8 8 0 0 1 16 0" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg style={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 9v4" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      <path d="M12 17h.01" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M10.3 3.8 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.8a2 2 0 0 0-3.4 0Z"
        stroke={stroke}
        strokeWidth={sw}
      />
    </svg>
  );
}

export default function InsightsClient() {
  const sb = supabaseBrowser;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);

  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState<PromoDraft>({ audience: "inactive_30", message: "" });
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendMsg, setSendMsg] = useState("");

  const palette = useMemo(() => {
    const gold = "rgba(234,179,8,0.80)";
    return {
      gold,
      border: "rgba(255,255,255,0.10)",
      cardBg: "rgba(255,255,255,0.06)",
      cardBg2: "rgba(255,255,255,0.04)",
      textDim: "rgba(255,255,255,0.60)",
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await sb.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) {
          window.location.href = "/login";
          return;
        }
        const ownerId = uid;

        // appointments last 28d
        const since = new Date();
        since.setDate(since.getDate() - 28);

        const { data: appts, error: apptErr } = await sb
          .from("appointments")
          .select("start_time,status,status_v2,service_price_cents_snapshot,service_duration_minutes_snapshot,customer_id,customer_name_snapshot,customer_phone_snapshot")
          .eq("owner_id", ownerId)
          .gte("start_time", since.toISOString())
          .limit(5000);

        if (apptErr) throw apptErr;

        const list: any[] = appts ?? [];

        const byDow = new Array(7).fill(0);
        const byHour = new Map<number, number>();

        let noShowCents = 0;
        let noShowMinutes = 0;

        for (const a of list) {
          const st = new Date(a.start_time);
          byDow[st.getDay()] += 1;
          byHour.set(st.getHours(), (byHour.get(st.getHours()) ?? 0) + 1);

          const sv2 = String(a.status_v2 ?? "").toUpperCase();
          const s = String(a.status ?? "").toUpperCase();
          const isNoShow = sv2 === "NO_SHOW" || s === "NO_SHOW";
          if (isNoShow) {
            noShowCents += Number(a.service_price_cents_snapshot ?? 0);
            noShowMinutes += Number(a.service_duration_minutes_snapshot ?? 0);
          }
        }

        const avg = byDow.reduce((s, v) => s + v, 0) / 7;

        // weak day
        let weakDow = 0;
        let weakCount = Infinity;
        for (let i = 0; i < 7; i++) {
          if (byDow[i] < weakCount) {
            weakCount = byDow[i];
            weakDow = i;
          }
        }
        const weakDayName = dayNamePt(weakDow);
        const weakDayPct = pctLess(weakCount === Infinity ? 0 : weakCount, avg);

        // weak after 16h30 proxy: compare >=17 vs <17
        const entries = Array.from(byHour.entries());
        const after = entries.filter(([h]) => h >= 17).map(([, c]) => c);
        const before = entries.filter(([h]) => h < 17).map(([, c]) => c);
        const afterAvg = after.length ? after.reduce((s, v) => s + v, 0) / after.length : 0;
        const beforeAvg = before.length ? before.reduce((s, v) => s + v, 0) / before.length : 0;
        const weakAfterPct = pctLess(afterAvg, beforeAvg);

        // inactive clients: use customers + appointments last 180d (same logic of CRM)
        const { data: custRows, error: custErr } = await sb
          .from("customers")
          .select("id,name,phone,created_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(1200);

        if (custErr) throw custErr;

        const start180 = new Date();
        start180.setDate(start180.getDate() - 180);

        const { data: ap180, error: ap180Err } = await sb
          .from("appointments")
          .select("customer_id,start_time")
          .eq("owner_id", ownerId)
          .gte("start_time", start180.toISOString())
          .limit(9000);

        if (ap180Err) throw ap180Err;

        const lastByCustomer: Record<string, number> = {};
        for (const a of ap180 ?? []) {
          const cid = String((a as any).customer_id ?? "");
          if (!cid) continue;
          const t = new Date((a as any).start_time).getTime();
          if (!lastByCustomer[cid] || t > lastByCustomer[cid]) lastByCustomer[cid] = t;
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffMs = cutoff.getTime();

        const inactive = (custRows ?? [])
          .filter((c: any) => {
            const cid = String(c.id);
            const last = lastByCustomer[cid] ?? 0;
            return last > 0 && last < cutoffMs;
          })
          .sort((a: any, b: any) => (lastByCustomer[String(a.id)] ?? 0) - (lastByCustomer[String(b.id)] ?? 0))
          .slice(0, 5)
          .map((c: any) => String(c.name ?? "Cliente"));

        const noShowHours = Math.round((noShowMinutes || 0) / 60);

        const c1: CardData = {
          icon: "calendar",
          title: `${weakDayName} é seu dia mais fraco`,
          subtitle: weakDayPct === null ? "Sem dados suficientes" : `-${weakDayPct}% menos que a média semanal`,
          cta: { label: "Criar promoção", kind: "promo" },
        };

        const c2: CardData = {
          icon: "clock",
          title: "Horário depois das 16h30 está deficitário",
          subtitle: weakAfterPct === null ? "Baseado nas últimas 4 semanas" : `-${weakAfterPct}% menos ocupado`,
        };

        const c3: CardData = {
          icon: "users",
          title: `${inactive.length} Clientes inativos`,
          subtitle: "não retornam há mais de 30 dias",
          lines: inactive,
          cta: { label: "Ver Clientes Inativos", kind: "inactive" },
        };

        const c4: CardData = {
          icon: "alert",
          title: `${noShowHours || 0} horas perdidas este mês`,
          subtitle: `${fmtEURFromCents(noShowCents || 0)} em no-shows`,
        };

        const msg =
          `Olá! 😊\n` +
          `Esta semana estamos com um horário especial na ${weakDayName}.\n` +
          `Quer aproveitar uma condição promocional? Responda aqui e eu já encaixo você no melhor horário.`;

        if (!alive) return;
        setCards([c1, c2, c3, c4]);
        setPromo((p) => ({ ...p, message: msg }));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Falha ao carregar insights.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [sb]);

  function openPromo(kind: "promo" | "inactive") {
    setSendState("idle");
    setSendMsg("");
    setPromo((p) => ({ ...p, audience: kind === "inactive" ? "inactive_30" : p.audience }));
    setPromoOpen(true);
  }

  async function sendPromo() {
    setSendState("sending");
    setSendMsg("");
    try {
      const res = await fetch("/api/insights/send-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promo),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Falha ao enviar.");
      setSendState("sent");
      setSendMsg(j?.message ?? "Promoção preparada.");
    } catch (e: any) {
      setSendState("failed");
      setSendMsg(e?.message ?? "Falha ao enviar.");
    }
  }

  const cardStyle = {
    padding: 26,
    borderRadius: 20,
    background: palette.cardBg,
    border: `1px solid ${palette.border}`,
  } as const;

  const iconWrap = {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid rgba(234,179,8,0.25)`,
    background: "rgba(234,179,8,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  } as const;

  const btnStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(234,179,8,0.35)",
    background: "rgba(234,179,8,0.07)",
    color: "rgba(234,179,8,0.95)",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "none",
  } as const;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 22px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 10 }}>Dashboard</div>
        <div style={{ fontSize: 54, fontWeight: 950, letterSpacing: -0.8 }}>Insights</div>
      </div>

      {error ? (
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(127,29,29,0.35)", color: "white", marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {(loading ? new Array(4).fill(null) : cards).map((c: any, idx: number) => {
          const isLoading = loading && !c;
          return (
            <div key={idx} style={cardStyle}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={iconWrap}>
                  <Icon name={isLoading ? "calendar" : c.icon} color={palette.gold} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.08 }}>
                    {isLoading ? "—" : c.title}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 18, color: palette.textDim }}>
                    {isLoading ? " " : c.subtitle}
                  </div>

                  {!isLoading && c.lines && c.lines.length ? (
                    <div style={{ marginTop: 18, display: "grid", gap: 10, fontSize: 18 }}>
                      {c.lines.map((l: string, i: number) => (
                        <div key={i} style={{ opacity: 0.92 }}>{l}</div>
                      ))}
                    </div>
                  ) : null}

                  {!isLoading && c.cta ? (
                    <div style={{ marginTop: 18 }}>
                      <button style={btnStyle} onClick={() => openPromo(c.cta.kind)}>
                        {c.cta.label}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {promoOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.60)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 620, borderRadius: 18, border: `1px solid ${palette.border}`, background: "rgba(12,16,24,0.92)", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>Criar promoção</div>
                <div style={{ marginTop: 4, fontSize: 13, color: palette.textDim }}>Preparar mensagem para WhatsApp</div>
              </div>
              <button
                onClick={() => setPromoOpen(false)}
                style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${palette.border}`, background: palette.cardBg2, color: "rgba(255,255,255,0.85)", fontWeight: 900, cursor: "pointer" }}
              >
                Fechar
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: palette.textDim }}>Audiência</div>
                <select
                  value={promo.audience}
                  onChange={(e) => setPromo((p) => ({ ...p, audience: e.target.value as any }))}
                  style={{ height: 44, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.cardBg2, color: "white", padding: "0 12px", outline: "none" }}
                >
                  <option value="inactive_30">Clientes inativos (+30 dias)</option>
                  <option value="all_recent">Todos clientes recentes (90 dias)</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: palette.textDim }}>Mensagem</div>
                <textarea
                  value={promo.message}
                  onChange={(e) => setPromo((p) => ({ ...p, message: e.target.value }))}
                  rows={7}
                  style={{ borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.cardBg2, color: "white", padding: 12, outline: "none", fontSize: 14, lineHeight: 1.4 }}
                />
              </label>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
                <div style={{ fontSize: 12, color: palette.textDim }}>Dica: CTA simples (“Responda SIM”).</div>
                <button
                  onClick={sendPromo}
                  disabled={sendState === "sending"}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(234,179,8,0.35)",
                    background: "linear-gradient(90deg, rgba(234,179,8,0.95), rgba(94,234,212,0.85))",
                    color: "rgba(0,0,0,0.90)",
                    fontWeight: 950,
                    cursor: sendState === "sending" ? "default" : "pointer",
                    opacity: sendState === "sending" ? 0.6 : 1,
                  }}
                >
                  {sendState === "sending" ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {sendState !== "idle" ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    padding: "10px 12px",
                    border: sendState === "sent" ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(239,68,68,0.35)",
                    background: sendState === "sent" ? "rgba(6,78,59,0.35)" : "rgba(127,29,29,0.35)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {sendMsg || (sendState === "sent" ? "Enviado." : "Falha ao enviar.")}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
