import React from 'react';
import { Link } from 'react-router-dom';
import { INTEGRACOES_WHATSAPP_PATH } from '../../lib/integracoesRoutes.js';
import StatusBanner from '../shared/StatusBanner.jsx';

/**
 * Aviso compacto quando a integração Zapster está offline (perfil lead/aluno).
 */
export default function ProfileWhatsAppOfflineBanner({ className = '' }) {
  return (
    <StatusBanner variant="warning" className={className}>
      <p className="profile-wa-offline-banner__text">
        WhatsApp desconectado — mensagens pelo app estão indisponíveis até reconectar.{' '}
        <Link to={INTEGRACOES_WHATSAPP_PATH} className="edit-link">
          Conectar WhatsApp
        </Link>
      </p>
    </StatusBanner>
  );
}
