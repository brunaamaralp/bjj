import React from 'react';
import { Info } from 'lucide-react';

/**
 * @param {{ message: string; ctaLabel: string; onCta: () => void; className?: string }} props
 */
export default function AutomacoesSetupWizardCompact({ message, ctaLabel, onCta, className = '' }) {
  if (!message) return null;

  return (
    <div
      className={`automacoes-setup-wizard automacoes-setup-wizard--compact ${className}`.trim()}
      role="status"
      aria-label="Configuração de mensagens automáticas pendente"
    >
      <Info size={18} className="automacoes-setup-wizard__compact-icon" aria-hidden />
      <p className="automacoes-setup-wizard__compact-text">{message}</p>
      <button type="button" className="edit-link automacoes-setup-wizard__compact-cta" onClick={onCta}>
        {ctaLabel}
      </button>
    </div>
  );
}
