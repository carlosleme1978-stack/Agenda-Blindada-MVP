"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Users, AlertTriangle, Sparkles, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Insight = {
  key: "weak_day" | "weak_hour" | "inactive_clients" | "no_show_loss";
  title: string;
  subtitle: string;
  detail?: string[];
  cta?: { label: string; action: "open_promo" | "view_inactive" };
  meta?: Record<string, any>;
};

type PromoDraft = {
  title: string;
  message: string;
  audience: "inactive_30" | "all_recent";
};

function fmtEUR(v: number) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `€ ${v.toFixed(2)}`;
  }
}

function dayNamePt(dow: number) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dow] ?? "Dia";
}

export default function InsightsClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState<PromoDraft>({
    title: "Promoção para dia fraco",
    message: "",
    audience: "inactive_30",
  });
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendMsg, setSendMsg] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
        const { data: appts, error: apptErr } = await supabase
          .from("appointments")
          .select("id,start_time,end_time,status_v2,client_name,client_phone,total_price_snapshot,service_duration_minutes_snapshot")
          .gte("start_time", since.toISOString())
          .order("start_time", { ascending: true });

        if (apptErr) throw apptErr;

        const list = (appts ?? []).filter(Boolean) as any[];

        const byDow = new Array(7).fill(0).map(() => ({ count: 0, revenue: 0 }));
        const byHour = new Map<number, { count: number; revenue: number }>();

        let noShowLoss = 0;
        let noShowMinutes = 0;

        for (const a of list) {
          const st = new Date(a.start_time);
          const dow = st.getDay();
          const hour = st.getHours();
          const revenue = Number(a.total_price_snapshot ?? 0);

          byDow[dow].count += 1;
          byDow[dow].revenue += revenue;

          const h = byHour.get(hour) ?? { count: 0, revenue: 0 };
          h.count += 1;
          h.revenue += revenue;
          byHour.set(hour, h);

          if (String(a.status_v2).toUpperCase() === "NO_SHOW") {
            noShowLoss += revenue;
            const mins = Number(a.service_duration_minutes_snapshot ?? 0);
            noShowMinutes += mins > 0 ? mins : 0;
          }
        }

        const avg = byDow.reduce((s, x) => s + x.count, 0) / 7;
        let weakDow = 0;
        let weakCount = Infinity;
        for (let i = 0; i < 7; i++) {
          if (byDow[i].count < weakCount) {
            weakCount = byDow[i].count;
            weakDow = i;
          }
        }
        const weakPct = avg > 0 ? Math.round(((weakCount - avg) / avg) * 100) : 0;

        const hours = Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]);
        const after = hours.filter(([h]) => h >= 17);
        const before = hours.filter(([h]) => h < 17);
        const afterAvg = after.length ? after.reduce((s, [, v]) => s + v.count, 0) / after.length : 0;
        const beforeAvg = before.length ? before.reduce((s, [, v]) => s + v.count, 0) / before.length : 0;
        const weakAfterPct = beforeAvg > 0 ? Math.round(((afterAvg - beforeAvg) / beforeAvg) * 100) : 0;

        const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const { data: ap90, error: ap90Err } = await supabase
          .from("appointments")
          .select("client_name,client_phone,start_time")
          .gte("start_time", since90.toISOString())
          .order("start_time", { ascending: false });

        if (ap90Err) throw ap90Err;

        const byClient = new Map<string, { name: string; phone: string; last: number }>();
        for (const a of ap90 ?? []) {
          const name = (a as any).client_name ?? "Cliente";
          const phone = (a as any).client_phone ?? "";
          const key = `${phone}__${name}`;
          const t = new Date((a as any).start_time).getTime();
          const prev = byClient.get(key);
          if (!prev || t > prev.last) byClient.set(key, { name, phone, last: t });
        }

        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const inactive = Array.from(byClient.values())
          .filter((c) => c.last < cutoff)
          .sort((a, b) => a.last - b.last)
          .slice(0, 5);

        const inactiveNames = inactive.map((c) => c.name);

        const noShowHours = Math.round(noShowMinutes / 60);

        const built: Insight[] = [
          {
            key: "weak_day",
            title: `${dayNamePt(weakDow)} é seu dia mais fraco`,
            subtitle: avg > 0 ? `${weakPct}% menos que a média semanal` : "Sem dados suficientes",
            cta: { label: "Criar promoção", action: "open_promo" },
            meta: { weakDow },
          },
          {
            key: "weak_hour",
            title: "Horário depois das 16h30 está deficitário",
            subtitle: beforeAvg > 0 ? `${weakAfterPct}% menos ocupado` : "Sem dados suficientes",
          },
          {
            key: "inactive_clients",
            title: `${inactive.length} Clientes inativos`,
            subtitle: "não retornam há mais de 30 dias",
            detail: inactiveNames,
            cta: { label: "Ver Clientes Inativos", action: "view_inactive" },
          },
          {
            key: "no_show_loss",
            title: `${noShowHours || 0} horas perdidas este mês`,
            subtitle: `${fmtEUR(noShowLoss || 0)} em no-shows`,
          },
        ];

        if (!alive) return;
        setInsights(built);

        const wd = dayNamePt(weakDow);
        const msg =
          `Olá! 😊\n` +
          `Esta semana estamos com um horário especial na ${wd}.\n` +
          `Quer aproveitar uma condição promocional? Responda aqui e eu já encaixo você no melhor horário.`;
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
      setSendMsg(j?.message ?? "Promoção enviada.");
    } catch (e: any) {
      setSendState("failed");
      setSendMsg(e?.message ?? "Falha ao enviar.");
    }
  }

  function viewInactive() {
    setPromo((p) => ({ ...p, audience: "inactive_30" }));
    openPromo();
  }

  const weakDay = insights.find((i) => i.key === "weak_day");
  const inactive = insights.find((i) => i.key === "inactive_clients");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6">
        <div className="text-sm text-white/70">Dashboard</div>
        <h1 className="text-5xl font-semibold tracking-tight text-white">Insights</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <InsightCard
          icon={<CalendarDays className="h-6 w-6 text-[var(--ab-gold)]" />}
          title={weakDay?.title ?? "—"}
          subtitle={weakDay?.subtitle ?? "—"}
          actionLabel="Criar promoção"
          onAction={openPromo}
          loading={loading}
        />

        <InsightCard
          icon={<Clock3 className="h-6 w-6 text-[var(--ab-gold)]" />}
          title={insights.find((i) => i.key === "weak_hour")?.title ?? "—"}
          subtitle={insights.find((i) => i.key === "weak_hour")?.subtitle ?? "—"}
          loading={loading}
        />

        <InsightCard
          icon={<Users className="h-6 w-6 text-[var(--ab-gold)]" />}
          title={inactive?.title ?? "—"}
          subtitle={inactive?.subtitle ?? "—"}
          lines={inactive?.detail ?? []}
          actionLabel="Ver Clientes Inativos"
          onAction={viewInactive}
          loading={loading}
        />

        <InsightCard
          icon={<AlertTriangle className="h-6 w-6 text-[var(--ab-gold)]" />}
          title={insights.find((i) => i.key === "no_show_loss")?.title ?? "—"}
          subtitle={insights.find((i) => i.key === "no_show_loss")?.subtitle ?? "—"}
          loading={loading}
        />
      </div>

      {promoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#121417]/95 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--ab-gold)]" />
                <div>
                  <div className="text-lg font-semibold text-white">Criar promoção</div>
                  <div className="text-sm text-white/60">Preparar e enviar mensagem para clientes</div>
                </div>
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
                <div className="text-xs text-white/60">Dica: use uma mensagem curta e com CTA (“responda SIM”).</div>
                <button
                  onClick={sendPromo}
                  disabled={sendState === "sending"}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[linear-gradient(90deg,var(--ab-gold),#5eead4)] px-4 py-2 text-sm font-semibold text-black hover:opacity-95 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {sendState === "sending" ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {sendState !== "idle" ? (
                <div
                  className={[
                    "mt-2 rounded-xl px-3 py-2 text-sm",
                    sendState === "sent"
                      ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-100"
                      : sendState === "failed"
                        ? "border border-red-500/30 bg-red-950/30 text-red-100"
                        : "border border-white/10 bg-white/5 text-white/80",
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

function Skeleton({ className }: { className?: string }) {
  return <div className={["animate-pulse rounded-xl bg-white/5", className].join(" ")} />;
}

function InsightCard(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  lines?: string[];
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const { icon, title, subtitle, lines, actionLabel, onAction, loading } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-1">{icon}</div>
        <div className="min-w-0">
          {loading ? (
            <>
              <Skeleton className="h-6 w-72" />
              <Skeleton className="mt-2 h-4 w-52" />
            </>
          ) : (
            <>
              <div className="text-3xl font-semibold leading-tight text-white">{title}</div>
              <div className="mt-2 text-lg text-white/60">{subtitle}</div>
            </>
          )}
        </div>
      </div>

      {!loading && lines && lines.length ? (
        <div className="mt-4 space-y-2 text-base text-white/85">
          {lines.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ) : null}

      {!loading && actionLabel && onAction ? (
        <div className="mt-5">
          <button
            onClick={onAction}
            className="rounded-xl border border-[var(--ab-gold)]/40 bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm font-semibold text-[var(--ab-gold)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
