# Agenda Blindada — SaaS MVP (PT-PT)
Next.js + Supabase + WhatsApp Cloud API (+ Stripe opcional)

## O que foi ajustado para ficar “profissional”
- Gate de acesso **pós-login** (client-side):
  - sem sessão → `/login`
  - assinatura inativa → `/dashboard/billing`
  - assinatura ativa mas onboarding incompleto → `/dashboard/onboarding`
- Onboarding V1 minimalista (minimiza trabalho do dono):
  - nome do negócio
  - tempo padrão por atendimento

## Setup (local)
1) Supabase: correr `supabase/schema.sql`
2) Criar `.env.local` a partir de `.env.example` e preencher as variáveis
3) Instalar dependências e arrancar:
   - `npm install`
   - `npm run dev`
4) WhatsApp webhook:
   - `/api/whatsapp/webhook` (GET verify + POST messages)

## Teste rápido (para ir para 1º cliente)
1) Faça login
2) Se cair em `billing`: ative o BASIC/PRO (ou marque status como active no DB)
3) Complete onboarding em `/dashboard/onboarding`
4) Crie 3 marcações em `/dashboard/new`
5) Verifique bloqueio e lembretes

## Jobs (cron)
- `npm run reminders:24h`
- `npm run thanks`
- `npm run rebook`
