-- ==========================================
-- Agenda Blindada - Stripe Webhook Hardening (Safe)
-- - Mantém idempotência usando stripe_events.id (evt_*)
-- - Adiciona company_id para rastreio (opcional)
-- ==========================================

alter table public.stripe_events
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_stripe_events_company_created
  on public.stripe_events (company_id, created_at);
