# PRO upgrades included

## 1) Staff login (PRO only)
- `/api/staff/invite` now returns 402 (PRO_ONLY) if company.plan != 'pro'
- Staff page hides email field on BASIC and shows upgrade link.

Env:
- NEXT_PUBLIC_APP_URL must be set (used as redirectTo for invites)
- SUPER_ADMIN_EMAILS="you@email.com,other@email.com" to access /admin/companies

## 2) Staff working hours (configurable)
SQL migration:
- supabase/migrations/2026_02_16_staff_working_hours.sql

UI:
- Dashboard > Staff: button "Horários" per staff.

## 3) Metrics
- `/api/metrics/summary` returns counts today + last 7 days.
- Dashboard shows 2 cards.

## 4) Admin panel (super admin)
- /admin/companies
- API: /api/admin/companies
