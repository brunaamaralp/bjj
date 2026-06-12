import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

/**
 * @param {{
 *   readiness: {
 *     infraReady?: boolean;
 *     ready?: boolean;
 *     infraSteps?: { id: string; ok: boolean; label: string }[];
 *     activationLabel?: string;
 *     activeCount?: number;
 *   };
 *   showModelsLink?: boolean;
 * }} props
 */
export default function AutomacoesReadinessBanner({ readiness, showModelsLink = true }) {
  if (!readiness) return null;

  const infraSteps = readiness.infraSteps || readiness.steps || [];
  const infraReady = readiness.infraReady ?? readiness.ready ?? false;
  const activationLabel = readiness.activationLabel || '';
  const activeCount = Number(readiness.activeCount) || 0;

  return (
    <div className="automacoes-readiness-stack">
      <div
        className={`automacoes-readiness ${infraReady ? 'automacoes-readiness--ok' : 'automacoes-readiness--pending'}`}
        role="status"
      >
        <div className="automacoes-readiness-head">
          {infraReady ? (
            <CheckCircle2 size={18} aria-hidden />
          ) : (
            <AlertCircle size={18} aria-hidden />
          )}
          <strong>{infraReady ? 'Infraestrutura pronta' : 'Antes de ativar os gatilhos'}</strong>
        </div>
        <ul className="automacoes-readiness-steps">
          {infraSteps.map((step) => (
            <li key={step.id}>
              {step.ok ? (
                <CheckCircle2 size={14} className="automacoes-readiness-icon--ok" aria-hidden />
              ) : (
                <Circle size={14} className="automacoes-readiness-icon--pending" aria-hidden />
              )}
              <span>{step.label}</span>
              {step.id === 'zapster' && !step.ok ? (
                <Link to="/agente-ia" className="edit-link" style={{ marginLeft: 6, fontSize: '0.85rem' }}>
                  Abrir Agente IA
                </Link>
              ) : null}
              {step.id === 'templates' && !step.ok && showModelsLink ? (
                <Link
                  to="/automacoes?tab=modelos"
                  className="edit-link"
                  style={{ marginLeft: 6, fontSize: '0.85rem' }}
                >
                  Modelos
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <p
        className={`automacoes-activation-summary${activeCount > 0 ? ' automacoes-activation-summary--active' : ''}`}
        role="status"
      >
        {activationLabel}
      </p>
    </div>
  );
}
