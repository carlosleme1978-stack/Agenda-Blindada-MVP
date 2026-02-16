-- ==========================================
-- Agenda Blindada - Staff Working Hours
-- ==========================================

create table if not exists public.staff_working_hours (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week int not null check (day_of_week >= 0 and day_of_week <= 6), -- 0=Sun
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_staff_hours_unique
  on public.staff_working_hours (staff_id, day_of_week);

create index if not exists idx_staff_hours_company_staff
  on public.staff_working_hours (company_id, staff_id);

alter table public.staff_working_hours enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='staff_working_hours' and policyname='staff_hours_select_company'
  ) then
    execute $p$
      create policy staff_hours_select_company
      on public.staff_working_hours
      for select
      using (company_id = (select company_id from public.profiles where id = auth.uid()))
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='staff_working_hours' and policyname='staff_hours_write_owner'
  ) then
    execute $p$
      create policy staff_hours_write_owner
      on public.staff_working_hours
      for all
      using (
        company_id = (select company_id from public.profiles where id = auth.uid())
        and (select role from public.profiles where id = auth.uid()) = 'owner'
      )
      with check (
        company_id = (select company_id from public.profiles where id = auth.uid())
        and (select role from public.profiles where id = auth.uid()) = 'owner'
      )
    $p$;
  end if;
end $$;

-- Seed default hours (Mon-Fri 09:00-18:00) for existing staff without hours
insert into public.staff_working_hours(company_id, staff_id, day_of_week, start_time, end_time, active)
select s.company_id, s.id, d.dow, time '09:00', time '18:00', true
from public.staff s
cross join (values (1),(2),(3),(4),(5)) as d(dow)
where s.active = true
and not exists (select 1 from public.staff_working_hours h where h.staff_id = s.id and h.day_of_week = d.dow)
;
