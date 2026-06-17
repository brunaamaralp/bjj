import React from 'react';
import { CheckCircle2, Circle, ExternalLink, X } from 'lucide-react';
import { AUTOMACOES_COPY } from '../../lib/automacoesCopy.js';
import {
  computeWizardProgressPercent,
  isWizardExternalStep,
  resolveWizardCtaLabel,
} from '../../lib/automacoesSetupWizard.js';

/**
 * @param {{
 *   steps: { id: string; label: string; title: string; description: string; done: boolean; ctaLabel: string; ctaHint?: string }[];
 *   currentStep: { id: string; title: string; description: string; ctaLabel: string; ctaHint?: string };
 *   doneCount: number;
 *   totalSteps: number;
 *   onDismiss: () => void;
 *   activeTab?: string;
 *   onStepAction: (stepId: string) => void;
 *   primaryCtaDisabled?: boolean;
 *   primaryCtaBlockedHint?: string;
 * }} props
 */
export default function AutomacoesSetupWizard({
  steps,
  currentStep,
  activeTab = '',
  doneCount,
  totalSteps,
  onDismiss,
  onStepAction,
  primaryCtaDisabled = false,
  primaryCtaBlockedHint = '',
  className = '',
}) {
  if (!steps?.length || !currentStep) return null;

  const { percent: progressPct, value: progressValue, max: progressMax } = computeWizardProgressPercent(
    steps,
    currentStep.id,
    totalSteps
  );
  const externalStep = isWizardExternalStep(currentStep);

  return (
    <section
      className={`automacoes-setup-wizard ${className}`.trim()}
      aria-label="Guia de configuração das mensagens automáticas"
    >
      <div className="automacoes-setup-wizard__head">
        <div>
          <p className="automacoes-setup-wizard__eyebrow">{AUTOMACOES_COPY.wizard.eyebrow}</p>
          <h2 className="automacoes-setup-wizard__title">{AUTOMACOES_COPY.wizard.title}</h2>
        </div>
        <button
          type="button"
          className="automacoes-setup-wizard__skip"
          onClick={onDismiss}
          aria-label="Pular guia de configuração"
        >
          <X size={16} aria-hidden />
          Pular guia
        </button>
      </div>

      <div
        className="automacoes-setup-wizard__progress-bar"
        role="progressbar"
        aria-valuenow={progressValue}
        aria-valuemin={0}
        aria-valuemax={progressMax}
        aria-label={`Progresso: passo ${progressValue} de ${progressMax}`}
      >
        <div className="automacoes-setup-wizard__progress-bar-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <ul className="automacoes-setup-wizard__steps" role="list" aria-label="Etapas da configuração">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStep.id && !step.done;
          return (
            <li key={step.id} className="automacoes-setup-wizard__step-item">
              <button
                type="button"
                className={[
                  'automacoes-setup-wizard__step-btn',
                  'automacoes-setup-wizard__step',
                  step.done ? 'automacoes-setup-wizard__step--done' : '',
                  isCurrent ? 'automacoes-setup-wizard__step--current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onStepAction(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Passo ${index + 1} de ${totalSteps}: ${step.label}${step.done ? ' — concluído' : ''}`}
              >
                {step.done ? (
                  <CheckCircle2 size={18} className="automacoes-setup-wizard__icon--done" aria-hidden />
                ) : (
                  <Circle size={18} className="automacoes-setup-wizard__icon--pending" aria-hidden />
                )}
                <span className="automacoes-setup-wizard__step-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="automacoes-setup-wizard__panel">
        <h3 className="automacoes-setup-wizard__panel-title">{currentStep.title}</h3>
        <p className="automacoes-setup-wizard__panel-desc">{currentStep.description}</p>
        {externalStep && currentStep.ctaHint ? (
          <p className="automacoes-setup-wizard__external-hint text-xs text-muted">{currentStep.ctaHint}</p>
        ) : null}
        {primaryCtaDisabled && primaryCtaBlockedHint ? (
          <p className="automacoes-setup-wizard__blocked-hint text-xs text-muted" role="status">
            {primaryCtaBlockedHint}
          </p>
        ) : null}
        <button
          type="button"
          className={externalStep ? 'btn-secondary automacoes-setup-wizard__cta' : 'btn-action-primary automacoes-setup-wizard__cta'}
          onClick={() => onStepAction(currentStep.id)}
          disabled={primaryCtaDisabled && !externalStep}
        >
          {externalStep ? <ExternalLink size={16} aria-hidden /> : null}
          {resolveWizardCtaLabel(currentStep, activeTab)}
        </button>
      </div>
    </section>
  );
}
