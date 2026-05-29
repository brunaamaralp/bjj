import React, { useState } from 'react';
import {
  isOutboundImagePlaceholder,
  inboxImageCaption,
  openExternalUrl
} from '../../lib/inboxMediaUtils.js';

export default function InboxMediaImage({
  mediaUrl,
  mediaStored,
  content,
  caption: captionProp,
  onOpenLightbox,
  whatsAppChatUrl
}) {
  const url = String(mediaUrl || '').trim();
  const caption = captionProp ?? inboxImageCaption(content);
  const outbound = isOutboundImagePlaceholder(content);

  const [loadState, setLoadState] = useState(() => {
    if (outbound) return 'outbound';
    if (mediaStored === false) return 'unavailable';
    if (!url) return 'unavailable';
    return 'loading';
  });

  if (outbound) {
    return (
      <div className="inbox-media-image">
        <div className="inbox-media-fallback" role="status">
          <span className="inbox-media-fallback__icon" aria-hidden>
            📤
          </span>
          <div className="inbox-media-fallback__title">Imagem enviada pelo celular</div>
          <div className="inbox-media-fallback__sub">(não disponível no painel)</div>
        </div>
      </div>
    );
  }

  const showUnavailable = loadState === 'unavailable' || loadState === 'error';

  if (showUnavailable) {
    return (
      <div className="inbox-media-image">
        <div className="inbox-media-fallback" role="status">
          <span className="inbox-media-fallback__icon" aria-hidden>
            🖼️
          </span>
          <div className="inbox-media-fallback__title">Imagem indisponível</div>
          {url ? (
            <button
              type="button"
              className="btn btn-outline inbox-media-fallback__btn"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrl(url);
              }}
            >
              ↓ Ver no WhatsApp
            </button>
          ) : whatsAppChatUrl ? (
            <button
              type="button"
              className="btn btn-outline inbox-media-fallback__btn"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrl(whatsAppChatUrl);
              }}
            >
              ↓ Ver no WhatsApp
            </button>
          ) : null}
        </div>
        {caption ? <p className="inbox-media-caption">{caption}</p> : null}
      </div>
    );
  }

  return (
    <div className="inbox-media-image">
      {loadState === 'loading' ? <div className="inbox-media-image__skeleton" aria-hidden /> : null}
      {url ? (
        <img
          src={url}
          alt="Imagem"
          className={`inbox-media-image__img${loadState === 'loaded' ? ' inbox-media-image__img--visible' : ''}`}
          loading="lazy"
          decoding="async"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenLightbox?.(url);
          }}
          onLoad={() => setLoadState('loaded')}
          onError={() => setLoadState('error')}
        />
      ) : null}
      {caption ? <p className="inbox-media-caption">{caption}</p> : null}
    </div>
  );
}
