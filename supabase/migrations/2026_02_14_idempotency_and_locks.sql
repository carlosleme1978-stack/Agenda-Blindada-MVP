-- ==========================================
-- Agenda Blindada - Idempotência & Locks (Safe)
-- - Evita envio duplicado (reminder/thanks/rebook)
-- - Evita concorrência (2 crons rodando ao mesmo tempo)
-- ==========================================

create extension if not exists "uuid-ossp";

-- 1) Idempotência de mensagens por appointment
create table if not exists public.message_deliveries (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  type text not null, -- 'reminder_24h' | 'thanks' | 'rebook'
  created_at timestamptz not null default now()
);

create unique index if not exists ux_message_deliveries_appointment_type
  on public.message_deliveries (appointment_id, type);

create index if not exists idx_message_deliveries_company_created
  on public.message_deliveries (company_id, created_at);

alter table public.message_deliveries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='message_deliveries' and policyname='message_deliveries_select_company'
  ) then
    execute $p$
      create policy message_deliveries_select_company
      on public.message_deliveries
      for select
      using (company_id = (select company_id from public.profiles where id = auth.uid()))
    $p$;
  end if;
end $$;

-- 2) Locks de sistema (crons)
create table if not exists public.system_locks (
  key text primary key,
  locked_at timestamptz not null default now()
);

alter table public.system_locks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='system_locks' and policyname='system_locks_select_none'
  ) then
    execute $p$
      create policy system_locks_select_none
      on public.system_locks
      for select
      using (false)
    $p$;
  end if;
end $$;

-- 3) RPCs para lock (executadas pelo SERVICE_ROLE)
create or replace function public.try_acquire_lock(p_key text, p_ttl_seconds int default 900)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_at timestamptz;
begin
  insert into public.system_locks(key, locked_at)
  values (p_key, now())
  on conflict (key) do nothing;

  if found then
    return true;
  end if;

  select locked_at into v_locked_at from public.system_locks where key = p_key;

  if v_locked_at is null then
    return false;
  end if;

  if v_locked_at < now() - make_interval(secs => p_ttl_seconds) then
    update public.system_locks
      set locked_at = now()
    where key = p_key
      and locked_at = v_locked_at;

    if found then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.release_lock(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.system_locks where key = p_key;
$$;

revoke all on function public.try_acquire_lock(text, int) from public;
revoke all on function public.release_lock(text) from public;
grant execute on function public.try_acquire_lock(text, int) to service_role;
grant execute on function public.release_lock(text) to service_role;
