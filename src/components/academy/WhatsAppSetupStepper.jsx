import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AGENTE_IA_PATH, buildAgentIaSetupPath } from '../../lib/agentIaRoutes.js';
import { WA_SETUP_STEP_LABELS } from '../../lib/waSetupProgress.js';

const SETUP_FROM_INTEGRACOES_STATE = { fromIntegracoes: true };

export default function WhatsAppSetupStepper({
  waDone,
  configDone,
  activeDone,
  canEditAgent = true,
  currentStep = 1,
}) {
  const steps = [
    { n: 1, label: WA_SETUP_STEP_LABELS.connect, done: waDone, to: null },
    {
      n: 2,
      label: WA_SETUP_STEP_LABELS.configure,
      done: configDone,
      to: waDone && canEditAgent ? buildAgentIaSetupPath({ fromIntegracoes: true }) : null,
    },
    {
      n: 3,
      label: WA_SETUP_STEP_LABELS.activate,
      done: activeDone,
      to: configDone ? AGENTE_IA_PATH : null,
    },
  ];

  return (
    <div className="agent-ia-setup-panel" role="region" aria-label="Progresso da configuração">
      <div className="agent-ia-setup-steps">
        {steps.map((step) => {
          const stepClass = [
            'agent-ia-setup-step',
            step.done ? 'agent-ia-setup-step--done' : '',
            currentStep === step.n ? 'agent-ia-setup-step--current' : '',
          ]
            .filter(Boolean)
            .join(' ');

          const content = (
            <>
              <span className="agent-ia-setup-step__icon" aria-hidden>
                {step.done ? <Check size={14} strokeWidth={2.5} /> : step.n}
              </span>
              <span className="agent-ia-setup-step__label">{step.label}</span>
            </>
          );

          if (step.to && step.n > 1) {
            return (
              <Link
                key={step.n}
                to={step.to}
                state={step.n === 2 ? SETUP_FROM_INTEGRACOES_STATE : undefined}
                className={`${stepClass} agent-ia-setup-step--link`}
              >
                {content}
              </Link>
            );
          }

          return (
            <div key={step.n} className={stepClass}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
