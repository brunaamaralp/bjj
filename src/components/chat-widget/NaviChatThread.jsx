import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import ThreadSkeleton from '../inbox/ThreadSkeleton';
import MessageBubble, {
  messageBubbleSenderFromMessage,
  messageBubbleStatusFromMessage,
} from '../inbox/MessageBubble.jsx';
import MediaBubble, { resolveInboxMessageDisplayType } from '../inbox/MediaBubble.jsx';
import { buildWhatsAppChatUrl } from '../../lib/inboxMediaUtils.js';

function formatDayLabel(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dd.getTime() - nn.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function formatTimeOnly(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function messageKey(m, idx) {
  const mid = String(m?.message_id || '').trim();
  if (mid) return mid;
  const role = String(m?.role || '').trim();
  const ts = String(m?.timestamp || '').trim();
  const content = String(m?.content || '').trim();
  return `${role}:${ts}:${content.slice(0, 80)}:${idx}`;
}

function isOutgoingMessage(m) {
  return m?.role === 'assistant';
}

export function buildChatThreadBlocks(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const out = [];
  let lastDayKey = '';
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    const ts = String(m?.timestamp || '').trim();
    const d = ts ? new Date(ts) : null;
    const dayKey =
      d && Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '';
    if (dayKey && dayKey !== lastDayKey) {
      out.push({
        type: 'day',
        key: dayKey,
        label: formatDayLabel(ts) || d.toLocaleDateString('pt-BR'),
      });
      lastDayKey = dayKey;
    }
    out.push({
      type: 'message',
      key: messageKey(m, i),
      m,
      outgoing: isOutgoingMessage(m),
    });
  }
  return out;
}

export function chatMessagePreview(m) {
  const contentRaw = String(m?.content || '').trim();
  const displayType = resolveInboxMessageDisplayType(m, contentRaw);
  if (displayType !== 'text') return null;
  return contentRaw;
}

export function chatMessageHasVisibleBody(m) {
  const contentRaw = String(m?.content || '').trim();
  const displayType = resolveInboxMessageDisplayType(m, contentRaw);
  if (displayType !== 'text') return true;
  return Boolean(contentRaw);
}

function ChatThreadEmpty({ icon: Icon, title, description, action }) {
  return (
    <div className="profile-conversation-empty">
      {Icon ? <Icon size={40} strokeWidth={1.5} className="profile-conversation-empty__icon" aria-hidden /> : null}
      <div className="profile-conversation-empty__title">{title}</div>
      {description ? <p className="profile-conversation-empty__desc">{description}</p> : null}
      {action || null}
    </div>
  );
}

export default function NaviChatThread({
  messages = [],
  loading = false,
  loadingMore = false,
  error = null,
  hasMore = false,
  displayName = 'o contato',
  phoneDigits = '',
  inboxHref = '/inbox',
  waConnected = true,
  hideInboxLink = false,
  suppressEmpty = false,
  onLoadMore,
  onRetry,
  retryFailedMessage,
  scrollClassName = 'profile-conversation-tab__messages',
}) {
  const scrollRef = useRef(null);
  const initialScrollDoneRef = useRef(false);
  const phoneKey = String(phoneDigits || '').trim();

  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [phoneKey]);

  useEffect(() => {
    if (loading || initialScrollDoneRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      initialScrollDoneRef.current = true;
    });
  }, [loading, messages]);

  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, loading]);

  const blocks = useMemo(() => buildChatThreadBlocks(messages), [messages]);
  const hasMessages = messages.length > 0;
  const whatsAppChatUrl = buildWhatsAppChatUrl(phoneDigits);

  return (
    <div ref={scrollRef} className={scrollClassName}>
      {loading ? <ThreadSkeleton /> : null}

      {!loading && error ? (
        <div className="profile-conversation-error">
          <p className="profile-conversation-error__text">{error}</p>
          {onRetry ? (
            <button type="button" className="btn btn-outline" onClick={() => void onRetry()}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && !hasMessages && !suppressEmpty ? (
        <ChatThreadEmpty
          icon={MessageCircle}
          title="Nenhuma conversa ainda"
          description={`Quando ${displayName} enviar uma mensagem, ela aparecerá aqui.`}
          action={
            !waConnected && !hideInboxLink ? (
              <Link to={inboxHref} className="btn btn-outline" style={{ marginTop: 8 }}>
                Abrir no Inbox
              </Link>
            ) : null
          }
        />
      ) : null}

      {!loading && !error && hasMessages && hasMore ? (
        <div className="profile-conversation-load-more">
          <button
            type="button"
            className="btn btn-outline inbox-btn--ctx"
            disabled={loadingMore}
            onClick={() => void onLoadMore?.()}
          >
            {loadingMore ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        </div>
      ) : null}

      {!loading && !error && hasMessages
        ? blocks.map((b) => {
            if (b.type === 'day') {
              return (
                <div key={b.key} className="inbox-day-divider">
                  <span className="text-small inbox-day-divider__pill">{b.label}</span>
                </div>
              );
            }
            if (!chatMessageHasVisibleBody(b.m)) return null;
            const contentRaw = String(b.m?.content || '').trim();
            const displayType = resolveInboxMessageDisplayType(b.m, contentRaw);
            const isMedia = displayType !== 'text';
            const textContent = chatMessagePreview(b.m) || '';
            const mid = String(b.m?.message_id || '').trim();
            const sendFailed = Boolean(b.m?._sendFailed);
            const deliveryStatus = messageBubbleStatusFromMessage(b.m);
            return (
              <MessageBubble
                key={b.key}
                msgKey={b.key}
                layout="standalone"
                direction={b.outgoing ? 'outbound' : 'inbound'}
                sender={messageBubbleSenderFromMessage(b.m, { outgoing: b.outgoing })}
                timestamp={b.m?.timestamp}
                timeLabel={formatTimeOnly(b.m?.timestamp)}
                status={deliveryStatus}
                content={isMedia ? '' : textContent}
                onRetry={
                  sendFailed && mid && typeof retryFailedMessage === 'function'
                    ? () => void retryFailedMessage(mid)
                    : null
                }
              >
                {isMedia ? (
                  <MediaBubble
                    message={b.m}
                    content={contentRaw}
                    whatsAppChatUrl={whatsAppChatUrl}
                  />
                ) : null}
              </MessageBubble>
            );
          })
        : null}
    </div>
  );
}
