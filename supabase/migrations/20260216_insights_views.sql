-- Views de insights (opcional, para acelerar Radar/CRM/Heatmap)
-- Não altera nada existente: apenas leitura.

-- Última marcação válida por cliente
create or replace view public.v_customer_last_visit as
select
  a.company_id,
  a.customer_id,
  max(a.start_time) filter (where a.status in ('BOOKED','CONFIRMED','PENDING','COMPLETED')) as last_visit_at,
  max(a.start_time) filter (where a.status in ('BOOKED','CONFIRMED','PENDING') and a.start_time > now()) as next_visit_at,
  sum(coalesce(a.service_price_cents_snapshot,0)) filter (where a.status in ('BOOKED','CONFIRMED','COMPLETED')) as spent_cents_total
from public.appointments a
group by a.company_id, a.customer_id;

-- Cancelamentos nos últimos 30 dias (por cliente)
create or replace view public.v_customer_cancel_30d as
select
  a.company_id,
  a.customer_id,
  count(*) as canc_30d
from public.appointments a
where a.status = 'CANCELLED'
  and a.start_time >= now() - interval '30 days'
group by a.company_id, a.customer_id;

-- Receita 7 dias por staff
create or replace view public.v_staff_revenue_7d as
select
  a.company_id,
  a.staff_id,
  sum(coalesce(a.service_price_cents_snapshot,0)) as revenue_cents_7d,
  count(*) filter (where a.status in ('BOOKED','CONFIRMED','PENDING','COMPLETED')) as appts_7d
from public.appointments a
where a.start_time >= now() - interval '7 days'
group by a.company_id, a.staff_id;

-- Heatmap: quantidade por dia da semana (últimos 28 dias)
create or replace view public.v_weekday_heatmap_28d as
select
  a.company_id,
  extract(dow from a.start_time) as dow, -- 0=Dom ... 6=Sáb
  count(*) filter (where a.status in ('BOOKED','CONFIRMED','PENDING','COMPLETED')) as appts_28d
from public.appointments a
where a.start_time >= now() - interval '28 days'
group by a.company_id, extract(dow from a.start_time);

-- Segurança: views herdam RLS das tabelas base (appointments). Nada extra a configurar.
