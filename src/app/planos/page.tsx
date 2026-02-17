'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function PlanosPage() {
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'basic' | 'pro'>(null);

  async function checkout(plan: 'basic' | 'pro') {
    setMsg(null);
    setLoading(plan);
    try {
      const res = await fetch(`/api/stripe/checkout/${plan}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, companyName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error || 'Falha ao iniciar pagamento');
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
      } else {
        setMsg('Stripe URL não retornou');
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={{ minHeight: 'calc(100vh - 72px)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div className="ab-card" style={{ width: '100%', maxWidth: 760 }}>
        <div className="ab-card-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ letterSpacing: -0.2 }}>Agenda Blindada</strong>
          <Link href='/login' style={{ fontSize: 13, opacity: 0.8, color: 'var(--text)' }}>
            Já tenho conta
          </Link>
        </div>

        <h1 style={{ margin: '12px 0 6px', fontSize: 28, letterSpacing: -0.6 }}>Escolha um plano</h1>
        <p style={{ margin: 0, opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
          Regra do produto: <b>máximo 5 funcionários</b> no plano pago.
        </p>

        <div style={{ height: 16 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 800 }}>Nome da empresa</label>
            <input className="ab-input" style={{ marginTop: 6 }} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 800 }}>Email</label>
            <input
              className="ab-input"
              style={{ marginTop: 6 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='seu@email.com'
              autoComplete='email'
            />
          </div>
        </div>

        <div style={{ height: 16 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ border: '1px solid var(--card-border)', borderRadius: 16, padding: 16, background: 'var(--card-bg-strong)' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Basic</h2>
            <p style={{ margin: '6px 0 12px', opacity: 0.75, fontSize: 13 }}>Acesso ao painel + WhatsApp + agendamentos.</p>
            <button
              onClick={() => checkout('basic')}
              disabled={loading !== null}
              className="ab-btn ab-btn-primary"
              style={{ width: '100%', padding: '12px 14px', opacity: loading ? 0.85 : 1 }}
            >
              {loading === 'basic' ? 'A abrir pagamento...' : 'Pagar e criar conta'}
            </button>
          </div>

          <div style={{ border: '1px solid var(--card-border)', borderRadius: 16, padding: 16, background: 'var(--card-bg-strong)' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Pro</h2>
            <p style={{ margin: '6px 0 12px', opacity: 0.75, fontSize: 13 }}>Tudo do Basic + recursos Pro (guardas e limites).</p>
            <button
              onClick={() => checkout('pro')}
              disabled={loading !== null}
              className="ab-btn ab-btn-primary"
              style={{ width: '100%', padding: '12px 14px', opacity: loading ? 0.85 : 1 }}
            >
              {loading === 'pro' ? 'A abrir pagamento...' : 'Pagar e criar conta'}
            </button>
          </div>
        </div>

        {msg && (
          <p style={{ marginTop: 14, color: '#b91c1c', background: 'rgba(185, 28, 28, 0.07)', border: '1px solid rgba(185, 28, 28, 0.18)', padding: '10px 12px', borderRadius: 12, fontSize: 13 }}>
            {msg}
          </p>
        )}

        <div style={{ height: 10 }} />
        <p style={{ margin: 0, opacity: 0.7, fontSize: 12 }}>
          Depois do pagamento, você cai automaticamente na criação de conta.
        </p>
        </div>
      </div>
    </main>
  );
}
