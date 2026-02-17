
-- MODEL A (Single-tenant): owner_id = auth.user.id
-- Safe patch: adds owner_id columns, backfills from existing company_id via profiles, and sets simple RLS policies.
begin;

-- 1) Add owner_id columns
alter table if exists public.staff add column if not exists owner_id uuid;
alter table if exists public.customers add column if not exists owner_id uuid;
alter table if exists public.services add column if not exists owner_id uuid;
alter table if exists public.appointments add column if not exists owner_id uuid;
alter table if exists public.staff_working_hours add column if not exists owner_id uuid;

-- Optional tables (only if they exist)
alter table if exists public.categories add column if not exists owner_id uuid;
alter table if exists public.service_categories add column if not exists owner_id uuid;

-- 2) Backfill owner_id using profiles.company_id -> profiles.id (or profiles.user_id)
-- Prefer profiles.id when it matches auth.users.id; fallback to profiles.user_id when present.
update public.staff s
set owner_id = coalesce(p.id, p.user_id)
from public.profiles p
where s.owner_id is null
  and s.company_id = p.company_id;

update public.customers c
set owner_id = coalesce(p.id, p.user_id)
from public.profiles p
where c.owner_id is null
  and c.company_id = p.company_id;

update public.services sv
set owner_id = coalesce(p.id, p.user_id)
from public.profiles p
where sv.owner_id is null
  and sv.company_id = p.company_id;

update public.appointments a
set owner_id = coalesce(p.id, p.user_id)
from public.profiles p
where a.owner_id is null
  and a.company_id = p.company_id;

update public.staff_working_hours w
set owner_id = coalesce(p.id, p.user_id)
from public.profiles p
where w.owner_id is null
  and w.company_id = p.company_id;

-- optional
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='categories') then
    execute $q$
      update public.categories t
      set owner_id = coalesce(p.id, p.user_id)
      from public.profiles p
      where t.owner_id is null and t.company_id = p.company_id
    $q$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='service_categories') then
    execute $q$
      update public.service_categories t
      set owner_id = coalesce(p.id, p.user_id)
      from public.profiles p
      where t.owner_id is null and t.company_id = p.company_id
    $q$;
  end if;
end $$;

-- 3) Indexes
create index if not exists idx_staff_owner_id on public.staff(owner_id);
create index if not exists idx_customers_owner_id on public.customers(owner_id);
create index if not exists idx_services_owner_id on public.services(owner_id);
create index if not exists idx_appointments_owner_id on public.appointments(owner_id);
create index if not exists idx_swh_owner_id on public.staff_working_hours(owner_id);

-- 4) Simple RLS (owner_id = auth.uid())
alter table if exists public.staff enable row level security;
alter table if exists public.customers enable row level security;
alter table if exists public.services enable row level security;
alter table if exists public.appointments enable row level security;
alter table if exists public.staff_working_hours enable row level security;

alter table if exists public.categories enable row level security;
alter table if exists public.service_categories enable row level security;

-- Drop ALL existing policies on those tables (to avoid conflicts)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('staff','customers','services','appointments','staff_working_hours','categories','service_categories')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Create policies
create policy owner_select_staff on public.staff for select using (owner_id = auth.uid());
create policy owner_write_staff  on public.staff for insert with check (owner_id = auth.uid());
create policy owner_update_staff on public.staff for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_delete_staff on public.staff for delete using (owner_id = auth.uid());

create policy owner_select_customers on public.customers for select using (owner_id = auth.uid());
create policy owner_write_customers  on public.customers for insert with check (owner_id = auth.uid());
create policy owner_update_customers on public.customers for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_delete_customers on public.customers for delete using (owner_id = auth.uid());

create policy owner_select_services on public.services for select using (owner_id = auth.uid());
create policy owner_write_services  on public.services for insert with check (owner_id = auth.uid());
create policy owner_update_services on public.services for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_delete_services on public.services for delete using (owner_id = auth.uid());

create policy owner_select_appointments on public.appointments for select using (owner_id = auth.uid());
create policy owner_write_appointments  on public.appointments for insert with check (owner_id = auth.uid());
create policy owner_update_appointments on public.appointments for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_delete_appointments on public.appointments for delete using (owner_id = auth.uid());

create policy owner_select_swh on public.staff_working_hours for select using (owner_id = auth.uid());
create policy owner_write_swh  on public.staff_working_hours for insert with check (owner_id = auth.uid());
create policy owner_update_swh on public.staff_working_hours for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_delete_swh on public.staff_working_hours for delete using (owner_id = auth.uid());

-- optional tables
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='categories') then
    execute 'create policy owner_select_categories on public.categories for select using (owner_id = auth.uid())';
    execute 'create policy owner_write_categories  on public.categories for insert with check (owner_id = auth.uid())';
    execute 'create policy owner_update_categories on public.categories for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())';
    execute 'create policy owner_delete_categories on public.categories for delete using (owner_id = auth.uid())';
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='service_categories') then
    execute 'create policy owner_select_service_categories on public.service_categories for select using (owner_id = auth.uid())';
    execute 'create policy owner_write_service_categories  on public.service_categories for insert with check (owner_id = auth.uid())';
    execute 'create policy owner_update_service_categories on public.service_categories for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())';
    execute 'create policy owner_delete_service_categories on public.service_categories for delete using (owner_id = auth.uid())';
  end if;
end $$;

commit;
