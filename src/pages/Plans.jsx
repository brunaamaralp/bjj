import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Zap, Building2, Rocket } from 'lucide-react';
import { createSessionJwt } from '../lib/appwrite';
import { isBillingLive } from '../lib/billingEnabled';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { PLAN_CONFIG } from '../lib/planConfig';

// Links de pagamento externos por plano (gerados no painel do Asaas)
// Configurar como variáveis de ambiente no Vercel e .env.local
const CHECKOUT_LINKS = {
  starter: import.meta.env.VITE_ASAAS_LINK_STARTER || '',
  studio:  import.meta.env.VITE_ASAAS_LINK_STUDIO  || '',
  pro:     import.meta.env.VITE_ASAAS_LINK_PRO     || '',
};

const PLAN_ICONS = {
  starter: Zap,
  studio:  Building2,
  pro:     Rocket,
};

const PLAN_ORDER = ['starter', 'studio', 'pro'];

const Plans = ({ user }) => {
  const navigate = useNavigate();
  const billingLive = isBillingLive();
  const academyId = useLeadStore((s) => s.academyId);
  const addToast = useUiStore((s) => s.addToast);

  // Plano atual da academia (vem do documento via API)
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
        if (!cancelled && d.sucesso && d.plan) {
          setCurrentPlan(d.plan);
        }
      } catch {
        void 0;
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => { cancelled = true; };
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
    <div className="container" style={{ paddingTop: 20, paddingBottom: 48 }}>
      <div className="animate-in">
        <Link to="/" className="navi-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Voltar ao início
        </Link>
        <h2 className="navi-page-title">Escolha seu plano</h2>
        <p className="navi-subtitle" style={{ marginTop: 6 }}>
          Pague com PIX, boleto ou cartão — via Asaas, com segurança. 30 dias grátis em qualquer plano.
        </p>

        {!billingLive && (
          <p
            className="navi-subtitle"
            style={{
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--warn-bg, rgba(234, 179, 8, 0.12))',
              color: 'var(--warn-text, #854d0e)',
            }}
          >
            Prévia: cobrança desativada. Os botões de pagamento serão habilitados quando a assinatura estiver ativa.
          </p>
        )}
      </div>

      {/* Grade de planos */}
      <div
        className="animate-in"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
          marginTop: 28,
          animationDelay: '0.05s',
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
                gap: 0,
                padding: 0,
                overflow: 'hidden',
                border: isStudio
                  ? '2px solid var(--accent)'
                  : isCurrentPlan
                  ? '2px solid var(--success)'
                  : '1px solid var(--border)',
                position: 'relative',
              }}
            >
              {/* Ribbon */}
              {isStudio && !isCurrentPlan && (
                <div
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    padding: '5px 0',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  Mais popular
                </div>
              )}
              {isCurrentPlan && (
                <div
                  style={{
                    background: 'var(--success)',
                    color: '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    padding: '5px 0',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  ✓ Plano atual
                </div>
              )}

              {/* Header */}
              <div style={{ padding: '20px 24px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'var(--accent-light)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <strong className="text-small" style={{ fontSize: '1rem' }}>{plan.name}</strong>
                    <p className="navi-subtitle" style={{ marginTop: 2, fontSize: '0.78rem' }}>{plan.description}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="navi-page-title" style={{ fontSize: '2rem' }}>
                    R$ {plan.price.toLocaleString('pt-BR')}
                  </span>
                  <span className="navi-subtitle">/mês</span>
                </div>
                <p className="navi-subtitle" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                  R$ {plan.overage_price.toFixed(2).replace('.', ',')} por conversa adicional
                </p>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-light)', margin: '0 24px' }} />

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: '16px 24px', margin: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={15} color="var(--success)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div style={{ padding: '0 24px 24px' }}>
                {isCurrentPlan ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--success-light, rgba(34,197,94,0.1))',
                      color: 'var(--success)',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    Plano ativo
                  </div>
                ) : (
                  <button
                    type="button"
                    className={isStudio ? 'btn-primary' : 'btn-outline'}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleCheckout(key)}
                    disabled={!billingLive && currentPlan !== key}
                  >
                    {!billingLive
                      ? 'Em breve'
                      : currentPlan
                      ? 'Fazer upgrade'
                      : '30 dias grátis — assinar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé informativo */}
      {loadingStatus && academyId && (
        <p className="navi-subtitle" style={{ textAlign: 'center', marginTop: 20 }}>Carregando plano atual…</p>
      )}
      <p className="navi-subtitle" style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8rem' }}>
        Dúvidas?{' '}
        <a
          href="https://api.whatsapp.com/send?phone=5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', fontWeight: 600 }}
        >
          Fale com o suporte
        </a>
      </p>
    </div>
  );
};

export default Plans;
