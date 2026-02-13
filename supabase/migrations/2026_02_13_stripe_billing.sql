-- Agenda Blindada SaaS - Stripe billing core
-- Adds Stripe customer/subscription fields + webhook idempotency.

create table if not exists public.stripe_events (
  id text primary key,
  type text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No RLS policies: service-role only.

alter table public.companies
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists stripe_cancel_at_period_end boolean default false;

create index if not exists companies_stripe_subscription_id_idx on public.companies (stripe_subscription_id);
create index if not exists companies_stripe_customer_id_idx on public.companies (stripe_customer_id);
