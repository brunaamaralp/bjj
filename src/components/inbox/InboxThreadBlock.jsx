import React from 'react';
import MessageBubble, { messageBubbleStatusFromMessage } from './MessageBubble.jsx';
import InboxMediaImage from './InboxMediaImage.jsx';
import InboxAudioPlayer from './InboxAudioPlayer.jsx';
import InboxMediaPlaceholder from './InboxMediaPlaceholder.jsx';
import InboxMediaTempLinkBadge from './InboxMediaTempLinkBadge.jsx';
import {
  buildWhatsAppChatUrl,
  inboxMessageMediaStored,
  inboxMessageMimeType,
  inboxOtherMediaPlaceholderKind,
  isOutboundAudioPlaceholder,
  isOutboundImagePlaceholder,
} from '../../lib/inboxMediaUtils.js';
import {
  INBOX_MSG_TRUNCATE_CHARS,
  isInboxTruncatableTextMessage,
  truncateInboxMessageText,
} from '../../lib/inboxUiConstants.js';

function inboxContentIsAudioPlaceholder(content) {
  const s = String(content || '').trim();
  return /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(s);
}

export default function InboxThreadBlock({ block, expandedMsgs, ...ctx }) {
  const {
    selectedPhone,
    selectedPhoneRef,
    selectedMsgKey,
    setSelectedMsgKey,
    setExpandedMsgs,
    menu,
    openMenu,
    formatWhen,
    formatTimeOnly,
    copyToClipboard,
    inboxMessageMediaUrl,
    selectedPhoneFlags,
    senderKindFromMessage,
    setImageLightboxUrl,
    reconcileLast24h,
    waSyncing,
    setDraft,
    textareaRef,
    cancelScheduledMessage,
    cancelingMsgId,
    retryFailedMessage,
  } = ctx;

  if (!block || typeof block !== 'object') return null;

  if (block.type === 'day') {
    return (
      <div className="inbox-day-divider">
        <span className="text-small inbox-day-divider__pill">{block.label}</span>
      </div>
    );
  }

  const g = block;
  return (
    <div className={`inbox-msg-row ${g.alignEnd ? 'inbox-msg-row--end' : 'inbox-msg-row--start'}`}>
      <div className={`inbox-bubble inbox-bubble--${g.bubbleKind || 'user'}`}>
        {g.items.map(({ key, m }, idx) => {
          const contentRaw = String(m?.content || '');
          const mediaUrlNorm = inboxMessageMediaUrl(m);
          const typeLower = String(m?.type || '').toLowerCase();
          const audioPlaceholder = inboxContentIsAudioPlaceholder(contentRaw);
          const otherMediaKind = inboxOtherMediaPlaceholderKind(m, contentRaw);
          const isImageMsg = typeLower === 'image' || isOutboundImagePlaceholder(contentRaw);
          const isAudioMsg =
            typeLower === 'audio' ||
            typeLower === 'ptt' ||
            audioPlaceholder ||
            isOutboundAudioPlaceholder(contentRaw);
          const mediaStored = inboxMessageMediaStored(m);
          const mimeType = inboxMessageMimeType(m);
          const showTempBadge = mediaStored === false && Boolean(mediaUrlNorm) && (isImageMsg || isAudioMsg);
          const whatsAppChatUrl = buildWhatsAppChatUrl(selectedPhone);
          const stopBubbleClick = (e) => e.stopPropagation();
          const expanded = Boolean(expandedMsgs && typeof expandedMsgs === 'object' && expandedMsgs[key]);
          const isTextMsg = isInboxTruncatableTextMessage(m, {
            isImageMsg,
            isAudioMsg,
            otherMediaKind,
          });
          const isLongMsg = isTextMsg && contentRaw.length > INBOX_MSG_TRUNCATE_CHARS;
          const content =
            !expanded && isLongMsg
              ? truncateInboxMessageText(contentRaw, INBOX_MSG_TRUNCATE_CHARS)
              : contentRaw;
          const statusLower = String(m?.status || '').trim().toLowerCase();
          const scheduledAt = typeof m?.send_at === 'string' ? String(m.send_at) : '';
          const canceledAt = typeof m?.canceled_at === 'string' ? String(m.canceled_at) : '';
          const isScheduled = statusLower === 'scheduled' && !!scheduledAt;
          const isCanceled = statusLower === 'canceled';
          const mine = m?.role === 'assistant';
          const mid = String(m?.message_id || '').trim();
          const canCancel = mine && (statusLower === 'scheduled' || statusLower === 'pending') && !!mid;
          const isSelected = String(selectedMsgKey || '') === key;
          const pinned = Boolean(selectedPhoneFlags?.pinned && selectedPhoneFlags.pinned[key]);
          const important = Boolean(selectedPhoneFlags?.important && selectedPhoneFlags.important[key]);
          const senderKind = senderKindFromMessage(m);
          const senderLabel = senderKind === 'ai' ? 'Agente IA' : senderKind === 'human' ? 'Humano' : 'Cliente';
          const bubbleSender = g.bubbleKind === 'user' ? 'user' : g.bubbleKind === 'ai' ? 'ai' : 'human';
          const sendFailed = Boolean(m?._sendFailed);
          const deliveryStatus = messageBubbleStatusFromMessage(m);
          const metaExtra = (
            <>
              {pinned ? ' • Fixada' : ''}
              {important ? ' • Importante' : ''}
            </>
          );

          return (
            <MessageBubble
              key={`${key}-${idx}`}
              msgKey={key}
              layout="inner"
              direction={g.alignEnd ? 'outbound' : 'inbound'}
              sender={bubbleSender}
              timestamp={m?.timestamp}
              timeLabel={formatTimeOnly(m?.timestamp) || formatWhen(m?.timestamp)}
              status={deliveryStatus}
              onRetry={
                sendFailed && mid && typeof retryFailedMessage === 'function'
                  ? () => retryFailedMessage(mid)
                  : null
              }
              showSenderLabel={idx === 0 && g.bubbleKind !== 'user'}
              senderLabel={g.bubbleKind === 'ai' ? 'IA' : 'Você'}
              selected={isSelected}
              paddingTop={idx === 0 ? 0 : 2}
              onClick={() => setSelectedMsgKey((v) => (String(v || '') === key ? '' : key))}
              metaExtra={metaExtra}
              actions={
                <>
                  <button
                    className="inbox-mini-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const base = contentRaw.replace(/\s+/g, ' ').trim();
                      const snippet = base.length > 120 ? `${base.slice(0, 120)}…` : base;
                      if (snippet) {
                        setDraft((prev) => {
                          const p = String(prev || '');
                          const prefix = p.trim() ? `${p}\n\n` : '';
                          return `${prefix}Respondendo: "${snippet}"\n\n`;
                        });
                        try {
                          textareaRef.current?.focus?.();
                        } catch {
                          void 0;
                        }
                      }
                    }}
                  >
                    Responder
                  </button>
                  <button
                    className="inbox-mini-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      copyToClipboard(contentRaw);
                    }}
                  >
                    Copiar
                  </button>
                  <button
                    className="inbox-mini-btn inbox-mini-btn--menu"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openMenu('message', e.currentTarget, {
                        key,
                        phone: String(selectedPhoneRef.current || '').trim(),
                        m,
                        canCancel,
                      });
                    }}
                    aria-haspopup="menu"
                    aria-expanded={menu?.kind === 'message' && menu?.payload?.key === key}
                  >
                    {'\u22EF'}
                  </button>
                </>
              }
              details={
                isSelected ? (
                  <div className="inbox-msg-details">
                    <span className="text-small inbox-msg-details__item">{senderLabel}</span>
                    {!!String(statusLower || '').trim() && (
                      <span className="text-small inbox-msg-details__item">Status: {statusLower}</span>
                    )}
                    {isScheduled && (
                      <span className="text-small inbox-msg-details__item">
                        Agendada: {formatWhen(scheduledAt)}
                      </span>
                    )}
                    {isCanceled && (
                      <span className="text-small inbox-msg-details__item">
                        Cancelada: {canceledAt ? formatWhen(canceledAt) : '—'}
                      </span>
                    )}
                    {canCancel && (
                      <button
                        className="btn btn-outline inbox-msg-details__btn"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          cancelScheduledMessage(mid);
                        }}
                        disabled={Boolean(cancelingMsgId) || cancelingMsgId === mid}
                      >
                        {cancelingMsgId === mid ? 'Cancelando…' : 'Cancelar agendamento'}
                      </button>
                    )}
                  </div>
                ) : null
              }
            >
              {showTempBadge ? <InboxMediaTempLinkBadge /> : null}
              {otherMediaKind ? (
                <InboxMediaPlaceholder
                  kind={otherMediaKind}
                  mediaUrl={mediaUrlNorm}
                  fileName={m?.fileName}
                  onClickStop={stopBubbleClick}
                />
              ) : isAudioMsg ? (
                <InboxAudioPlayer
                  mediaUrl={mediaUrlNorm}
                  mimeType={mimeType}
                  mediaStored={mediaStored}
                  content={contentRaw}
                  duration={m?.duration}
                  onReconcile={reconcileLast24h}
                  reconciling={waSyncing}
                  whatsAppChatUrl={whatsAppChatUrl}
                />
              ) : isImageMsg ? (
                <InboxMediaImage
                  mediaUrl={mediaUrlNorm}
                  mediaStored={mediaStored}
                  content={contentRaw}
                  onOpenLightbox={setImageLightboxUrl}
                  whatsAppChatUrl={whatsAppChatUrl}
                />
              ) : (
                <div className="inbox-msg-text inbox-msg-text--pre">{content}</div>
              )}
              {isLongMsg && (
                <button
                  className="inbox-bubble-expand"
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpandedMsgs((prev) => {
                      const base = prev && typeof prev === 'object' ? { ...prev } : {};
                      if (expanded) delete base[key];
                      else base[key] = true;
                      return base;
                    });
                  }}
                >
                  {expanded ? 'Ver menos ↑' : 'Ver mais ↓'}
                </button>
              )}
            </MessageBubble>
          );
        })}
      </div>
    </div>
  );
}
