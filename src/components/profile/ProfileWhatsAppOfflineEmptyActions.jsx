import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { INTEGRACOES_WHATSAPP_PATH } from '../../lib/integracoesRoutes.js';
import { buildWhatsAppChatUrl, openExternalUrl } from '../../lib/inboxMediaUtils.js';

/**
 * CTAs do empty offline — configurar integração + escape hatch wa.me (envio manual).
 */
export default function ProfileWhatsAppOfflineEmptyActions({ phoneDigits, compact = false }) {
  const whatsAppChatUrl = useMemo(() => buildWhatsAppChatUrl(phoneDigits), [phoneDigits]);

  return (
    <div className={`profile-wa-offline-empty-actions${compact ? ' profile-wa-offline-empty-actions--compact' : ''}`}>
      <Link to={INTEGRACOES_WHATSAPP_PATH} className="btn btn-primary">
        Configurar WhatsApp
      </Link>
      {whatsAppChatUrl ? (
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => openExternalUrl(whatsAppChatUrl)}
          >
            Abrir WhatsApp Web
          </button>
          <p className="profile-wa-offline-empty-actions__hint">
            Envio manual — não registra no histórico do app.
          </p>
        </>
      ) : null}
    </div>
  );
}
