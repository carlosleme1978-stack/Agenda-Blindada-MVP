-- Agenda Blindada — MODELO SOLO (1 dono, sem staff)
-- ✅ Objetivo:
-- 1) Criar/garantir owner_working_hours (horário do dono por dia)
-- 2) Remover tabelas/views de staff (opcional/seguro)
-- 3) Ajustes para evitar enum PENDING quebrando o app

begin;

-- ─────────────────────────────────────────────
-- 0) Drop de VIEWS relacionadas a staff (seguro)
-- ─────────────────────────────────────────────

drop view if exists public.v_staff_financial_summary cascade;
drop view if exists public.v_staff_occupancy_28d cascade;
drop view if exists public.v_staff_financial_28d cascade;
drop view if exists public.v_staff_financial_7d cascade;

-- (Se existirem outras com prefixo v_staff_, apague manualmente pelo UI)

-- ─────────────────────────────────────────────
-- 1) Tabelas de staff (opcional)
-- ─────────────────────────────────────────────
-- ⚠️ Se você quer remover TOTALMENTE staff, pode dropar.
-- Se preferir manter por segurança, comente estas linhas.

drop table if exists public.staff_working_hours cascade;
drop table if exists public.staff cascade;

-- ─────────────────────────────────────────────
-- 2) Tabela do horário do dono (por dia)
-- ─────────────────────────────────────────────

create table if not exists public.owner_working_hours (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  day_of_week int not null, -- 1=Seg ... 7=Dom
  start_time time without time zone not null default '09:00',
  end_time time without time zone not null default '18:00',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, day_of_week)
);

-- garante colunas (se a tabela já existia com menos colunas)
alter table public.owner_working_hours add column if not exists owner_id uuid;
alter table public.owner_working_hours add column if not exists day_of_week int;
alter table public.owner_working_hours add column if not exists start_time time without time zone;
alter table public.owner_working_hours add column if not exists end_time time without time zone;
alter table public.owner_working_hours add column if not exists active boolean;
alter table public.owner_working_hours add column if not exists created_at timestamptz;

-- ─────────────────────────────────────────────
-- 3) Seed automático para o primeiro owner (sem placeholder)
-- ─────────────────────────────────────────────
-- Usa o primeiro profile encontrado como dono.

do $$
declare
  owner uuid;
  d int;
begin
  select id into owner from public.profiles order by created_at asc nulls last limit 1;
  if owner is null then
    raise notice 'Nenhum profile encontrado: pulei o seed.';
    return;
  end if;

  for d in 1..7 loop
    insert into public.owner_working_hours(owner_id, day_of_week, start_time, end_time, active)
    values (owner, d, '09:00', '18:00', case when d=7 then false else true end)
    on conflict (owner_id, day_of_week) do nothing;
  end loop;
end$$;

-- ─────────────────────────────────────────────
-- 4) RLS (recomendado)
-- ─────────────────────────────────────────────
alter table public.owner_working_hours enable row level security;

drop policy if exists "owner_working_hours_select" on public.owner_working_hours;
drop policy if exists "owner_working_hours_write" on public.owner_working_hours;

create policy "owner_working_hours_select" on public.owner_working_hours
for select using (auth.uid() = owner_id);

create policy "owner_working_hours_write" on public.owner_working_hours
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─────────────────────────────────────────────
-- 5) Status_v2 como TEXT (para não quebrar por enum)
-- ─────────────────────────────────────────────
-- Se status_v2 já for TEXT, ok.
-- Se for enum, comente este bloco e eu te passo o patch específico.

do $$
begin
  begin
    alter table public.appointments alter column status_v2 type text using status_v2::text;
  exception when others then
    -- ignora se não existir ou já for text
    null;
  end;
end$$;

commit;
