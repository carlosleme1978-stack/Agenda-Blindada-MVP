"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureAccess, type Company } from "@/lib/access";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at?: string;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
  currency?: string | null;
  active: boolean;
  category_id: string | null;
  sort_order: number;
  created_at?: string;
};

type Tab = "services" | "categories";

export default function ServicesClient() {
  const sb = supabaseBrowser;
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("services");

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);

  // form categoria
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catOrder, setCatOrder] = useState<number>(10);

  // form serviço
  const [svcName, setSvcName] = useState("");
  const [svcMins, setSvcMins] = useState<number>(30);
  const [svcPrice, setSvcPrice] = useState<string>("");
  const [svcCategoryId, setSvcCategoryId] = useState<string>("");
  const [svcOrder, setSvcOrder] = useState<number>(10);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--text)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--btn-border)",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: -0.2,
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
  };

  const btnActive: React.CSSProperties = {
    ...btn,
    background: "var(--primary-gradient)",
    color: "rgba(255,255,255,0.94)",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const card: React.CSSProperties = {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 20,
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(10px)",
    padding: 18,
    maxWidth: 980,
    margin: "0 auto",
  };

  function eurToCents(v: string) {
    const t = (v || "").trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  function centsToEur(v: number | null) {
    if (v == null) return "";
    return (v / 100).toFixed(2);
  }

  function formatEur(v: number | null) {
    if (v == null) return "";
    // formato PT: 10,00
    return (v / 100).toFixed(2).replace(".", ",");
  }

  async function loadAll() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await ensureAccess(sb, {
        requireActiveSubscription: true,
        requireOnboardingComplete: false,
      });
      if (!res.ok || !res.company) return;

      setCompany(res.company);

      const [c, s] = await Promise.all([
        sb
          .from("service_categories")
          .select("id,name,description,sort_order,active,created_at")
          .eq("company_id", res.company.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        sb
          .from("services")
          .select("id,name,duration_minutes,price_cents,currency,active,category_id,sort_order,created_at")
          .eq("company_id", res.company.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (c.error) throw c.error;
      if (s.error) throw s.error;

      setCategories((c.data ?? []) as any);
      setServices((s.data ?? []) as any);

      // defaults
      const defMins =
        ((res.company as any).default_service_minutes ??
          (res.company as any).default_duration_minutes ??
          30) as number;

      setSvcMins(defMins);

      // se já tem categoria, preseleciona a primeira
      const firstCat = (c.data ?? [])[0] as any;
      if (firstCat?.id && !svcCategoryId) setSvcCategoryId(firstCat.id);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────
  // CATEGORIAS (CRUD)
  // ─────────────────────────────────────────────
  async function addCategory() {
    setMsg(null);
    if (!company?.id) return;

    const nm = catName.trim();
    if (!nm) return setMsg("Informe o nome da categoria.");

    setSaving(true);
    try {
      const ins = await sb
        .from("service_categories")
        .insert({
          company_id: company.id,
          name: nm,
          description: catDesc.trim() || null,
          sort_order: Number.isFinite(catOrder) ? catOrder : 0,
          active: true,
        })
        .select("id,name,description,sort_order,active,created_at")
        .single();

      if (ins.error) throw ins.error;

      setCategories((p) => [...p, ins.data as any].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      setCatName("");
      setCatDesc("");
      setCatOrder((p) => p + 10);

      // se era vazio, já seleciona para criar serviços
      if (!svcCategoryId) setSvcCategoryId(ins.data.id);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao adicionar categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategoryActive(id: string, active: boolean) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb.from("service_categories").update({ active: !active }).eq("id", id);
      if (error) throw error;
      setCategories((p) => p.map((c) => (c.id === id ? { ...c, active: !active } : c)));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao atualizar categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function updateCategory(id: string, patch: Partial<CategoryRow>) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb
        .from("service_categories")
        .update({
          name: patch.name,
          description: patch.description,
          sort_order: patch.sort_order,
        } as any)
        .eq("id", id);

      if (error) throw error;

      setCategories((p) =>
        p
          .map((c) => (c.id === id ? { ...c, ...patch } : c))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      );
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    setMsg(null);
    setSaving(true);
    try {
      // ⚠️ Ao deletar categoria, services.category_id vira null (on delete set null)
      const { error } = await sb.from("service_categories").delete().eq("id", id);
      if (error) throw error;

      setCategories((p) => p.filter((c) => c.id !== id));
      setServices((p) => p.map((s) => (s.category_id === id ? { ...s, category_id: null } : s)));

      if (svcCategoryId === id) setSvcCategoryId("");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao excluir categoria.");
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────
  // SERVIÇOS (CRUD)
  // ─────────────────────────────────────────────
  async function addService() {
    setMsg(null);
    if (!company?.id) return;

    const nm = svcName.trim();
    if (!nm) return setMsg("Informe o nome do serviço.");
    if (!svcMins || svcMins < 5) return setMsg("Duração inválida.");
    if (!svcCategoryId) return setMsg("Selecione uma categoria (ou crie uma).");

    setSaving(true);
    try {
      const ins = await sb
        .from("services")
        .insert({
          company_id: company.id,
          name: nm,
          duration_minutes: svcMins,
          price_cents: eurToCents(svcPrice),
          currency: "EUR",
          category_id: svcCategoryId,
          sort_order: Number.isFinite(svcOrder) ? svcOrder : 0,
          active: true,
        })
        .select("id,name,duration_minutes,price_cents,currency,active,category_id,sort_order,created_at")
        .single();

      if (ins.error) throw ins.error;

      setServices((p) =>
        [...p, ins.data as any].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      );
      setSvcName("");
      setSvcPrice("");
      setSvcOrder((p) => p + 10);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao adicionar serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleServiceActive(id: string, active: boolean) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb.from("services").update({ active: !active }).eq("id", id);
      if (error) throw error;
      setServices((p) => p.map((s) => (s.id === id ? { ...s, active: !active } : s)));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao atualizar serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function updateService(id: string, patch: Partial<ServiceRow>) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb
        .from("services")
        .update({
          name: patch.name,
          duration_minutes: patch.duration_minutes,
          price_cents: patch.price_cents,
          category_id: patch.category_id,
          sort_order: patch.sort_order,
        } as any)
        .eq("id", id);

      if (error) throw error;

      setServices((p) =>
        p
          .map((s) => (s.id === id ? { ...s, ...patch } : s))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      );
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(id: string) {
    setMsg(null);
    setSaving(true);
    try {
      const { error } = await sb.from("services").delete().eq("id", id);
      if (error) throw error;
      setServices((p) => p.filter((s) => s.id !== id));
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao excluir serviço.");
    } finally {
      setSaving(false);
    }
  }

  const activeCategories = categories.filter((c) => c.active);

  const servicesByCategory = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const s of services) {
      const key = s.category_id ?? "NO_CATEGORY";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // ordena dentro
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      map.set(k, arr);
    }
    return map;
  }, [services]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Serviços</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            O WhatsApp vai mostrar <b>Categoria → Serviço (tempo + preço)</b> apenas para itens <b>ativos</b>.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" style={{ ...btn, textDecoration: "none" }}>
            Voltar
          </Link>
          <Link href="/dashboard/settings" style={{ ...btn, textDecoration: "none" }}>
            Horários
          </Link>
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

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <button type="button" style={tab === "services" ? btnActive : btn} onClick={() => setTab("services")} disabled={saving}>
            Serviços
          </button>
          <button type="button" style={tab === "categories" ? btnActive : btn} onClick={() => setTab("categories")} disabled={saving}>
            Categorias
          </button>
          <button type="button" style={btn} onClick={loadAll} disabled={saving}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div style={{ opacity: 0.7 }}>Carregando…</div>
        ) : tab === "categories" ? (
          <>
            {/* ADD CATEGORY */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Nome da categoria</div>
                <input style={{ ...input, marginTop: 6 }} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Depilação feminina" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Descrição (opcional)</div>
                <input style={{ ...input, marginTop: 6 }} value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Ex: Serviços para mulheres" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Ordem</div>
                <input style={{ ...input, marginTop: 6 }} type="number" step={1} value={catOrder} onChange={(e) => setCatOrder(parseInt(e.target.value || "0", 10))} />
              </div>

              <button disabled={saving} style={btn} onClick={addCategory} type="button">
                {saving ? "…" : "Adicionar"}
              </button>
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "grid", gap: 10 }}>
              {categories.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Nenhuma categoria cadastrada.</div>
              ) : (
                categories.map((c) => (
                  <CategoryRowItem
                    key={c.id}
                    c={c}
                    saving={saving}
                    onToggle={() => toggleCategoryActive(c.id, c.active)}
                    onSave={(patch) => updateCategory(c.id, patch)}
                    onDelete={() => deleteCategory(c.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* ADD SERVICE */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.3fr 0.7fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Nome</div>
                <input style={{ ...input, marginTop: 6 }} value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Ex: Axila" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Duração (min)</div>
                <input style={{ ...input, marginTop: 6 }} type="number" min={5} step={5} value={svcMins} onChange={(e) => setSvcMins(parseInt(e.target.value || "30", 10))} />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Preço (€)</div>
                <input style={{ ...input, marginTop: 6 }} value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} placeholder="Ex: 10,00" />
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Categoria</div>
                <select
                  style={{ ...input, marginTop: 6 }}
                  value={svcCategoryId}
                  onChange={(e) => setSvcCategoryId(e.target.value)}
                  disabled={activeCategories.length === 0}
                >
                  <option value="">{activeCategories.length === 0 ? "Crie uma categoria primeiro" : "Selecione..."}</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Ordem</div>
                <input style={{ ...input, marginTop: 6 }} type="number" step={1} value={svcOrder} onChange={(e) => setSvcOrder(parseInt(e.target.value || "0", 10))} />
              </div>

              <button disabled={saving} style={btn} onClick={addService} type="button">
                {saving ? "…" : "Adicionar"}
              </button>
            </div>

            <div style={{ height: 14 }} />

            {/* PREVIEW POR CATEGORIA */}
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Pré-visualização (como ficará organizado)</div>

            <div style={{ display: "grid", gap: 12 }}>
              {categories.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Crie categorias para organizar os serviços.</div>
              ) : (
                categories
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((cat) => {
                    const list = servicesByCategory.get(cat.id) || [];
                    return (
                      <div
                        key={cat.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          border: "1px solid var(--card-border)",
                          background: "var(--card-bg-strong)",
                          opacity: cat.active ? 1 : 0.55,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 950 }}>{cat.name}</div>
                            {cat.description ? <div style={{ fontSize: 12, opacity: 0.75 }}>{cat.description}</div> : null}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {cat.active ? "Ativa" : "Inativa"} · Ordem {cat.sort_order}
                          </div>
                        </div>

                        <div style={{ height: 10 }} />

                        {list.length === 0 ? (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Sem serviços nesta categoria.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {list.map((s) => (
                              <ServiceRowItem
                                key={s.id}
                                s={s}
                                saving={saving}
                                categories={categories}
                                onToggle={() => toggleServiceActive(s.id, s.active)}
                                onSave={(patch) => updateService(s.id, patch)}
                                onDelete={() => deleteService(s.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}

              {/* Serviços sem categoria (se existirem) */}
              {(servicesByCategory.get("NO_CATEGORY") || []).length > 0 && (
                <div style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(185, 28, 28, 0.18)", background: "rgba(185, 28, 28, 0.06)" }}>
                  <div style={{ fontWeight: 950, color: "#7f1d1d" }}>Serviços sem categoria</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    Esses serviços não vão aparecer no WhatsApp por categoria. Edite e selecione uma categoria.
                  </div>
                  <div style={{ height: 10 }} />
                  <div style={{ display: "grid", gap: 10 }}>
                    {(servicesByCategory.get("NO_CATEGORY") || []).map((s) => (
                      <ServiceRowItem
                        key={s.id}
                        s={s}
                        saving={saving}
                        categories={categories}
                        onToggle={() => toggleServiceActive(s.id, s.active)}
                        onSave={(patch) => updateService(s.id, patch)}
                        onDelete={() => deleteService(s.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ height: 10 }} />
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              No WhatsApp, vamos listar <b>somente categorias ativas</b> e, dentro delas, <b>somente serviços ativos</b>, ordenados pela coluna <b>ordem</b>.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryRowItem({
  c,
  saving,
  onToggle,
  onSave,
  onDelete,
}: {
  c: CategoryRow;
  saving: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<CategoryRow>) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description ?? "");
  const [order, setOrder] = useState<number>(c.sort_order ?? 0);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--text)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--btn-border)",
    cursor: "pointer",
    fontWeight: 900,
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
  };

  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 16,
        border: "1px solid var(--card-border)",
        background: "var(--card-bg-strong)",
        opacity: c.active ? 1 : 0.55,
      }}
    >
      {!edit ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 950 }}>{c.name}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {c.description ? `${c.description} · ` : ""}Ordem {c.sort_order}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn} onClick={() => setEdit(true)} disabled={saving} type="button">
              Editar
            </button>
            <button style={btn} onClick={onToggle} disabled={saving} type="button">
              {c.active ? "Desativar" : "Ativar"}
            </button>
            <button
              style={{ ...btn, border: "1px solid rgba(239, 68, 68, 0.35)" }}
              onClick={() => {
                const ok = confirm("Tem certeza que deseja excluir esta categoria? Os serviços ficarão sem categoria.");
                if (ok) onDelete();
              }}
              disabled={saving}
              type="button"
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Nome</div>
            <input style={{ ...input, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Descrição</div>
            <input style={{ ...input, marginTop: 6 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Ordem</div>
            <input style={{ ...input, marginTop: 6 }} type="number" value={order} onChange={(e) => setOrder(parseInt(e.target.value || "0", 10))} />
          </div>

          <button
            style={btn}
            disabled={saving}
            onClick={() => {
              onSave({ name: name.trim(), description: desc.trim() || null, sort_order: Number.isFinite(order) ? order : 0 });
              setEdit(false);
            }}
            type="button"
          >
            Salvar
          </button>

          <button style={btn} disabled={saving} onClick={() => setEdit(false)} type="button">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function ServiceRowItem({
  s,
  saving,
  categories,
  onToggle,
  onSave,
  onDelete,
}: {
  s: ServiceRow;
  saving: boolean;
  categories: CategoryRow[];
  onToggle: () => void;
  onSave: (patch: Partial<ServiceRow>) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const [mins, setMins] = useState<number>(s.duration_minutes);
  const [price, setPrice] = useState<string>(s.price_cents != null ? (s.price_cents / 100).toFixed(2).replace(".", ",") : "");
  const [categoryId, setCategoryId] = useState<string>(s.category_id ?? "");
  const [order, setOrder] = useState<number>(s.sort_order ?? 0);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--text)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--btn-border)",
    cursor: "pointer",
    fontWeight: 900,
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
  };

  function eurToCents(v: string) {
    const t = (v || "").trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  const priceLabel = s.price_cents != null ? `· €${(s.price_cents / 100).toFixed(2)}` : "";

  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 16,
        border: "1px solid var(--card-border)",
        background: "var(--card-bg-strong)",
        opacity: s.active ? 1 : 0.55,
      }}
    >
      {!edit ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 950 }}>{s.name}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {s.duration_minutes} min {priceLabel} · Ordem {s.sort_order}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn} onClick={() => setEdit(true)} disabled={saving} type="button">
              Editar
            </button>
            <button style={btn} onClick={onToggle} disabled={saving} type="button">
              {s.active ? "Desativar" : "Ativar"}
            </button>
            <button
              style={{ ...btn, border: "1px solid rgba(239, 68, 68, 0.35)" }}
              onClick={() => {
                const ok = confirm("Excluir este serviço?");
                if (ok) onDelete();
              }}
              disabled={saving}
              type="button"
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr 0.8fr auto auto", gap: 10, alignItems: "end" }}>
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
            <input style={{ ...input, marginTop: 6 }} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex: 10,00" />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Categoria</div>
            <select style={{ ...input, marginTop: 6 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">(Sem categoria)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Ordem</div>
            <input style={{ ...input, marginTop: 6 }} type="number" value={order} onChange={(e) => setOrder(parseInt(e.target.value || "0", 10))} />
          </div>

          <button
            style={btn}
            disabled={saving}
            onClick={() => {
              onSave({
                name: name.trim(),
                duration_minutes: mins,
                price_cents: eurToCents(price),
                category_id: categoryId || null,
                sort_order: Number.isFinite(order) ? order : 0,
              });
              setEdit(false);
            }}
            type="button"
          >
            Salvar
          </button>

          <button style={btn} disabled={saving} onClick={() => setEdit(false)} type="button">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
