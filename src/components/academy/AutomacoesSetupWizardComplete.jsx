import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function AutomacoesSetupWizardComplete() {
  return (
    <section
      className="automacoes-setup-wizard automacoes-setup-wizard--below-tabs automacoes-setup-wizard--complete"
      role="status"
      aria-live="polite"
    >
      <div className="automacoes-setup-wizard__complete-inner">
        <CheckCircle2 size={28} className="automacoes-setup-wizard__complete-icon" aria-hidden />
        <div>
          <h2 className="automacoes-setup-wizard__complete-title">Tudo pronto!</h2>
          <p className="automacoes-setup-wizard__complete-desc">
            Modelos, WhatsApp e gatilhos configurados. Você pode ajustar quando quiser.
          </p>
        </div>
      </div>
    </section>
  );
}
