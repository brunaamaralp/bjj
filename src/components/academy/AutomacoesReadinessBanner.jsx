import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

/**
 * @param {{ readiness: { ready: boolean; steps: { id: string; ok: boolean; label: string }[] }; showModelsLink?: boolean }} props
 */
export default function AutomacoesReadinessBanner({ readiness, showModelsLink = true }) {
  if (!readiness) return null;
  const { ready, steps } = readiness;

  return (
    <div
      className={`automacoes-readiness ${ready ? 'automacoes-readiness--ok' : 'automacoes-readiness--pending'}`}
      role="status"
    >
      <div className="automacoes-readiness-head">
        {ready ? (
          <CheckCircle2 size={18} aria-hidden />
        ) : (
          <AlertCircle size={18} aria-hidden />
        )}
        <strong>{ready ? 'Pronto para enviar automaticamente' : 'Complete a configuração'}</strong>
      </div>
      <ul className="automacoes-readiness-steps">
        {steps.map((step) => (
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
  );
}
