-- appointment_services (extensão segura para múltiplos serviços por marcação)

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name_snapshot text null,
  duration_minutes_snapshot int null,
  price_cents_snapshot int null,
  currency_snapshot text null,
  created_at timestamptz not null default now()
);

create index if not exists appointment_services_appointment_id_idx on public.appointment_services(appointment_id);
create index if not exists appointment_services_service_id_idx on public.appointment_services(service_id);

alter table public.appointment_services enable row level security;

-- Owner/staff da mesma empresa podem ler via join com appointments.company_id
create policy if not exists "appointment_services_select_company"
on public.appointment_services
for select
using (
  exists (
    select 1
    from public.appointments a
    join public.profiles p on p.id = auth.uid()
    where a.id = appointment_services.appointment_id
      and a.company_id = p.company_id
  )
);

-- Somente o backend (service role) insere/atualiza; o app não precisa inserir direto pelo cliente.
