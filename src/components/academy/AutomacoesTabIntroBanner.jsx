import React from 'react';
import { Link } from 'react-router-dom';
import StatusBanner from '../shared/StatusBanner.jsx';
import { AUTOMACOES_COPY } from '../../lib/automacoesCopy.js';

/**
 * @param {{ tabId: 'processos' | 'modelos' | 'configuracoes'; className?: string }} props
 */
export default function AutomacoesTabIntroBanner({ tabId, className = '' }) {
  if (tabId === 'processos') {
    return (
      <StatusBanner variant="info" className={`automacoes-tab-intro-banner mb-3 ${className}`.trim()}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Esta aba não envia WhatsApp. Para mensagens automáticas, use{' '}
          <Link to="/automacoes?tab=modelos" className="edit-link">
            Modelos de Mensagem
          </Link>
          {' e '}
          <Link to="/automacoes?tab=configuracoes" className="edit-link">
            Configurações
          </Link>
          .
        </p>
      </StatusBanner>
    );
  }

  if (tabId === 'modelos') {
    return (
      <StatusBanner
        variant="info"
        className={`automacoes-tab-intro-banner mb-3 ${className}`.trim()}
        message={AUTOMACOES_COPY.tab.modelos.hint}
      />
    );
  }

  if (tabId === 'configuracoes') {
    return (
      <StatusBanner
        variant="info"
        className={`automacoes-tab-intro-banner mb-3 ${className}`.trim()}
        message={AUTOMACOES_COPY.tab.configuracoes.hint}
      />
    );
  }

  return null;
}
