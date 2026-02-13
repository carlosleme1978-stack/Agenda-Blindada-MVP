create extension if not exists "uuid-ossp";

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  timezone text not null default 'Europe/Lisbon',
  whatsapp_phone_number_id text null,
  -- SaaS fields (used by the app)
  plan text not null default 'basic',
  staff_limit int not null default 1,
  sub_basic_status text not null default 'inactive',
  sub_pro_status text not null default 'inactive',
  -- Onboarding fields (V1)
  onboarding_complete boolean not null default false,
  default_duration_minutes int not null default 30,
  created_at timestamptz not null default now()
);

-- NOTE: In this app, profiles.id == auth.users.id
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
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
as $$ select company_id from public.profiles where id = auth.uid(); $$;

create policy "company_select" on public.companies
for select using (id = public.current_company_id());

-- Allow the owner to update minimal company fields (onboarding, name, defaults)
create policy "company_update" on public.companies
for update using (id = public.current_company_id()) with check (id = public.current_company_id());

create policy "profiles_self" on public.profiles
for select using (id = auth.uid());

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

-- =========================
-- V2: Services + Staff (needed by the current app UI)
-- =========================

create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 30,
  price_cents int null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text null,
  role text not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Optional columns used across the dashboard/new booking flows
alter table public.appointments add column if not exists service_id uuid null references public.services(id) on delete set null;
alter table public.appointments add column if not exists staff_id uuid null references public.staff(id) on delete set null;
alter table public.appointments add column if not exists customer_name_snapshot text null;

alter table public.services enable row level security;
alter table public.staff enable row level security;

create policy if not exists "services_rw" on public.services
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy if not exists "staff_rw" on public.staff
for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- ------------------------------
-- Stripe billing
-- ------------------------------
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

alter table public.companies
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists stripe_cancel_at_period_end boolean default false;

create index if not exists companies_stripe_subscription_id_idx on public.companies (stripe_subscription_id);
create index if not exists companies_stripe_customer_id_idx on public.companies (stripe_customer_id);
