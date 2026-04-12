import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { isBillingLive } from '../lib/billingEnabled';
import { useUserRole } from '../lib/useUserRole';
import {
  onboardingDismissStorageKey,
  onboardingStepPath,
  trialDaysRemaining,
  buildEffectiveCoreSteps,
  ONBOARDING_STEP_TITLES,
} from '../lib/onboardingChecklist.js';

const ONBOARDING_BANNER_HEADLINE = 'Vamos deixar seu CRM pronto?';

export default function OnboardingBanner() {
  const navigate = useNavigate();
  const { academyId, checklist, billingAccess, reopenNonce, academyList } = useLeadStore(
    useShallow((s) => ({
      academyId: s.academyId,
      checklist: s.onboardingChecklist,
      billingAccess: s.billingAccess,
      reopenNonce: s.onboardingChecklistReopenNonce,
      academyList: s.academyList,
    }))
  );
  const completeOnboardingStepIds = useLeadStore((s) => s.completeOnboardingStepIds);
  const addToast = useUiStore((s) => s.addToast);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  const academyDoc = useMemo(() => {
    const list = Array.isArray(academyList) ? academyList : [];
    return list.find((a) => a.id === academyId) || { ownerId: '', teamId: '' };
  }, [academyList, academyId]);
  const role = useUserRole(academyDoc);
  const canConfigureAgenteIa = role === 'owner' || role === 'member';

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

  const list = Array.isArray(checklist) ? checklist : [];
  const installPwaRow = list.find((it) => it.id === 'install_pwa');
  const installPwaPending = Boolean(installPwaRow && !installPwaRow.done);

  const effectiveCore = useMemo(
    () => buildEffectiveCoreSteps(list, billingAccess, isBillingLive()),
    [list, billingAccess]
  );

  const { pendingCore, totalCore, allCoreDone } = useMemo(() => {
    const pending = effectiveCore.filter((it) => !it.done);
    return {
      pendingCore: pending,
      totalCore: effectiveCore.length,
      allCoreDone: effectiveCore.length > 0 && pending.length === 0,
    };
  }, [effectiveCore]);

  const showBanner = Boolean(academyId) && !dismissed && totalCore > 0 && !allCoreDone;

  const trialLine = useMemo(() => {
    if (!isBillingLive() || billingAccess?.status !== 'trial' || !billingAccess?.currentPeriodEnd) {
      return null;
    }
    const days = trialDaysRemaining(billingAccess.currentPeriodEnd);
    if (days == null) return null;
    const until = new Date(billingAccess.currentPeriodEnd).toLocaleDateString('pt-BR');
    return `Trial: ${days} dia${days === 1 ? '' : 's'} até ${until}`;
  }, [billingAccess]);

  const needsPlanLine =
    isBillingLive() && billingAccess?.needsPlan && billingAccess?.status !== 'preview';

  const handleDismiss = () => {
    if (!academyId) return;
    try {
      localStorage.setItem(onboardingDismissStorageKey(academyId), '1');
    } catch {
      void 0;
    }
    setDismissed(true);
  };

  const stepBlocked = (stepId) =>
    (stepId === 'setup_ai' || stepId === 'connect_whatsapp') && !canConfigureAgenteIa;

  const handleStepNav = (stepId) => {
    if (stepBlocked(stepId)) {
      addToast({
        type: 'info',
        message: 'Peça ao dono da academia para configurar a IA e o WhatsApp.',
        duration: 6000,
      });
      return;
    }
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

  const nextActionable = pendingCore.find((s) => !stepBlocked(s.id)) || pendingCore[0];

  const doneCoreCount = effectiveCore.filter((s) => s.done).length;

  if (!showBanner) {
    return null;
  }

  return (
    <div
      className="navi-onboarding-banner animate-in"
      role="region"
      aria-label="Primeiros passos no Nave"
      style={{
        margin: '0 20px 10px',
        padding: expanded ? '12px 14px' : '10px 14px',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--border-light, #e2e8f0)',
        background: 'var(--surface, #fff)',
        boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,0.06))',
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, columnGap: 12 }}
      >
        <div
          className="flex items-center gap-2"
          style={{ flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap', rowGap: 6, columnGap: 8 }}
        >
          <p className="navi-section-heading" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.35 }}>
            {ONBOARDING_BANNER_HEADLINE}
          </p>
          <span
            className="text-small"
            style={{
              fontWeight: 700,
              color: 'var(--text-muted)',
              background: 'var(--accent-light)',
              padding: '2px 8px',
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {doneCoreCount}/{totalCore}
          </span>
          <button
            type="button"
            className="text-small"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              padding: '2px 0',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            {expanded ? 'Menos detalhes' : 'Detalhes'}
            <ChevronDown
              size={16}
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
              aria-hidden
            />
          </button>
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

      {expanded ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light, #e2e8f0)' }}>
          <p className="text-small" style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Em poucos passos você vê a recepção, a IA e o WhatsApp funcionando.
          </p>
          {trialLine ? (
            <p className="text-small" style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {trialLine}
            </p>
          ) : null}
          {needsPlanLine ? (
            <p className="text-small" style={{ margin: '6px 0 0', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Depois do trial, escolha um plano:{' '}
              <Link to="/planos" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Ver planos
              </Link>
              {' · '}
              <Link to="/conta" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Conta
              </Link>
            </p>
          ) : null}

          {nextActionable ? (
            <button
              type="button"
              className="btn-primary"
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem',
                padding: '8px 14px',
                minHeight: 36,
              }}
              onClick={() => handleStepNav(nextActionable.id)}
            >
              Continuar: {ONBOARDING_STEP_TITLES[nextActionable.id] || nextActionable.title}
              <ChevronRight size={16} aria-hidden />
            </button>
          ) : null}

          {!canConfigureAgenteIa && pendingCore.some((s) => stepBlocked(s.id)) ? (
            <p className="text-small" style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
              A configuração de IA e WhatsApp é feita pelo dono ou por quem tem permissão de equipe.
            </p>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="text-small"
              onClick={() => setStepsOpen((o) => !o)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              {stepsOpen ? 'Ocultar passos' : 'Ver todos os passos'}
              <ChevronDown
                size={16}
                style={{ transform: stepsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                aria-hidden
              />
            </button>
            {stepsOpen ? (
              <div className="flex flex-wrap" style={{ marginTop: 8, gap: 6 }}>
                {pendingCore.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStepNav(s.id)}
                    disabled={stepBlocked(s.id)}
                    className="text-small"
                    style={{
                      border: '1px solid var(--border-light)',
                      background: stepBlocked(s.id) ? 'var(--surface-hover)' : 'var(--surface)',
                      color: stepBlocked(s.id) ? 'var(--text-muted)' : 'var(--accent)',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 999,
                      cursor: stepBlocked(s.id) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {ONBOARDING_STEP_TITLES[s.id] || s.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <details style={{ marginTop: 12 }}>
            <summary
              className="text-small"
              style={{ cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600 }}
            >
              Dica: atalho na tela inicial
            </summary>
            <p className="text-small" style={{ margin: '8px 0 6px', color: 'var(--text-secondary)' }}>
              No celular, adicione o Nave à tela inicial para abrir mais rápido.
            </p>
            {installPwaPending ? (
              <button
                type="button"
                className="btn-outline"
                style={{ fontSize: '0.78rem', padding: '5px 10px', minHeight: 32 }}
                onClick={handlePwaDone}
              >
                Já instalei o app
              </button>
            ) : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}
