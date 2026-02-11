-- Agenda Blindada SaaS - patch 2026-02-10
-- 1) Staff isolation (RLS) so staff users only see their own agenda
-- 2) Prevent schedule overlap per staff
--
-- ✅ Run this in Supabase SQL Editor (in order). Safe to run multiple times.

-- ----------
-- Columns
-- ----------
alter table public.profiles
  add column if not exists staff_id uuid null references public.staff(id) on delete set null;

-- ----------
-- Helpers
-- ----------
create or replace function public.current_role()
returns text
language sql stable
as $$
  select coalesce(role, 'owner') from public.profiles where id = auth.uid();
$$;

create or replace function public.current_staff_id()
returns uuid
language sql stable
as $$
  select staff_id from public.profiles where id = auth.uid();
$$;

-- ----------
-- Policies: drop old broad policies (company-wide) and replace with owner vs staff
-- ----------

do $$ begin
  -- customers
  if exists (select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='customers_rw') then
    execute 'drop policy "customers_rw" on public.customers';
  end if;
  -- appointments
  if exists (select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='appointments_rw') then
    execute 'drop policy "appointments_rw" on public.appointments';
  end if;
  -- staff
  if exists (select 1 from pg_policies where schemaname='public' and tablename='staff' and policyname='staff_rw') then
    execute 'drop policy "staff_rw" on public.staff';
  end if;
end $$;

-- STAFF table
create policy if not exists staff_owner_all on public.staff
for all
using (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
)
with check (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
);

create policy if not exists staff_self_read on public.staff
for select
using (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
  and id = public.current_staff_id()
);

-- APPOINTMENTS table
create policy if not exists appointments_owner_all on public.appointments
for all
using (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
)
with check (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
);

create policy if not exists appointments_staff_readwrite_own on public.appointments
for all
using (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
  and staff_id = public.current_staff_id()
)
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
  and staff_id = public.current_staff_id()
);

-- CUSTOMERS table
-- Owner/admin/manager: all customers from their company
create policy if not exists customers_owner_all on public.customers
for all
using (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
)
with check (
  company_id = public.current_company_id()
  and public.current_role() in ('owner','admin','manager')
);

-- Staff: can read customers that have appointments assigned to their staff_id
create policy if not exists customers_staff_read_assigned on public.customers
for select
using (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
  and exists (
    select 1 from public.appointments a
    where a.company_id = customers.company_id
      and a.customer_id = customers.id
      and a.staff_id = public.current_staff_id()
  )
);

-- Staff: can upsert customers only for their company (needed for new booking flow)
create policy if not exists customers_staff_insert_update on public.customers
for insert
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
);

create policy if not exists customers_staff_update_limited on public.customers
for update
using (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
)
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'staff'
);

-- ----------
-- Overlap protection (per staff)
-- ----------
create extension if not exists btree_gist;

-- Backfill staff_id for existing appointments (if any) before enforcing NOT NULL.
-- Uses the earliest created active staff of the same company.
update public.appointments a
set staff_id = s.id
from lateral (
  select id
  from public.staff
  where company_id = a.company_id and active = true
  order by created_at asc
  limit 1
) s
where a.staff_id is null;

-- Ensure staff_id is required for overlap constraint
alter table public.appointments alter column staff_id set not null;

-- Prevent overlapping active appointments per staff
-- Note: cancelled appointments don't block new ones.
do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_no_overlap_per_staff'
  ) then
    execute $$
      alter table public.appointments
      add constraint appointments_no_overlap_per_staff
      exclude using gist (
        company_id with =,
        staff_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      ) where (status <> 'CANCELLED');
    $$;
  end if;
end $$;
