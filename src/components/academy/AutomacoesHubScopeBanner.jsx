import React from 'react';
import StatusBanner from '../shared/StatusBanner.jsx';
import { AUTOMACOES_COPY } from '../../lib/automacoesCopy.js';

/** Mapa das duas trilhas do hub Automações (Processos × WhatsApp). */
export default function AutomacoesHubScopeBanner({ className = '', onDismiss }) {
  return (
    <StatusBanner
      variant="info"
      className={`automacoes-hub-scope-banner ${className}`.trim()}
      action={
        onDismiss
          ? { onClick: onDismiss, label: AUTOMACOES_COPY.wizard.scopeBannerDismiss }
          : undefined
      }
    >
      <p className="automacoes-hub-scope-banner__text" style={{ margin: 0, lineHeight: 1.5 }}>
        <strong>Processos:</strong> checklists que alguém executa no CRM.{' '}
        <strong>WhatsApp:</strong> modelos e gatilhos que enviam mensagem sozinhos quando o número está
        conectado no Agente IA.
      </p>
    </StatusBanner>
  );
}
