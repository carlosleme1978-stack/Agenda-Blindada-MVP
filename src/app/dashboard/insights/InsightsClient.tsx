"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Insight = {
  key: "weak_day" | "weak_hour" | "inactive_clients" | "no_show_loss";
  title: string;
  subtitle: string;
  detail?: string[];
};

type PromoDraft = {
  audience: "inactive_30" | "all_recent";
  message: string;
};

function fmtEUR(v: number) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `€ ${Number(v || 0).toFixed(2)}`;
  }
}

function dayNamePt(dow: number) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dow] ?? "Dia";
}

function Icon({ name }: { name: "calendar" | "clock" | "users" | "alert" }) {
  const common = "h-7 w-7";
  const stroke = "currentColor";
  const sw = 1.6;

  if (name === "calendar") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke={stroke} strokeWidth={sw} />
        <path d="M12 7v5l3 2" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke={stroke} strokeWidth={sw} />
        <path d="M4 21a8 8 0 0 1 16 0" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  // In this codebase, supabaseBrowser is a client instance (not a function).
  const supabase = supabaseBrowser;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Record<string, Insight>>({});

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

        const { data: appts, error: apptErr } = await supabase
          .from("appointments")
          .select("start_time,status_v2,total_price_snapshot,service_duration_minutes_snapshot,client_name,client_phone")
          .gte("start_time", since.toISOString())
          .order("start_time", { ascending: true });

        if (apptErr) throw apptErr;

        const list: any[] = appts ?? [];

        const byDow = new Array(7).fill(0);
        const byHour = new Map<number, number>();

        let noShowLoss = 0;
        let noShowMinutes = 0;

        for (const a of list) {
          const st = new Date(a.start_time);
          const dow = st.getDay();
          const hr = st.getHours();

          byDow[dow] += 1;
          byHour.set(hr, (byHour.get(hr) ?? 0) + 1);

          if (String(a.status_v2).toUpperCase() === "NO_SHOW") {
            noShowLoss += Number(a.total_price_snapshot ?? 0);
            noShowMinutes += Number(a.service_duration_minutes_snapshot ?? 0);
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

        const out: Record<string, Insight> = {
          weak_day: {
            key: "weak_day",
            title: `${dayNamePt(weakDow)} é seu dia mais fraco`,
            subtitle: avg > 0 ? `${weakPct}% menos que a média semanal` : "Sem dados suficientes",
          },
          weak_hour: {
            key: "weak_hour",
            title: "Horário depois das 16h30 está deficitário",
            subtitle: beforeAvg > 0 ? `${weakAfterPct}% menos ocupado` : "Sem dados suficientes",
          },
          inactive_clients: {
            key: "inactive_clients",
            title: `${inactive.length} Clientes inativos`,
            subtitle: "não retornam há mais de 30 dias",
            detail: inactive,
          },
          no_show_loss: {
            key: "no_show_loss",
            title: `${noShowHours || 0} horas perdidas este mês`,
            subtitle: `${fmtEUR(noShowLoss || 0)} em no-shows`,
          },
        };

        const wd = dayNamePt(weakDow);
        const msg =
          `Olá! 😊\n` +
          `Esta semana estamos com um horário especial na ${wd}.\n` +
          `Quer aproveitar uma condição promocional? Responda aqui e eu já encaixo você no melhor horário.`;

        if (!alive) return;
        setInsights(out);
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
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-red-100">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card
          icon={<Icon name="calendar" />}
          title={loading ? "—" : insights.weak_day?.title ?? "—"}
          subtitle={loading ? " " : insights.weak_day?.subtitle ?? "—"}
          buttonLabel="Criar promoção"
          onButton={openPromo}
        />

        <Card
          icon={<Icon name="clock" />}
          title={loading ? "—" : insights.weak_hour?.title ?? "—"}
          subtitle={loading ? " " : insights.weak_hour?.subtitle ?? "—"}
        />

        <Card
          icon={<Icon name="users" />}
          title={loading ? "—" : insights.inactive_clients?.title ?? "—"}
          subtitle={loading ? " " : insights.inactive_clients?.subtitle ?? "—"}
          lines={!loading ? insights.inactive_clients?.detail ?? [] : []}
          buttonLabel="Ver Clientes Inativos"
          onButton={() => {
            setPromo((p) => ({ ...p, audience: "inactive_30" }));
            openPromo();
          }}
        />

        <Card
          icon={<Icon name="alert" />}
          title={loading ? "—" : insights.no_show_loss?.title ?? "—"}
          subtitle={loading ? " " : insights.no_show_loss?.subtitle ?? "—"}
        />
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
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  lines?: string[];
  buttonLabel?: string;
  onButton?: () => void;
}) {
  const { icon, title, subtitle, lines, buttonLabel, onButton } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-1 text-[var(--ab-gold)]">{icon}</div>
        <div className="min-w-0">
          <div className="text-3xl font-semibold leading-tight text-white">{title}</div>
          <div className="mt-2 text-lg text-white/60">{subtitle}</div>
        </div>
      </div>

      {lines && lines.length ? (
        <div className="mt-4 space-y-2 text-base text-white/85">
          {lines.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ) : null}

      {buttonLabel && onButton ? (
        <div className="mt-5">
          <button
            onClick={onButton}
            className="rounded-xl border border-[var(--ab-gold)]/40 bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm font-semibold text-[var(--ab-gold)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            {buttonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
