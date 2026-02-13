# Agenda Blindada — SaaS MVP (PT-PT)
Next.js + Supabase + WhatsApp Cloud API + Stripe (Checkout + Webhook + Portal)

## O que foi ajustado para ficar “profissional”
- Gate de acesso **pós-login** (client-side):
  - sem sessão → `/login`
  - assinatura inativa → `/dashboard/billing`
  - assinatura ativa mas onboarding incompleto → `/dashboard/onboarding`
- Onboarding V1 minimalista (minimiza trabalho do dono):
  - nome do negócio
  - tempo padrão por atendimento

## Setup (local)
1) Supabase: correr `supabase/schema.sql` (ou aplicar as migrations em `supabase/migrations`)
2) Criar `.env.local` e preencher as variáveis
3) Instalar dependências e arrancar:
   - `npm install`
   - `npm run dev`
4) WhatsApp webhook:
   - `/api/whatsapp/webhook` (GET verify + POST messages)

## Stripe (obrigatório no fluxo pay-first)
### Variáveis de ambiente
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_PRO`
- `NEXT_PUBLIC_APP_URL` (ex: `http://localhost:3000` ou o domínio da Vercel)

### Rotas
- Checkout: `POST /api/stripe/checkout/basic` e `POST /api/stripe/checkout/pro`
- Webhook: `POST /api/stripe/webhook`
- Portal: `POST /api/stripe/portal`

### Pay-first (não cria conta sem pagar)
1) Abrir `/planos`
2) Pagar (Stripe Checkout)
3) Stripe redireciona para `/signup?session_id=...`
4) Criar a conta (backend valida que a session está `paid`)

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
