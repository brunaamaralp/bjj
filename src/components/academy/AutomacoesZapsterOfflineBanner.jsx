import React from 'react';
import { Link } from 'react-router-dom';
import { INTEGRACOES_WHATSAPP_PATH } from '../../lib/integracoesRoutes.js';
import StatusBanner from '../shared/StatusBanner.jsx';
import { AUTOMACOES_COPY } from '../../lib/automacoesCopy.js';

/** Aviso quando Zapster/WhatsApp está offline na aba Configurações. */
export default function AutomacoesZapsterOfflineBanner({ className = '' }) {
  return (
    <StatusBanner variant="warning" className={`automacoes-zapster-offline-banner mb-3 ${className}`.trim()}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        {AUTOMACOES_COPY.readiness.zapsterOffline}{' '}
        <Link to={INTEGRACOES_WHATSAPP_PATH} className="edit-link">
          Abrir Integrações
        </Link>
      </p>
    </StatusBanner>
  );
}
