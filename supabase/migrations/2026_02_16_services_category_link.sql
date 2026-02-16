-- ==========================================
-- Agenda Blindada - Link services -> categories
-- ==========================================

alter table public.services
  add column if not exists category_id uuid references public.service_categories(id) on delete set null;

create index if not exists idx_services_company_category
  on public.services(company_id, category_id);

-- Backfill: assign first category per company to uncategorized services
with first_cat as (
  select company_id, min(id) as cat_id
  from public.service_categories
  group by company_id
)
update public.services s
set category_id = fc.cat_id
from first_cat fc
where s.company_id = fc.company_id
  and s.category_id is null;
