import React from 'react';
import { Link } from 'react-router-dom';
import StatusBanner from '../shared/StatusBanner.jsx';
import { AUTOMACOES_COPY } from '../../lib/automacoesCopy.js';

/**
 * @param {{ tabId: 'modelos' | 'gatilhos'; className?: string }} props
 */
export default function AutomacoesTabIntroBanner({ tabId, className = '' }) {
  if (tabId === 'modelos') {
    return (
      <StatusBanner
        variant="info"
        className={`automacoes-tab-intro-banner mb-3 ${className}`.trim()}
        message={AUTOMACOES_COPY.tab.modelos.hint}
      />
    );
  }

  if (tabId === 'gatilhos') {
    return (
      <StatusBanner
        variant="info"
        className={`automacoes-tab-intro-banner mb-3 ${className}`.trim()}
        message={AUTOMACOES_COPY.tab.gatilhos.hint}
      />
    );
  }

  return null;
}
