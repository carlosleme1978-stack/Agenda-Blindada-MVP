-- Agenda Blindada SaaS - access codes (closed signup)
-- Run in Supabase SQL Editor. Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'ACTIVE', -- ACTIVE | USED | EXPIRED
  company_name text,
  plan text default 'basic',
  staff_limit int default 1,
  expires_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_codes enable row level security;

-- No public policies: only service-role (backend) should read/write.
