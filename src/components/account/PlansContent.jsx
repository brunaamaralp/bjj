import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Zap, Building2, Rocket } from 'lucide-react';
import { createSessionJwt } from '../../lib/appwrite';
import { isBillingLive } from '../../lib/billingEnabled';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { PLAN_CONFIG } from '../../lib/planConfig';

const CHECKOUT_LINKS = {
  starter: import.meta.env.VITE_ASAAS_LINK_STARTER || '',
  studio: import.meta.env.VITE_ASAAS_LINK_STUDIO || '',
  pro: import.meta.env.VITE_ASAAS_LINK_PRO || '',
};

const PLAN_ICONS = { starter: Zap, studio: Building2, pro: Rocket };
const PLAN_ORDER = ['starter', 'studio', 'pro'];

export default function PlansContent() {
  const navigate = useNavigate();
  const billingLive = isBillingLive();
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    if (!academyId) {
      setLoadingStatus(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const jwt = await createSessionJwt();
        if (!jwt) return;
        const r = await fetch(`/api/billing/status?storeId=${encodeURIComponent(academyId)}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && d.sucesso && d.plan) setCurrentPlan(d.plan);
      } catch {
        void 0;
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const handleCheckout = (planKey) => {
    if (!billingLive) {
      addToast({ type: 'info', message: 'Assinatura ainda não está ativa. Em breve.' });
      return;
    }
    if (!academyId) {
      addToast({ type: 'error', message: 'Sessão expirada. Faça login novamente.' });
      navigate('/login');
      return;
    }
    const link = CHECKOUT_LINKS[planKey];
    if (!link) {
      addToast({
        type: 'error',
        message: 'Link de pagamento indisponível. Entre em contato pelo WhatsApp.',
        action: {
          label: 'Falar com suporte',
          onClick: () => window.open('https://api.whatsapp.com/send?phone=5511999999999'),
        },
      });
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 20 }}>
        Pague com PIX, boleto ou cartão — via Asaas, com segurança. 30 dias grátis em qualquer plano.
      </p>
      {!billingLive ? (
        <p
          className="navi-subtitle"
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--warn-bg, rgba(234, 179, 8, 0.12))',
            color: 'var(--warn-text, #854d0e)',
          }}
        >
          Prévia: cobrança desativada. Os botões de pagamento serão habilitados quando a assinatura estiver ativa.
        </p>
      ) : null}
      <motion.div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {PLAN_ORDER.map((key) => {
          const plan = PLAN_CONFIG[key];
          const Icon = PLAN_ICONS[key] || Zap;
          const isCurrentPlan = currentPlan === key;
          const isStudio = key === 'studio';
          return (
            <div
              key={key}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
                border: isStudio
                  ? '2px solid var(--accent)'
                  : isCurrentPlan
                    ? '2px solid var(--success)'
                    : '1px solid var(--border)',
              }}
            >
              {isStudio && !isCurrentPlan ? (
                <div style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '5px 0', textTransform: 'uppercase' }}>
                  Mais popular
                </motion.div>
              ) : null}
              {isCurrentPlan ? (
                <div style={{ background: 'var(--success)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '5px 0', textTransform: 'uppercase' }}>
                  ✓ Plano atual
                </motion.div>
              ) : null}
              <div style={{ padding: '20px 24px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} />
                  </motion.div>
                  <div>
                    <strong className="text-small" style={{ fontSize: '1rem' }}>{plan.name}</strong>
                    <p className="navi-subtitle" style={{ marginTop: 2, fontSize: '0.78rem' }}>{plan.description}</p>
                  </motion.div>
                </motion.div>
                <motion.div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="navi-page-title" style={{ fontSize: '2rem' }}>R$ {plan.price.toLocaleString('pt-BR')}</span>
                  <span className="navi-subtitle">/mês</span>
                </motion.div>
              </motion.div>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '0 24px' }} />
              <ul style={{ listStyle: 'none', padding: '16px 24px', margin: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={15} color="var(--success)" />
                    <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{f}</span>
                  </li>
                ))}
              </ul>
              <div style={{ padding: '0 24px 24px' }}>
                {isCurrentPlan ? (
                  <div style={{ textAlign: 'center', padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(34,197,94,0.1)', color: 'var(--success)', fontWeight: 600 }}>
                    Plano ativo
                  </motion.div>
                ) : (
                  <button type="button" className={isStudio ? 'btn-primary' : 'btn-outline'} style={{ width: '100%' }} onClick={() => handleCheckout(key)} disabled={!billingLive}>
                    {!billingLive ? 'Em breve' : currentPlan ? 'Fazer upgrade' : '30 dias grátis — assinar'}
                  </button>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      {loadingStatus && academyId ? <p className="navi-subtitle" style={{ textAlign: 'center', marginTop: 20 }}>Carregando plano atual…</p> : null}
    </motion.div>
  );
}
