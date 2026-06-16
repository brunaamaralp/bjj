import React from 'react';
import { Link } from 'react-router-dom';

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
      <Link to="/agente-ia" className="profile-conversation-tab__wa-banner-link">
        Reconectar
      </Link>
    </div>
  );
}
