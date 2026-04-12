import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, ChevronRight, Sparkles } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { isBillingLive } from '../lib/billingEnabled';
import {
  onboardingDismissStorageKey,
  onboardingStepPath,
  trialDaysRemaining,
} from '../lib/onboardingChecklist.js';

export default function OnboardingBanner() {
  const navigate = useNavigate();
  const academyId = useLeadStore((s) => s.academyId);
  const checklist = useLeadStore((s) => s.onboardingChecklist);
  const billingAccess = useLeadStore((s) => s.billingAccess);
  const reopenNonce = useLeadStore((s) => s.onboardingChecklistReopenNonce);
  const completeOnboardingStepIds = useLeadStore((s) => s.completeOnboardingStepIds);
  const addToast = useUiStore((s) => s.addToast);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!academyId) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(localStorage.getItem(onboardingDismissStorageKey(academyId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [academyId, reopenNonce]);

  const { pendingSteps, totalSteps, allDone } = useMemo(() => {
    const list = Array.isArray(checklist) ? checklist : [];
    const pending = list.filter((it) => !it.done);
    return {
      pendingSteps: pending,
      totalSteps: list.length,
      allDone: list.length > 0 && pending.length === 0,
    };
  }, [checklist]);

  const showBanner =
    Boolean(academyId) &&
    !dismissed &&
    totalSteps > 0 &&
    !allDone;

  const trialLine = useMemo(() => {
    if (!isBillingLive() || billingAccess?.status !== 'trial' || !billingAccess?.currentPeriodEnd) {
      return null;
    }
    const days = trialDaysRemaining(billingAccess.currentPeriodEnd);
    if (days == null) return null;
    const until = new Date(billingAccess.currentPeriodEnd).toLocaleDateString('pt-BR');
    return `Trial: ${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'} (até ${until}).`;
  }, [billingAccess]);

  const needsPlanLine =
    isBillingLive() && billingAccess?.needsPlan && billingAccess?.status !== 'preview';

  const installPwaPending = pendingSteps.some((s) => s.id === 'install_pwa');

  const handleDismiss = () => {
    if (!academyId) return;
    try {
      localStorage.setItem(onboardingDismissStorageKey(academyId), '1');
    } catch { void 0; }
    setDismissed(true);
  };

  const handleStepClick = (stepId) => {
    const path = onboardingStepPath(stepId);
    if (path) {
      navigate(path);
      return;
    }
    if (stepId === 'install_pwa') {
      addToast({
        type: 'info',
        message:
          'No celular: menu do navegador → "Adicionar à tela inicial" ou "Instalar app" para abrir o Nave como atalho.',
        duration: 8000,
      });
    }
  };

  const handlePwaDone = () => {
    void completeOnboardingStepIds(['install_pwa']);
  };

  if (!showBanner) {
    return null;
  }

  const next = pendingSteps[0];

  return (
    <div
      className="navi-onboarding-banner animate-in"
      role="region"
      aria-label="Checklist de primeiros passos"
      style={{
        margin: '0 20px 12px',
        padding: '14px 16px',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--border-light, #e2e8f0)',
        background: 'linear-gradient(135deg, var(--accent-light, #ede9fe) 0%, var(--surface, #fff) 55%)',
        boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,0.06))',
      }}
    >
      <div className="flex items-start gap-3" style={{ flexWrap: 'wrap' }}>
        <div
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
          aria-hidden
        >
          <Sparkles size={22} strokeWidth={2} />
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p className="navi-section-heading" style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>
            Bem-vindo ao Nave
          </p>
          <p className="text-small" style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Complete os primeiros passos para aproveitar o CRM. Faltam{' '}
            <strong>{pendingSteps.length}</strong> de <strong>{totalSteps}</strong>.
          </p>
          {trialLine ? (
            <p className="text-small" style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {trialLine}
            </p>
          ) : null}
          {needsPlanLine ? (
            <p className="text-small" style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Defina o plano para continuar após o trial:{' '}
              <Link to="/planos" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Ver planos
              </Link>
              {' · '}
              <Link to="/conta" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Conta
              </Link>
            </p>
          ) : null}
          {next ? (
            <button
              type="button"
              className="btn-primary"
              style={{
                marginTop: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.85rem',
                padding: '8px 14px',
                minHeight: 38,
              }}
              onClick={() => handleStepClick(next.id)}
            >
              Próximo: {next.title}
              <ChevronRight size={16} aria-hidden />
            </button>
          ) : null}
          <ul className="text-small" style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--text-muted)' }}>
            {pendingSteps.slice(0, 4).map((s) => (
              <li key={s.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => handleStepClick(s.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                  }}
                >
                  {s.title}
                </button>
              </li>
            ))}
            {pendingSteps.length > 4 ? (
              <li style={{ listStyle: 'none', marginLeft: -18, marginTop: 6 }}>…</li>
            ) : null}
          </ul>
          {installPwaPending ? (
            <button
              type="button"
              className="btn-outline"
              style={{ marginTop: 10, fontSize: '0.8rem', padding: '6px 12px', minHeight: 34 }}
              onClick={handlePwaDone}
            >
              Já instalei o app na tela inicial
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-outline"
          onClick={handleDismiss}
          aria-label="Dispensar checklist"
          title="Dispensar"
          style={{ flexShrink: 0, padding: 8, minHeight: 36, minWidth: 36 }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
