import React from 'react';
import { AlertCircle, Clock, RotateCw } from 'lucide-react';

function formatBubbleTime(timestamp, timeLabel) {
  if (timeLabel) return timeLabel;
  const raw = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || '').trim();
  if (!raw) return '';
  const d = timestamp instanceof Date ? timestamp : new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function senderToBubbleKind(sender) {
  const s = String(sender || 'user').trim().toLowerCase();
  if (s === 'human' || s === 'ai') return s;
  return 'user';
}

/**
 * Bolha de mensagem unificada (Inbox + Perfil).
 *
 * @param {'inbound'|'outbound'} direction
 * @param {'user'|'human'|'ai'} sender
 * @param {Date|string|null} timestamp
 * @param {string} [timeLabel] — rótulo já formatado (prioridade sobre timestamp)
 * @param {'optimistic'|'sent'|'error'|null} [status]
 * @param {(() => void)|null} [onRetry]
 * @param {'inner'|'standalone'} [layout] — inner: dentro de grupo inbox-bubble; standalone: linha completa
 */
export default function MessageBubble({
  direction = 'inbound',
  sender = 'user',
  timestamp = null,
  timeLabel = '',
  status = null,
  onRetry = null,
  showSenderLabel = false,
  senderLabel = '',
  selected = false,
  onClick = null,
  paddingTop = 0,
  layout = 'inner',
  children = null,
  content = '',
  metaExtra = null,
  actions = null,
  details = null,
  className = '',
  msgKey = '',
}) {
  const bubbleKind = senderToBubbleKind(sender);
  const alignEnd = direction === 'outbound';
  const isOptimistic = status === 'optimistic';
  const isError = status === 'error';
  const time = formatBubbleTime(timestamp, timeLabel);

  const msgClass = [
    'inbox-msg',
    selected ? 'selected' : '',
    isOptimistic ? 'inbox-msg--optimistic' : '',
    isError ? 'inbox-msg--failed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const body =
    children ||
    (content ? (
      <div className="inbox-msg-text inbox-msg-text--pre">{content}</div>
    ) : null);

  const metaBlock = (
    <div className="inbox-msg-meta">
      <span className="text-small inbox-msg-meta__time">
        {time}
        {isOptimistic ? (
          <Clock size={12} strokeWidth={2} className="inbox-msg-meta__status-icon" aria-hidden />
        ) : null}
        {isError ? (
          <AlertCircle
            size={12}
            strokeWidth={2}
            className="inbox-msg-meta__status-icon inbox-msg-meta__status-icon--danger"
            aria-hidden
          />
        ) : null}
        {metaExtra}
      </span>
      {actions || (isError && onRetry) ? (
        <div className="inbox-msg-actions">
          {isError && onRetry ? (
            <button
              type="button"
              className="inbox-msg-retry-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRetry();
              }}
            >
              <RotateCw size={12} strokeWidth={2} aria-hidden />
              Reenviar
            </button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );

  const messageInner = (
    <>
      {showSenderLabel ? (
        <div
          className={`inbox-msg-sender-label ${
            bubbleKind === 'ai' ? 'inbox-msg-sender-label--ai' : 'inbox-msg-sender-label--human'
          }`}
        >
          {senderLabel || (bubbleKind === 'ai' ? 'IA' : 'Você')}
        </div>
      ) : null}
      {body}
      {metaBlock}
      {details}
    </>
  );

  const messageShell = (
    <div
      className={msgClass}
      style={{ paddingTop }}
      {...(msgKey ? { 'data-msgkey': msgKey } : {})}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {messageInner}
    </div>
  );

  if (layout === 'standalone') {
    return (
      <div className={`inbox-msg-row ${alignEnd ? 'inbox-msg-row--end' : 'inbox-msg-row--start'}`}>
        <div className={`inbox-bubble inbox-bubble--${bubbleKind}`}>{messageShell}</div>
      </div>
    );
  }

  return messageShell;
}

export function messageBubbleStatusFromMessage(m) {
  if (m?._sendFailed) return 'error';
  if (m?._optimistic) return 'optimistic';
  return null;
}

export function messageBubbleSenderFromMessage(m, { outgoing = false } = {}) {
  if (!outgoing) return 'user';
  const sender = String(m?.sender || '').trim().toLowerCase();
  if (sender === 'human' || sender === 'humano') return 'human';
  if (sender === 'ai' || sender === 'agent' || sender === 'agente') return 'ai';
  const hasAiHints = Boolean(m?.in_reply_to) || (m?.classificacao && typeof m.classificacao === 'object');
  return hasAiHints ? 'ai' : 'human';
}
