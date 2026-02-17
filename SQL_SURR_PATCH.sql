-- Agenda Blindada · SURR Patch (SAFE)
-- Objetivo: alinhar status_v2, snapshots, impedir duplicação de slots e criar views de métricas para Dashboard/Staff.

begin;

-- 0) Extensões (necessário para exclusão com uuid + range)
create extension if not exists btree_gist;

-- 1) Colunas que o app usa (safe: add if missing)
alter table public.appointments
  add column if not exists status_v2 text,
  add column if not exists customer_name_snapshot text,
  add column if not exists service_id uuid,
  add column if not exists service_name_snapshot text,
  add column if not exists service_duration_minutes_snapshot integer,
  add column if not exists service_price_cents_snapshot integer,
  add column if not exists service_currency_snapshot text,
  add column if not exists staff_id uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists is_no_show boolean default false;

-- 2) status_v2 defaults (não toca no enum legacy)
update public.appointments
set status_v2 = case
  when status_v2 is not null and length(status_v2) > 0 then status_v2
  when status = 'CANCELLED' then 'CANCELLED'
  when status = 'CONFIRMED' then 'CONFIRMED'
  when status = 'BOOKED' then 'PENDING'
  else coalesce(status::text, 'PENDING')
end
where status_v2 is null or status_v2 = '';

-- 3) Garantir end_time (algumas linhas antigas podem estar nulas)
update public.appointments
set end_time = start_time + make_interval(mins => greatest(5, coalesce(service_duration_minutes_snapshot, 30)))
where end_time is null;

-- 4) Bloqueio HARD contra duplicação por staff/time-range
--    Permite sobreposição apenas se o agendamento estiver CANCELLED.
--    (slot_capacity>1 no WhatsApp ainda é possível via lógica, mas aqui blindamos 1 por staff.)
--    Se você usa capacidade >1 por staff, REMOVA esta constraint.
alter table public.appointments
  drop constraint if exists appointments_no_overlap_staff;

alter table public.appointments
  add constraint appointments_no_overlap_staff
  exclude using gist (
    company_id with =,
    staff_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (coalesce(status_v2, '') <> 'CANCELLED' and status <> 'CANCELLED');

-- 5) Índices úteis
create index if not exists idx_appointments_company_start on public.appointments(company_id, start_time);
create index if not exists idx_appointments_company_staff_start on public.appointments(company_id, staff_id, start_time);
create index if not exists idx_customers_company_phone on public.customers(company_id, phone);

-- 6) Views de métricas (28 dias)
--    Regras:
--      - Realizada: COMPLETED ou CONFIRMED no status_v2 (fallback CONFIRMED no enum)
--      - Prevista: PENDING/CONFIRMED (no status_v2) + BOOKED/CONFIRMED (no enum)
--      - Perdida: CANCELLED ou is_no_show

create or replace view public.v_company_financial_metrics as
with base as (
  select
    a.company_id,
    a.start_time,
    coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) as st,
    coalesce(a.service_price_cents_snapshot, 0) as price_cents,
    coalesce(a.is_no_show, false) as is_no_show
  from public.appointments a
  where a.start_time >= now() - interval '28 days'
)
select
  company_id,
  sum(case when st in ('CONFIRMED','COMPLETED') and not is_no_show then price_cents else 0 end) as revenue_realized_cents,
  sum(case when st in ('PENDING','CONFIRMED') and not is_no_show then price_cents else 0 end) as revenue_expected_cents,
  sum(case when st = 'CANCELLED' or is_no_show then price_cents else 0 end) as revenue_lost_cents,
  count(*) filter (where is_no_show) as total_no_show,
  count(*) filter (where st in ('CONFIRMED','COMPLETED') and not is_no_show) as total_completed
from base
group by company_id;

create or replace view public.v_staff_financial_metrics as
with base as (
  select
    a.company_id,
    a.staff_id,
    a.start_time,
    coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) as st,
    coalesce(a.service_price_cents_snapshot, 0) as price_cents,
    coalesce(a.is_no_show, false) as is_no_show
  from public.appointments a
  where a.start_time >= now() - interval '28 days'
)
select
  company_id,
  staff_id,
  sum(case when st in ('CONFIRMED','COMPLETED') and not is_no_show then price_cents else 0 end) as revenue_realized_cents,
  sum(case when st in ('PENDING','CONFIRMED') and not is_no_show then price_cents else 0 end) as revenue_expected_cents,
  sum(case when st = 'CANCELLED' or is_no_show then price_cents else 0 end) as revenue_lost_cents,
  count(*) filter (where st in ('CONFIRMED','COMPLETED') and not is_no_show) as total_completed,
  count(*) filter (where is_no_show) as total_no_show,
  case when count(*) filter (where st in ('CONFIRMED','COMPLETED') and not is_no_show) = 0 then 0
       else round(sum(case when st in ('CONFIRMED','COMPLETED') and not is_no_show then price_cents else 0 end)
                  / nullif(count(*) filter (where st in ('CONFIRMED','COMPLETED') and not is_no_show), 0))
  end as avg_ticket_cents
from base
group by company_id, staff_id;

-- Ocupação por staff (28 dias): soma minutos disponíveis a partir do horário semanal
create or replace view public.v_staff_occupancy as
with days as (
  select
    c.id as company_id,
    s.id as staff_id,
    (current_date - offs)::date as d
  from public.companies c
  join public.staff s on s.company_id = c.id
  cross join generate_series(0,27) as offs
  where s.active = true
),
slots as (
  select
    d.company_id,
    d.staff_id,
    extract(dow from d.d)::int as dow,
    d.d
  from days d
),
avail as (
  select
    sl.company_id,
    sl.staff_id,
    sum(
      case when wh.active is false then 0
           else greatest(0, (extract(epoch from (wh.end_time - wh.start_time)) / 60))
      end
    )::int as available_minutes
  from slots sl
  join public.staff_working_hours wh
    on wh.company_id = sl.company_id
   and wh.staff_id = sl.staff_id
   and wh.day_of_week = sl.dow
  group by sl.company_id, sl.staff_id
),
booked as (
  select
    a.company_id,
    a.staff_id,
    sum(
      greatest(0, extract(epoch from (a.end_time - a.start_time)) / 60)
    )::int as booked_minutes
  from public.appointments a
  where a.start_time >= now() - interval '28 days'
    and coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) in ('PENDING','CONFIRMED','COMPLETED')
    and a.status <> 'CANCELLED'
  group by a.company_id, a.staff_id
)
select
  a.company_id,
  a.staff_id,
  coalesce(b.booked_minutes, 0) as booked_minutes,
  coalesce(a.available_minutes, 0) as available_minutes,
  case when coalesce(a.available_minutes, 0) = 0 then 0
       else round((coalesce(b.booked_minutes,0)::numeric / a.available_minutes::numeric) * 100, 1)
  end as occupancy_pct
from avail a
left join booked b
  on b.company_id = a.company_id
 and b.staff_id = a.staff_id;

-- Top service (28 dias)
create or replace view public.v_top_services_28d as
select
  a.company_id,
  coalesce(a.service_id, null) as service_id,
  coalesce(a.service_name_snapshot, '—') as service_name,
  sum(coalesce(a.service_price_cents_snapshot, 0)) as revenue_cents,
  count(*) as total_completed
from public.appointments a
where a.start_time >= now() - interval '28 days'
  and coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) in ('CONFIRMED','COMPLETED')
  and coalesce(a.is_no_show,false) = false
group by a.company_id, a.service_id, a.service_name_snapshot
order by revenue_cents desc
;

-- Desempenho por dia da semana (28 dias)
create or replace view public.v_weekday_performance_28d as
select
  a.company_id,
  extract(dow from a.start_time)::int as weekday,
  sum(coalesce(a.service_price_cents_snapshot,0)) as revenue_cents,
  count(*) as total_completed
from public.appointments a
where a.start_time >= now() - interval '28 days'
  and coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) in ('CONFIRMED','COMPLETED')
  and coalesce(a.is_no_show,false) = false
group by a.company_id, extract(dow from a.start_time)
order by revenue_cents desc;

-- Hora mais vazia (28 dias)
create or replace view public.v_hourly_performance_28d as
select
  a.company_id,
  extract(hour from a.start_time)::int as hour,
  count(*) as total_completed
from public.appointments a
where a.start_time >= now() - interval '28 days'
  and coalesce(a.status_v2, case when a.status = 'BOOKED' then 'PENDING' else a.status::text end) in ('CONFIRMED','COMPLETED')
  and coalesce(a.is_no_show,false) = false
group by a.company_id, extract(hour from a.start_time)
order by total_completed asc;

commit;

-- OBS:
-- 1) Se você usa slot_capacity > 1 por staff, remova a constraint appointments_no_overlap_staff.
-- 2) Não removemos/alteramos o enum legacy appointment_status (evita erro 42P16 em views).
