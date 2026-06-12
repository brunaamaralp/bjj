import React from 'react';
import StatusBanner from '../shared/StatusBanner.jsx';
import { MAX_INBOX_LIST_ITEMS } from '../../lib/inboxListCap.js';

export default function InboxGlobalBanners({
  showWaDisconnectBanner,
  onReconnectWhatsApp,
  error,
  listCapped,
}) {
  return (
    <>
      {showWaDisconnectBanner ? (
        <StatusBanner
          variant="warning"
          className="inbox-global-error"
          action={{ label: 'Reconectar →', onClick: onReconnectWhatsApp }}
        >
          WhatsApp desconectado — as mensagens não estão chegando.
        </StatusBanner>
      ) : null}

      {error ? <StatusBanner variant="error" message={error} className="inbox-global-error" /> : null}

      {listCapped ? (
        <StatusBanner variant="info" className="inbox-global-error inbox-list-cap-banner">
          Exibindo as {MAX_INBOX_LIST_ITEMS} conversas mais recentes em memória. Use a busca ou filtros para encontrar
          contatos fora desta janela.
        </StatusBanner>
      ) : null}
    </>
  );
}
