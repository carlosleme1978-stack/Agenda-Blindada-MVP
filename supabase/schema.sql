create extension if not exists "uuid-ossp";

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  timezone text not null default 'Europe/Lisbon',
  whatsapp_phone_number_id text null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone text not null,
  name text null,
  consent_whatsapp boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, phone)
);

create type public.appointment_status as enum ('BOOKED','CONFIRMED','CANCELLED','ATTENDED');

create table if not exists public.appointments (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.appointment_status not null default 'BOOKED',
  created_at timestamptz not null default now()
);

create type public.waitlist_status as enum ('ACTIVE','OFFERED','ACCEPTED','EXPIRED','CANCELLED');

create table if not exists public.waitlist_entries (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  preferred_date date not null,
  preferred_window text not null default 'qualquer',
  priority int not null default 0,
  status public.waitlist_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist_offers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  waitlist_entry_id uuid not null references public.waitlist_entries(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(appointment_id)
);

create table if not exists public.message_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  direction text not null,
  customer_phone text not null,
  body text not null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_offers enable row level security;
alter table public.message_log enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql stable
as $$ select company_id from public.profiles where user_id = auth.uid(); $$;

create policy "company_select" on public.companies
for select using (id = public.current_company_id());

create policy "profiles_self" on public.profiles
for select using (user_id = auth.uid());

create policy "customers_rw" on public.customers
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy "appointments_rw" on public.appointments
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy "waitlist_rw" on public.waitlist_entries
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy "offers_rw" on public.waitlist_offers
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy "msglog_rw" on public.message_log
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create or replace view public.v_appointments_dashboard as
select a.id,a.company_id,a.start_time,a.end_time,a.status,c.phone as customer_phone,c.name as customer_name
from public.appointments a join public.customers c on c.id=a.customer_id;

grant select on public.v_appointments_dashboard to anon, authenticated;
