"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function InsightsClient() {
  // In this codebase, supabaseBrowser is already a client instance (not a function).
  const supabase = supabaseBrowser;

  const [loading, setLoading] = useState(true);
  const [weakDay, setWeakDay] = useState("—");
  const [weakPercent, setWeakPercent] = useState("—");
  const [noShowHours, setNoShowHours] = useState(0);
  const [noShowValue, setNoShowValue] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("appointments")
        .select("start_time,status_v2,total_price_snapshot,service_duration_minutes_snapshot")
        .gte("start_time", since.toISOString());

      if (error) {
        console.error(error);
      }

      const list = data ?? [];

      const byDow = new Array(7).fill(0);
      let noShowLoss = 0;
      let noShowMinutes = 0;

      list.forEach((a: any) => {
        const d = new Date(a.start_time);
        byDow[d.getDay()]++;

        if (String(a.status_v2).toUpperCase() === "NO_SHOW") {
          noShowLoss += Number(a.total_price_snapshot ?? 0);
          noShowMinutes += Number(a.service_duration_minutes_snapshot ?? 0);
        }
      });

      const avg = byDow.reduce((s, v) => s + v, 0) / 7;
      let min = Infinity;
      let minIndex = 0;

      byDow.forEach((v, i) => {
        if (v < min) {
          min = v;
          minIndex = i;
        }
      });

      const percent = avg > 0 ? Math.round(((min - avg) / avg) * 100) : 0;

      const names = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];

      if (!alive) return;
      setWeakDay(names[minIndex]);
      setWeakPercent(`${percent}% menos que a média semanal`);
      setNoShowHours(Math.round(noShowMinutes / 60));
      setNoShowValue(noShowLoss);

      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <div className="text-sm text-white/60">Dashboard</div>
        <h1 className="text-5xl font-semibold text-white">Insights</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* DIA MAIS FRACO */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-3xl font-semibold text-white">
            {loading ? "Carregando..." : `${weakDay} é seu dia mais fraco`}
          </div>
          <div className="mt-2 text-lg text-white/60">{loading ? "" : weakPercent}</div>

          <button className="mt-5 rounded-xl border border-yellow-500/40 px-4 py-2 text-sm font-semibold text-yellow-400 hover:bg-white/5">
            Criar promoção
          </button>
        </div>

        {/* HORÁRIO FRACO */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-3xl font-semibold text-white">Horário depois das 16h30 está deficitário</div>
          <div className="mt-2 text-lg text-white/60">Baseado nas últimas 4 semanas</div>
        </div>

        {/* CLIENTES INATIVOS */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-3xl font-semibold text-white">Clientes inativos</div>
          <div className="mt-2 text-lg text-white/60">não retornam há mais de 30 dias</div>

          <button className="mt-5 rounded-xl border border-yellow-500/40 px-4 py-2 text-sm font-semibold text-yellow-400 hover:bg-white/5">
            Ver Clientes Inativos
          </button>
        </div>

        {/* NO SHOW */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-3xl font-semibold text-white">{noShowHours} horas perdidas este mês</div>
          <div className="mt-2 text-lg text-white/60">€ {noShowValue.toFixed(2)} em no-shows</div>
        </div>
      </div>
    </div>
  );
}
