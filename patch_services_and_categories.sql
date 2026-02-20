-- Agenda Blindada - Patch para liberar CRUD de Categorias e Serviços
-- Rode no Supabase SQL Editor (como postgres)

-- 1) TABELA service_categories (campos esperados pelo app)
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.service_categories
  add column if not exists description text,
  add column if not exists sort_order int not null default 10,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

create index if not exists service_categories_company_id_idx on public.service_categories(company_id);

-- 2) TABELA services (campos esperados pelo app)
alter table public.services
  add column if not exists active boolean not null default true,
  add column if not exists category_id uuid null,
  add column if not exists sort_order int not null default 10;

-- FK para categorias
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_category_id_fkey'
  ) then
    alter table public.services
      add constraint services_category_id_fkey
      foreign key (category_id)
      references public.service_categories(id)
      on delete set null;
  end if;
end $$;

create index if not exists services_company_id_idx on public.services(company_id);
create index if not exists services_category_id_idx on public.services(category_id);

-- 3) RLS POLICIES (permitir usuário autenticado mexer só na própria empresa)
-- Requer: public.profiles(id = auth.uid()) contendo company_id

alter table public.service_categories enable row level security;
alter table public.services enable row level security;

-- drop antigas
drop policy if exists sc_select on public.service_categories;
drop policy if exists sc_insert on public.service_categories;
drop policy if exists sc_update on public.service_categories;
drop policy if exists sc_delete on public.service_categories;

drop policy if exists svc_select on public.services;
drop policy if exists svc_insert on public.services;
drop policy if exists svc_update on public.services;
drop policy if exists svc_delete on public.services;

-- service_categories
create policy sc_select on public.service_categories
for select to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy sc_insert on public.service_categories
for insert to authenticated
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy sc_update on public.service_categories
for update to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()))
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy sc_delete on public.service_categories
for delete to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- services
create policy svc_select on public.services
for select to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy svc_insert on public.services
for insert to authenticated
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy svc_update on public.services
for update to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()))
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy svc_delete on public.services
for delete to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- 4) DICAS: services.duration_minutes é NOT NULL, então o app sempre manda.
-- price_cents e currency são opcionais, mas o app manda currency='EUR' por padrão.
