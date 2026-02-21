-- Agenda Blindada (SOLO) - Setup SQL
-- Roda no Supabase SQL Editor.
-- Não precisa substituir UUID. Tudo usa auth.uid().

-- 1) Colunas SOLO nas tabelas (compatível com teu schema atual)
alter table if exists public.customers
  add column if not exists owner_id uuid;

alter table if exists public.appointments
  add column if not exists owner_id uuid;

-- 2) Working hours do dono
create table if not exists public.owner_working_hours (
  id bigserial primary key,
  owner_id uuid not null,
  day_of_week int not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint owner_working_hours_day_of_week_check check (day_of_week between 0 and 6)
);

-- Unique para ON CONFLICT
create unique index if not exists owner_working_hours_owner_day_uniq
  on public.owner_working_hours(owner_id, day_of_week);

-- 3) Defaults + backfill (se já tens dados)
update public.customers set owner_id = auth.uid() where owner_id is null;
update public.appointments set owner_id = auth.uid() where owner_id is null;

-- 4) Seed de horários padrão (Seg-Sex 09-18, Sáb 10-14, Dom off)
do $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'Faça login no Supabase (SQL editor com auth) ou rode via Dashboard -> SQL com user autenticado.';
  end if;

  -- 0=Dom ... 6=Sáb
  insert into public.owner_working_hours(owner_id, day_of_week, start_time, end_time, active)
  values
    (owner, 1, '09:00', '18:00', true),
    (owner, 2, '09:00', '18:00', true),
    (owner, 3, '09:00', '18:00', true),
    (owner, 4, '09:00', '18:00', true),
    (owner, 5, '09:00', '18:00', true),
    (owner, 6, '10:00', '14:00', true),
    (owner, 0, '09:00', '18:00', false)
  on conflict (owner_id, day_of_week) do nothing;
end $$;

-- 5) RLS (recomendado)

-- =========================
-- CUSTOMERS
-- =========================
alter table public.customers enable row level security;

drop policy if exists "customers_owner_read" on public.customers;
drop policy if exists "customers_owner_write" on public.customers;
drop policy if exists "customers_owner_update" on public.customers;

create policy "customers_owner_read"
  on public.customers
  for select
  using (owner_id = auth.uid());

create policy "customers_owner_write"
  on public.customers
  for insert
  with check (owner_id = auth.uid());

create policy "customers_owner_update"
  on public.customers
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- =========================
-- APPOINTMENTS
-- =========================
alter table public.appointments enable row level security;

drop policy if exists "appointments_owner_read" on public.appointments;
drop policy if exists "appointments_owner_write" on public.appointments;
drop policy if exists "appointments_owner_update" on public.appointments;

create policy "appointments_owner_read"
  on public.appointments
  for select
  using (owner_id = auth.uid());

create policy "appointments_owner_write"
  on public.appointments
  for insert
  with check (owner_id = auth.uid());

create policy "appointments_owner_update"
  on public.appointments
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- =========================
-- OWNER WORKING HOURS
-- =========================
alter table public.owner_working_hours enable row level security;

drop policy if exists "owner_hours_owner_all" on public.owner_working_hours;

create policy "owner_hours_owner_all"
  on public.owner_working_hours
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());