import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/billing-portal.css';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Zap, Building2, Rocket } from 'lucide-react';
import { isBillingLive } from '../../lib/billingEnabled';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { PLAN_CONFIG } from '../../lib/planConfig';
import { trialMarketing } from '../../lib/trialCopy.js';
import { isPlanUpgrade, isPlanDowngrade } from '../../lib/planOrder.js';
import { fetchBillingStatus, postChangePlan, fetchPaymentMethodLink } from '../../lib/billingApi';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import SubscriptionStatusCard from './billing/SubscriptionStatusCard.jsx';
import BillingCheckoutModal from './billing/BillingCheckoutModal.jsx';
import InvoiceHistoryTable from './billing/InvoiceHistoryTable.jsx';
import SubscriptionActionsPanel from './billing/SubscriptionActionsPanel.jsx';

const PLAN_ICONS = { starter: Zap, studio: Building2, pro: Rocket };
const PLAN_ORDER = ['starter', 'studio', 'pro'];

export default function PlansTabContent({ embeddedInLayout = false, user }) {
  const navigate = useNavigate();
  const billingLive = isBillingLive();
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const addToast = useUiStore((s) => s.addToast);

  const [billingStatus, setBillingStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [downgradeTarget, setDowngradeTarget] = useState(null);
  const [planChangeBusy, setPlanChangeBusy] = useState(false);

  const academy = useMemo(
    () => (academyList || []).find((a) => a.id === academyId) || null,
    [academyList, academyId]
  );

  const currentPlan = billingStatus?.plan || billingStatus?.planSlug || null;
  const hasPaidSubscription = billingStatus?.status === 'active' || billingStatus?.status === 'past_due';

  const reloadStatus = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!academyId) {
      setLoadingStatus(false);
      setBillingStatus(null);
      return;
    }
    let cancelled = false;
    setLoadingStatus(true);
    fetchBillingStatus(academyId)
      .then((d) => {
        if (!cancelled) setBillingStatus(d);
      })
      .catch(() => {
        if (!cancelled) setBillingStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });
    return () => { cancelled = true; };
  }, [academyId, refreshKey]);

  const checkoutPrefill = useMemo(() => ({
    name: academy?.name || user?.name || '',
    email: academy?.email || user?.email || '',
    phone: academy?.phone || '',
  }), [academy, user]);

  const handleRegularize = async () => {
    try {
      const { url } = await fetchPaymentMethodLink(academyId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Não foi possível abrir a fatura.' });
    }
  };

  const handlePlanAction = (planKey) => {
    if (!billingLive) {
      addToast({ type: 'info', message: 'Assinatura ainda não está ativa. Em breve.' });
      return;
    }
    if (!academyId) {
      addToast({ type: 'error', message: 'Sessão expirada. Faça login novamente.' });
      navigate('/login');
      return;
    }

    if (currentPlan === planKey) return;

    if (hasPaidSubscription && currentPlan) {
      if (isPlanUpgrade(currentPlan, planKey)) {
        setPlanChangeBusy(true);
        postChangePlan(academyId, planKey, 'now')
          .then(() => {
            addToast({ type: 'success', message: 'Plano atualizado com sucesso.' });
            reloadStatus();
          })
          .catch((e) => addToast({ type: 'error', message: e?.message || 'Falha ao mudar plano.' }))
          .finally(() => setPlanChangeBusy(false));
        return;
      }
      if (isPlanDowngrade(currentPlan, planKey)) {
        setDowngradeTarget(planKey);
        return;
      }
    }

    setCheckoutPlan(planKey);
  };

  const confirmDowngrade = async () => {
    if (!downgradeTarget || !academyId) return;
    setPlanChangeBusy(true);
    try {
      await postChangePlan(academyId, downgradeTarget, 'next_cycle');
      addToast({
        type: 'success',
        message: `Mudança para ${PLAN_CONFIG[downgradeTarget]?.name} agendada para o próximo ciclo.`,
      });
      setDowngradeTarget(null);
      reloadStatus();
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Falha ao agendar mudança.' });
    } finally {
      setPlanChangeBusy(false);
    }
  };

  const planButtonLabel = (key) => {
    if (currentPlan === key) return null;
    if (!billingLive) return 'Em breve';
    if (!currentPlan || billingStatus?.status === 'trial' || billingStatus?.status === 'inactive') {
      return trialMarketing.plansFreeSubscribe;
    }
    if (isPlanUpgrade(currentPlan, key)) return 'Fazer upgrade';
    if (isPlanDowngrade(currentPlan, key)) return `Mudar para ${PLAN_CONFIG[key].name}`;
    return 'Assinar';
  };

  return (
    <div className="billing-portal">
      {!embeddedInLayout ? (
        <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 20 }}>
          Assinatura do Nave — pague com PIX, boleto ou cartão via Asaas. {trialMarketing.plansFree} em qualquer plano do
          sistema.
        </p>
      ) : null}

      {!billingLive && (
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
      )}

      {!loadingStatus && (
        <SubscriptionStatusCard status={billingStatus} onRegularize={handleRegularize} />
      )}

      <div
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
          const btnLabel = planButtonLabel(key);
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
                border: isStudio ? '2px solid var(--accent)' : isCurrentPlan ? '2px solid var(--success)' : '1px solid var(--border)',
                position: 'relative',
              }}
            >
              {isStudio && !isCurrentPlan && (
                <div style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '5px 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Mais popular
                </div>
              )}
              {isCurrentPlan && (
                <div style={{ background: 'var(--success)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '5px 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  ✓ Plano atual
                </div>
              )}
              <div style={{ padding: '20px 24px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <strong className="text-small" style={{ fontSize: '1rem' }}>{plan.name}</strong>
                    <p className="navi-subtitle" style={{ marginTop: 2, fontSize: '0.78rem' }}>{plan.description}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="navi-page-title" style={{ fontSize: '2rem' }}>R$ {plan.price.toLocaleString('pt-BR')}</span>
                  <span className="navi-subtitle">/mês</span>
                </div>
                <p className="navi-subtitle" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                  R$ {plan.overage_price.toFixed(2).replace('.', ',')} por conversa adicional
                </p>
              </div>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '0 24px' }} />
              <ul style={{ listStyle: 'none', padding: '16px 24px', margin: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={15} color="var(--success)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f}</span>
                  </li>
                ))}
              </ul>
              <div style={{ padding: '0 24px 24px' }}>
                {isCurrentPlan ? (
                  <div style={{ textAlign: 'center', padding: '10px', borderRadius: 'var(--radius-sm)', background: 'var(--success-light, rgba(34,197,94,0.1))', color: 'var(--success)', fontWeight: 600, fontSize: '0.875rem' }}>
                    Assinatura ativa
                  </div>
                ) : (
                  <button
                    type="button"
                    className={isStudio ? 'btn-primary' : 'btn-outline'}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handlePlanAction(key)}
                    disabled={!billingLive || planChangeBusy}
                  >
                    {btnLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loadingStatus && academyId && (
        <p className="navi-subtitle" style={{ textAlign: 'center', marginTop: 20 }}>
          Carregando assinatura do Nave…
        </p>
      )}

      <InvoiceHistoryTable storeId={academyId} billingLive={billingLive} refreshKey={refreshKey} />

      <SubscriptionActionsPanel
        storeId={academyId}
        billingLive={billingLive}
        status={billingStatus}
        onChanged={reloadStatus}
      />

      <BillingCheckoutModal
        open={Boolean(checkoutPlan)}
        planSlug={checkoutPlan}
        storeId={academyId}
        prefill={checkoutPrefill}
        onClose={() => setCheckoutPlan(null)}
        onSuccess={reloadStatus}
      />

      <ConfirmDialog
        open={Boolean(downgradeTarget)}
        title="Mudar de plano"
        description={
          downgradeTarget
            ? `O plano ${PLAN_CONFIG[downgradeTarget]?.name} passará a valer na próxima cobrança. Seu limite de conversas IA será ajustado nessa data.`
            : ''
        }
        confirmLabel="Confirmar mudança"
        onConfirm={confirmDowngrade}
        onClose={() => setDowngradeTarget(null)}
        loading={planChangeBusy}
        confirmVariant="primary"
      />

      <p className="navi-subtitle" style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8rem' }}>
        Dúvidas?{' '}
        <a href="https://api.whatsapp.com/send?phone=5511999999999" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          Fale com o suporte
        </a>
      </p>
    </div>
  );
}
