import React, { useState } from 'react';
import InboxMessageText from './InboxMessageText.jsx';
import InboxMediaImage from './InboxMediaImage.jsx';
import InboxAudioPlayer from './InboxAudioPlayer.jsx';
import InboxMediaPlaceholder from './InboxMediaPlaceholder.jsx';
import {
  inboxMessageMediaUrl,
  inboxMessageMimeType,
  inboxMessageMediaStored,
  inboxMediaCaption,
  isOutboundImagePlaceholder,
  isOutboundAudioPlaceholder,
  isAudioPlaceholderContent,
  inboxOtherMediaPlaceholderKind,
  openExternalUrl,
} from '../../lib/inboxMediaUtils.js';

/** Campo na collection: cada item de `messages` usa `type` (image|audio|sticker|document|text). */
export function resolveInboxMessageDisplayType(message, contentRaw = '') {
  const typeLower = String(message?.type || '').toLowerCase();
  const content = String(contentRaw || message?.content || '');

  if (typeLower === 'ptt') return 'audio';
  if (typeLower) return typeLower;

  if (isOutboundImagePlaceholder(content)) return 'image';
  if (isOutboundAudioPlaceholder(content) || isAudioPlaceholderContent(content)) return 'audio';
  const other = inboxOtherMediaPlaceholderKind(message, content);
  if (other) return other;
  return 'text';
}

function StickerImage({ src, onClickStop }) {
  const [failed, setFailed] = useState(false);
  const url = String(src || '').trim();

  if (!url || failed) {
    return <InboxMediaPlaceholder kind="sticker" mediaUrl={url} onClickStop={onClickStop} />;
  }

  return (
    <img
      src={url}
      alt="Sticker"
      className="inbox-media-bubble__img inbox-media-bubble__img--sticker"
      loading="lazy"
      decoding="async"
      onClick={onClickStop}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        setFailed(true);
      }}
    />
  );
}

function DocumentBubble({ message, mediaUrl, content, onClickStop }) {
  const url = String(mediaUrl || '').trim();
  const fileName = String(message?.fileName || message?.file_name || '').trim();
  const label = fileName || inboxMediaCaption(content) || 'Documento';

  if (!url) {
    return (
      <InboxMediaPlaceholder
        kind="document"
        mediaUrl={url}
        fileName={fileName}
        onClickStop={onClickStop}
      />
    );
  }

  return (
    <div className="inbox-media-document" onClick={onClickStop} onKeyDown={onClickStop} role="group">
      <span className="inbox-media-document__icon" aria-hidden>
        📄
      </span>
      <div className="inbox-media-document__body">
        <div className="inbox-media-document__title">{label}</div>
        <button
          type="button"
          className="inbox-media-document__link"
          onClick={(e) => {
            e.stopPropagation();
            openExternalUrl(url);
          }}
        >
          Abrir documento ↗
        </button>
      </div>
    </div>
  );
}

/**
 * Renderização de mídia na bolha do chat (Inbox).
 * URL da mídia: `mediaUrl` / `storageFileId` — não `content` (legenda/texto).
 */
export default function MediaBubble({
  message,
  content: contentOverride,
  linkPills = false,
  onOpenLightbox,
  onReconcile,
  reconciling = false,
  whatsAppChatUrl = '',
  onClickStop,
}) {
  const content = contentOverride ?? String(message?.content || '');
  const type = resolveInboxMessageDisplayType(message, content);
  const mediaUrl = inboxMessageMediaUrl(message);
  const mimeType = inboxMessageMimeType(message);
  const mediaStored = inboxMessageMediaStored(message);

  switch (type) {
    case 'image':
      return (
        <InboxMediaImage
          mediaUrl={mediaUrl}
          mediaStored={mediaStored}
          content={content}
          onOpenLightbox={onOpenLightbox}
          whatsAppChatUrl={whatsAppChatUrl}
        />
      );

    case 'sticker':
      return <StickerImage src={mediaUrl} onClickStop={onClickStop} />;

    case 'audio':
      return (
        <InboxAudioPlayer
          mediaUrl={mediaUrl}
          mimeType={mimeType}
          mediaStored={mediaStored}
          content={content}
          duration={message?.duration}
          onReconcile={onReconcile}
          reconciling={reconciling}
          whatsAppChatUrl={whatsAppChatUrl}
        />
      );

    case 'document':
      return (
        <DocumentBubble
          message={message}
          mediaUrl={mediaUrl}
          content={content}
          onClickStop={onClickStop}
        />
      );

    case 'video':
      return (
        <InboxMediaPlaceholder
          kind="video"
          mediaUrl={mediaUrl}
          onClickStop={onClickStop}
        />
      );

    default:
      return <InboxMessageText content={content} linkPills={linkPills} />;
  }
}
