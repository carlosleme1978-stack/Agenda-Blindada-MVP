-- Agenda Blindada - SQL Fixes (multi-tenant + settings columns + billing compatibility)
-- Run this in Supabase SQL editor (safe: uses IF NOT EXISTS).

-- 1) Billing compatibility columns used by ensureAccess
alter table public.companies
add column if not exists sub_basic_status text default 'inactive',
add column if not exists sub_pro_status text default 'inactive';

-- 2) Support override (production-safe bypass for client issues)
alter table public.companies
add column if not exists support_override_until timestamptz,
add column if not exists support_override_reason text;

-- 3) Staff default (for multi-staff MVP)
alter table public.companies
add column if not exists default_staff_id uuid;

-- (FK is optional if you already added it)
alter table public.companies
drop constraint if exists companies_default_staff_fk;
alter table public.companies
add constraint companies_default_staff_fk
foreign key (default_staff_id) references public.staff(id)
deferrable initially deferred;

-- 4) Settings (Horários) columns used by SettingsClient.tsx
alter table public.companies
add column if not exists slot_step_minutes integer,
add column if not exists work_start text,
add column if not exists work_end text,
add column if not exists work_days integer[];

-- Defaults
update public.companies
set slot_step_minutes = coalesce(slot_step_minutes, 15),
    work_start = coalesce(work_start, '09:00'),
    work_end = coalesce(work_end, '18:00'),
    work_days = coalesce(work_days, array[1,2,3,4,5]);

alter table public.companies
alter column slot_step_minutes set default 15,
alter column work_start set default '09:00',
alter column work_end set default '18:00',
alter column work_days set default array[1,2,3,4,5];

-- Not null (recommended)
alter table public.companies
alter column slot_step_minutes set not null,
alter column work_start set not null,
alter column work_end set not null,
alter column work_days set not null;

-- 5) Ensure RLS on staff (recommended for multi-tenant safety)
alter table public.staff enable row level security;

drop policy if exists staff_rw_own on public.staff;
create policy staff_rw_own
on public.staff
for all
to authenticated
using (company_id = auth_company_id())
with check (company_id = auth_company_id());

-- 6) Staff working hours (multi-staff scheduling)
create table if not exists public.staff_working_hours (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time without time zone not null,
  end_time time without time zone not null,
  created_at timestamptz not null default now()
);

alter table public.staff_working_hours enable row level security;

drop policy if exists staff_working_hours_rw_own on public.staff_working_hours;
create policy staff_working_hours_rw_own
on public.staff_working_hours
for all
to authenticated
using (company_id = auth_company_id())
with check (company_id = auth_company_id());

create index if not exists staff_working_hours_company_staff_day_idx
  on public.staff_working_hours(company_id, staff_id, day_of_week);

-- 7) Reload schema cache for PostgREST after running alters
notify pgrst, 'reload schema';
