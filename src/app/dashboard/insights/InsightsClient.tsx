"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type InsightCardData = {
  title: string;
  subtitle: string;
  lines?: string[];
  cta?: { label: string; kind: "promo" | "inactive" };
};

type PromoDraft = {
  audience: "inactive_30" | "all_recent";
  message: string;
};

function fmtEUR(v: number) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return `€ ${n.toFixed(2)}`;
  }
}

function dayNamePt(dow: number) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dow] ?? "Dia";
}

function pickNumber(row: any, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = row?.[k];
    if (v === 0) return 0;
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return fallback;
}

export default function InsightsClient() {
  const supabase = supabaseBrowser;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, InsightCardData>>({});

  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState<PromoDraft>({ audience: "inactive_30", message: "" });
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendMsg, setSendMsg] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

        // IMPORTANT: use '*' to avoid "column does not exist" across different schemas
        const { data: appts, error: apptErr } = await supabase
          .from("appointments")
          .select("*")
          .gte("start_time", since.toISOString())
          .order("start_time", { ascending: true });

        if (apptErr) throw apptErr;

        const list: any[] = appts ?? [];

        const byDow = new Array(7).fill(0);
        const byHour = new Map<number, number>();

        let noShowLoss = 0;
        let noShowMinutes = 0;

        for (const a of list) {
          const st = new Date(a.start_time ?? a.start ?? a.date ?? Date.now());
          const dow = st.getDay();
          const hr = st.getHours();

          byDow[dow] += 1;
          byHour.set(hr, (byHour.get(hr) ?? 0) + 1);

          const status = String(a.status_v2 ?? a.status ?? "").toUpperCase();
          if (status === "NO_SHOW") {
            const price = pickNumber(a, [
              "total_price_snapshot",
              "total_price",
              "total",
              "price_total",
              "amount_total",
              "value_total",
              "price",
            ]);
            const mins = pickNumber(a, ["service_duration_minutes_snapshot", "duration_minutes", "duration", "minutes"], 0);
            noShowLoss += price;
            noShowMinutes += mins;
          }
        }

        const avg = byDow.reduce((s, v) => s + v, 0) / 7;
        let weakDow = 0;
        let weakCount = Infinity;
        for (let i = 0; i < 7; i++) {
          if (byDow[i] < weakCount) {
            weakCount = byDow[i];
            weakDow = i;
          }
        }
        const weakPct = avg > 0 ? Math.round(((weakCount - avg) / avg) * 100) : 0;

        const hours = Array.from(byHour.entries());
        const after = hours.filter(([h]) => h >= 17).map(([, c]) => c);
        const before = hours.filter(([h]) => h < 17).map(([, c]) => c);
        const afterAvg = after.length ? after.reduce((s, v) => s + v, 0) / after.length : 0;
        const beforeAvg = before.length ? before.reduce((s, v) => s + v, 0) / before.length : 0;
        const weakAfterPct = beforeAvg > 0 ? Math.round(((afterAvg - beforeAvg) / beforeAvg) * 100) : 0;

        // Inactive clients: last 90d, inactive >30d
        const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const { data: ap90, error: ap90Err } = await supabase
          .from("appointments")
          .select("client_name,client_phone,start_time")
          .gte("start_time", since90.toISOString())
          .order("start_time", { ascending: false });

        if (ap90Err) throw ap90Err;

        const byClient = new Map<string, { name: string; last: number }>();
        for (const a of ap90 ?? []) {
          const name = (a as any).client_name ?? "Cliente";
          const phone = (a as any).client_phone ?? "";
          const key = `${phone}__${name}`;
          const t = new Date((a as any).start_time).getTime();
          const prev = byClient.get(key);
          if (!prev || t > prev.last) byClient.set(key, { name, last: t });
        }
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const inactive = Array.from(byClient.values())
          .filter((c) => c.last < cutoff)
          .sort((a, b) => a.last - b.last)
          .slice(0, 5)
          .map((c) => c.name);

        const noShowHours = Math.round(noShowMinutes / 60);

        const weakDayName = dayNamePt(weakDow);
        const msg =
          `Olá! 😊\n` +
          `Esta semana estamos com um horário especial na ${weakDayName}.\n` +
          `Quer aproveitar uma condição promocional? Responda aqui e eu já encaixo você no melhor horário.`;

        const built: Record<string, InsightCardData> = {
          a: {
            title: `${weakDayName} é seu dia mais fraco`,
            subtitle: avg > 0 ? `${weakPct}% menos que a média semanal` : "Sem dados suficientes",
            cta: { label: "Criar promoção", kind: "promo" },
          },
          b: {
            title: "Horário depois das 16h30 está deficitário",
            subtitle: beforeAvg > 0 ? `${weakAfterPct}% menos ocupado` : "Baseado nas últimas 4 semanas",
          },
          c: {
            title: `${inactive.length} Clientes inativos`,
            subtitle: "não retornam há mais de 30 dias",
            lines: inactive,
            cta: { label: "Ver Clientes Inativos", kind: "inactive" },
          },
          d: {
            title: `${noShowHours || 0} horas perdidas este mês`,
            subtitle: `${fmtEUR(noShowLoss || 0)} em no-shows`,
          },
        };

        if (!alive) return;
        setCards(built);
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
  }, [supabase]);

  function openPromo() {
    setSendState("idle");
    setSendMsg("");
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

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6">
        <div className="text-sm text-white/70">Dashboard</div>
        <h1 className="text-5xl font-semibold tracking-tight text-white">Insights</h1>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-red-100">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card
          icon="📅"
          title={loading ? "—" : cards.a?.title ?? "—"}
          subtitle={loading ? " " : cards.a?.subtitle ?? "—"}
          buttonLabel={cards.a?.cta?.label}
          onButton={() => openPromo()}
        />
        <Card icon="⏰" title={loading ? "—" : cards.b?.title ?? "—"} subtitle={loading ? " " : cards.b?.subtitle ?? "—"} />
        <Card
          icon="👥"
          title={loading ? "—" : cards.c?.title ?? "—"}
          subtitle={loading ? " " : cards.c?.subtitle ?? "—"}
          lines={!loading ? cards.c?.lines ?? [] : []}
          buttonLabel={cards.c?.cta?.label}
          onButton={() => {
            setPromo((p) => ({ ...p, audience: "inactive_30" }));
            openPromo();
          }}
        />
        <Card icon="⚠️" title={loading ? "—" : cards.d?.title ?? "—"} subtitle={loading ? " " : cards.d?.subtitle ?? "—"} />
      </div>

      {promoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#121417]/95 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Criar promoção</div>
                <div className="text-sm text-white/60">Preparar mensagem para WhatsApp</div>
              </div>
              <button
                onClick={() => setPromoOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-white/60">Audiência</span>
                <select
                  value={promo.audience}
                  onChange={(e) => setPromo((p) => ({ ...p, audience: e.target.value as any }))}
                  className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none"
                >
                  <option value="inactive_30">Clientes inativos (+30 dias)</option>
                  <option value="all_recent">Todos clientes recentes (90 dias)</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-white/60">Mensagem</span>
                <textarea
                  value={promo.message}
                  onChange={(e) => setPromo((p) => ({ ...p, message: e.target.value }))}
                  rows={6}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none"
                  placeholder="Escreva a mensagem..."
                />
              </label>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-white/60">Dica: mensagem curta com CTA (“responda SIM”).</div>
                <button
                  onClick={sendPromo}
                  disabled={sendState === "sending"}
                  className="rounded-xl border border-white/10 bg-[linear-gradient(90deg,var(--ab-gold),#5eead4)] px-4 py-2 text-sm font-semibold text-black hover:opacity-95 disabled:opacity-60"
                >
                  {sendState === "sending" ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {sendState !== "idle" ? (
                <div
                  className={[
                    "mt-2 rounded-xl px-3 py-2 text-sm",
                    sendState === "sent"
                      ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-100"
                      : "border border-red-500/30 bg-red-950/30 text-red-100",
                  ].join(" ")}
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

function Card(props: {
  icon: string;
  title: string;
  subtitle: string;
  lines?: string[];
  buttonLabel?: string;
  onButton?: () => void;
}) {
  const { icon, title, subtitle, lines, buttonLabel, onButton } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-7 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="mb-2 flex items-start gap-4">
        <div className="mt-1 select-none text-2xl text-[var(--ab-gold)]">{icon}</div>
        <div className="min-w-0">
          <div className="text-3xl font-semibold leading-tight text-white">{title}</div>
          <div className="mt-3 text-lg text-white/60">{subtitle}</div>
        </div>
      </div>

      {lines && lines.length ? (
        <div className="mt-5 space-y-3 text-base text-white/85">
          {lines.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ) : null}

      {buttonLabel && onButton ? (
        <div className="mt-6">
          <button
            onClick={onButton}
            className="rounded-xl border border-[var(--ab-gold)]/40 bg-[rgba(255,255,255,0.03)] px-5 py-2.5 text-sm font-semibold text-[var(--ab-gold)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            {buttonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
