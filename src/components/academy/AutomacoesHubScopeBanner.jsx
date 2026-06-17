import React from 'react';
import StatusBanner from '../shared/StatusBanner.jsx';

/** Mapa das duas trilhas do hub Automações (Processos × WhatsApp). */
export default function AutomacoesHubScopeBanner({ className = '' }) {
  return (
    <StatusBanner variant="info" className={`automacoes-hub-scope-banner ${className}`.trim()}>
      <p className="automacoes-hub-scope-banner__text" style={{ margin: 0, lineHeight: 1.5 }}>
        <strong>Processos:</strong> checklists que alguém executa no CRM.{' '}
        <strong>WhatsApp:</strong> modelos e gatilhos que enviam mensagem sozinhos quando o número está
        conectado no Agente IA.
      </p>
    </StatusBanner>
  );
}
