import React from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { resolveWizardCtaLabel } from '../../lib/automacoesSetupWizard.js';

/**
 * @param {{
 *   steps: { id: string; label: string; title: string; description: string; done: boolean; ctaLabel: string }[];
 *   currentStep: { id: string; title: string; description: string; ctaLabel: string };
 *   doneCount: number;
 *   totalSteps: number;
 *   onDismiss: () => void;
 *   activeTab?: string;
 *   onStepAction: (stepId: string) => void;
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
  className = '',
}) {
  if (!steps?.length || !currentStep) return null;

  return (
    <section
      className={`automacoes-setup-wizard ${className}`.trim()}
      aria-label="Guia de configuração das automações"
    >
      <div className="automacoes-setup-wizard__head">
        <div>
          <p className="automacoes-setup-wizard__eyebrow">Primeira configuração</p>
          <h2 className="automacoes-setup-wizard__title">Configure suas automações em 3 passos</h2>
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

      <ol className="automacoes-setup-wizard__steps">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStep.id && !step.done;
          return (
            <li
              key={step.id}
              className={[
                'automacoes-setup-wizard__step',
                step.done ? 'automacoes-setup-wizard__step--done' : '',
                isCurrent ? 'automacoes-setup-wizard__step--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {step.done ? (
                <CheckCircle2 size={18} className="automacoes-setup-wizard__icon--done" aria-hidden />
              ) : (
                <Circle size={18} className="automacoes-setup-wizard__icon--pending" aria-hidden />
              )}
              <span className="automacoes-setup-wizard__step-label">
                <span className="automacoes-setup-wizard__step-num">{index + 1}.</span> {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="automacoes-setup-wizard__panel">
        <p className="automacoes-setup-wizard__progress" role="status">
          Passo {Math.min(doneCount + 1, totalSteps)} de {totalSteps}
        </p>
        <h3 className="automacoes-setup-wizard__panel-title">{currentStep.title}</h3>
        <p className="automacoes-setup-wizard__panel-desc">{currentStep.description}</p>
        <button
          type="button"
          className="btn-action-primary"
          onClick={() => onStepAction(currentStep.id)}
        >
          {resolveWizardCtaLabel(currentStep, activeTab)}
        </button>
      </div>
    </section>
  );
}
