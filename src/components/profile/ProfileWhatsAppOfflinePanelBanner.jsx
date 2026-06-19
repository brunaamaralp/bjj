import React from 'react';
import { Link } from 'react-router-dom';
import { INTEGRACOES_WHATSAPP_PATH } from '../../lib/integracoesRoutes.js';

/** Banner inline no painel Conversa quando offline com histórico. */
export default function ProfileWhatsAppOfflinePanelBanner({ className = '' }) {
  return (
    <div
      role="status"
      className={`profile-conversation-tab__wa-banner${className ? ` ${className}` : ''}`}
    >
      <span className="profile-conversation-tab__wa-banner-text">
        WhatsApp desconectado — não é possível enviar mensagens
      </span>
      <Link to={INTEGRACOES_WHATSAPP_PATH} className="profile-conversation-tab__wa-banner-link">
        Reconectar
      </Link>
    </div>
  );
}
