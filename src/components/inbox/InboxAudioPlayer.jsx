import React, { useState } from 'react';
import {
  canPlayOgg,
  isOutboundAudioPlaceholder,
  inboxMediaCaption,
  openExternalUrl
} from '../../lib/inboxMediaUtils.js';

function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Math.floor(n);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function InboxAudioPlayer({
  mediaUrl,
  mimeType,
  mediaStored,
  content,
  duration,
  onReconcile,
  reconciling,
  whatsAppChatUrl
}) {
  const url = String(mediaUrl || '').trim();
  const mime = String(mimeType || 'audio/ogg').trim().toLowerCase();
  const outbound = isOutboundAudioPlaceholder(content);
  const [playError, setPlayError] = useState(false);

  if (outbound) {
    return (
      <div className="inbox-media-audio">
        <div className="inbox-media-fallback" role="status">
          <span className="inbox-media-fallback__icon" aria-hidden>
            📤
          </span>
          <div className="inbox-media-fallback__title">Áudio enviado pelo celular</div>
          <div className="inbox-media-fallback__sub">(não disponível no painel)</div>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="inbox-media-audio">
        <div className="inbox-media-fallback" role="status">
          <span className="inbox-media-fallback__icon" aria-hidden>
            🎵
          </span>
          <div className="inbox-media-fallback__title">Áudio recebido</div>
          <div className="inbox-media-fallback__sub">(link não disponível)</div>
          {onReconcile ? (
            <button
              type="button"
              className="btn btn-outline inbox-media-fallback__btn"
              disabled={reconciling}
              onClick={(e) => {
                e.stopPropagation();
                onReconcile();
              }}
            >
              {reconciling ? 'Sincronizando…' : '↺ Sincronizar WhatsApp'}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const oggUnsupported = mime.includes('ogg') && !canPlayOgg();

  if (oggUnsupported || playError) {
    const openUrl = url || whatsAppChatUrl;
    return (
      <div className="inbox-media-audio">
        <div className="inbox-media-fallback" role="status">
          <span className="inbox-media-fallback__icon" aria-hidden>
            🎵
          </span>
          <div className="inbox-media-fallback__title">Áudio recebido</div>
          <div className="inbox-media-fallback__sub">
            {playError
              ? 'Áudio indisponível — link expirado ou bloqueado'
              : 'Seu navegador não reproduz este formato'}
          </div>
          {onReconcile && mediaStored !== true ? (
            <button
              type="button"
              className="btn btn-outline inbox-media-fallback__btn"
              disabled={reconciling}
              onClick={(e) => {
                e.stopPropagation();
                onReconcile();
              }}
            >
              {reconciling ? 'Sincronizando…' : '↺ Sincronizar WhatsApp'}
            </button>
          ) : null}
          {openUrl ? (
            <button
              type="button"
              className="btn btn-outline inbox-media-fallback__btn"
              onClick={(e) => {
                e.stopPropagation();
                openExternalUrl(openUrl);
              }}
            >
              Abrir no WhatsApp ↗
            </button>
          ) : null}
        </div>
        {inboxMediaCaption(content) ? (
          <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginTop: 8 }}>
            {inboxMediaCaption(content)}
          </div>
        ) : null}
      </div>
    );
  }

  const durationLabel = formatDuration(duration);

  return (
    <div className="inbox-media-audio" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="inbox-media-audio__player-wrap">
        <span className="inbox-media-audio__icon" aria-hidden>
          🎵
        </span>
        <audio
          className="inbox-media-audio__native"
          controls
          src={url}
          preload="metadata"
          onError={() => setPlayError(true)}
        />
        {durationLabel ? (
          <span className="inbox-media-audio__duration text-small">{durationLabel}</span>
        ) : null}
      </div>
      {mediaStored === false ? (
        <p className="inbox-media-audio__hint text-small">Link temporário — pode expirar em breve.</p>
      ) : null}
      {inboxMediaCaption(content) ? (
        <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginTop: 8 }}>
          {inboxMediaCaption(content)}
        </div>
      ) : null}
    </div>
  );
}
