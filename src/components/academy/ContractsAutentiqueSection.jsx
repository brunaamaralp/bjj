import React from 'react';
import { FileSignature } from 'lucide-react';

/**
 * Checklist de webhook Autentique (owner). Detalhes em docs/contracts-autentique.md
 */
export default function ContractsAutentiqueSection() {
  return (
    <section className="empresa-section mt-6 animate-in" style={{ animationDelay: '0.08s' }}>
      <h3 className="navi-section-heading mb-2 flex items-center gap-2">
        <FileSignature size={18} strokeWidth={1.75} aria-hidden />
        Contratos digitais (Autentique)
      </h3>
      <div className="card" style={{ padding: 16 }}>
        <p className="navi-subtitle mb-3" style={{ fontSize: '0.85rem' }}>
          O status dos contratos atualiza automaticamente via webhook. Configure uma vez em produção:
        </p>
        <ol className="text-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>
            Painel Autentique → Webhooks → URL:{' '}
            <code>https://www.navefit.com/api/webhooks/autentique</code>
          </li>
          <li>
            Vercel → <code>AUTENTIQUE_WEBHOOK_SECRET</code> = segredo exibido no painel
          </li>
          <li>Confirmar eventos de documento e assinatura habilitados</li>
          <li>Testar com contrato em sandbox; usar &quot;Atualizar&quot; em /contratos se o webhook ainda não estiver ativo</li>
        </ol>
        <p className="text-small text-muted mt-3" style={{ marginBottom: 0 }}>
          Documentação completa: <code>docs/contracts-autentique.md</code>
        </p>
      </div>
    </section>
  );
}
