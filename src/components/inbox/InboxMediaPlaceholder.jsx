import React from 'react';
import { openExternalUrl } from '../../lib/inboxMediaUtils.js';

const COPY = {
  video: { icon: '🎬', title: 'Vídeo recebido', link: 'Abrir no WA ↗' },
  document: { icon: '📄', title: 'Documento', link: 'Abrir no WA ↗' },
  sticker: { icon: '🗒️', title: 'Sticker recebido', link: null }
};

export default function InboxMediaPlaceholder({ kind, mediaUrl, fileName, onClickStop }) {
  const meta = COPY[kind] || COPY.document;
  const url = String(mediaUrl || '').trim();
  const showLink = Boolean(url && kind !== 'sticker' && meta.link);

  return (
    <div
      className="inbox-media-placeholder"
      onClick={onClickStop}
      onKeyDown={onClickStop}
      role="group"
    >
      <div className="inbox-media-placeholder__row">
        <span className="inbox-media-placeholder__icon" aria-hidden>
          {meta.icon}
        </span>
        <div className="inbox-media-placeholder__body">
          <div className="inbox-media-placeholder__title">{meta.title}</div>
          {kind === 'document' && fileName ? (
            <div className="inbox-media-placeholder__sub">{fileName}</div>
          ) : null}
          {showLink ? (
            <button
              type="button"
              className="inbox-media-placeholder__link"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrl(url);
              }}
            >
              {meta.link}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
