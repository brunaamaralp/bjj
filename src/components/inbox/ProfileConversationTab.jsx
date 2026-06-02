import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Sparkles, WifiOff } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import ThreadSkeleton from './ThreadSkeleton';
import InboxComposer from './InboxComposer';
import MessageBubble, {
  messageBubbleSenderFromMessage,
  messageBubbleStatusFromMessage,
} from './MessageBubble.jsx';

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

function buildBlocks(messages) {
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

function ProfileConversationEmpty({ icon: Icon, title, description, action }) {
  return (
    <div className="profile-conversation-empty">
      {Icon ? <Icon size={40} strokeWidth={1.5} className="profile-conversation-empty__icon" aria-hidden /> : null}
      <div className="profile-conversation-empty__title">{title}</div>
      {description ? <p className="profile-conversation-empty__desc">{description}</p> : null}
      {action || null}
    </div>
  );
}

function HandoffBanner({ onDismiss }) {
  return (
    <div role="status" className="profile-conversation-handoff">
      <Sparkles size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <span className="profile-conversation-handoff__text">
        Agente IA respondendo — ao enviar, você assume o atendimento
      </span>
      <button type="button" className="btn btn-outline inbox-btn--ctx" onClick={onDismiss}>
        Ok
      </button>
    </div>
  );
}

export default function ProfileConversationTab({ phone: rawPhone, academyId, leadName }) {
  const displayName = String(leadName || '').trim() || 'o contato';
  const phoneDigits = String(rawPhone || '').replace(/\D/g, '');

  const {
    messages,
    summary,
    loading,
    loadingMore,
    sending,
    error,
    sendError,
    hasMore,
    loadMore,
    sendMessage,
    retryFailedMessage,
    markRead,
    refresh,
  } = useInboxConversation({ phone: rawPhone, academyId, enabled: Boolean(phoneDigits && academyId) });

  const { waStatus, waStatusChecked } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = !waStatusChecked || String(waStatus || '').trim() === 'connected';

  const [draft, setDraft] = useState('');
  const [handoffBannerDismissed, setHandoffBannerDismissed] = useState(false);
  const textareaRef = useRef(null);

  const scrollRef = useRef(null);
  const initialScrollDoneRef = useRef(false);
  const markedReadRef = useRef(false);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    markedReadRef.current = false;
    setHandoffBannerDismissed(false);
  }, [phoneDigits]);

  useEffect(() => {
    if (loading || markedReadRef.current) return;
    if ((summary?.unread_count ?? 0) > 0) {
      markedReadRef.current = true;
      void markRead();
    }
  }, [loading, summary?.unread_count, markRead]);

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
  }, [messages.length, sending, loading]);

  const blocks = useMemo(() => buildBlocks(messages), [messages]);
  const hasMessages = messages.length > 0;
  const showAiHandoffBanner = Boolean(summary?.handoff) && !handoffBannerDismissed;
  const inboxHref = phoneDigits ? `/inbox?phone=${encodeURIComponent(phoneDigits)}` : '/inbox';

  const handleSend = useCallback(async () => {
    const text = String(draft || '').trim();
    if (!text) return;
    const ok = await sendMessage(text);
    if (ok) setDraft('');
  }, [draft, sendMessage]);

  const handleDraftChange = useCallback((e) => {
    setDraft(e.target.value);
  }, []);

  if (!phoneDigits) {
    return (
      <ProfileConversationEmpty
        icon={MessageCircle}
        title="Nenhum telefone cadastrado"
        description="Adicione o telefone do aluno para ver o histórico de mensagens."
      />
    );
  }

  if (!waConnected && !loading && !hasMessages) {
    return (
      <ProfileConversationEmpty
        icon={WifiOff}
        title="WhatsApp não conectado"
        description="Configure o WhatsApp em Configurações → Agente IA para ver as conversas."
        action={
          <Link to="/agente-ia" className="btn btn-primary" style={{ marginTop: 8 }}>
            Configurar
          </Link>
        }
      />
    );
  }

  return (
    <div className="profile-conversation-tab">
      {!waConnected ? (
        <div role="status" className="profile-conversation-tab__wa-banner">
          WhatsApp desconectado — não é possível enviar mensagens
        </div>
      ) : null}

      <div ref={scrollRef} className="profile-conversation-tab__messages">
        {loading ? <ThreadSkeleton /> : null}

        {!loading && error ? (
          <div className="profile-conversation-error">
            <p className="profile-conversation-error__text">{error}</p>
            <button type="button" className="btn btn-outline" onClick={() => void refresh()}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error && !hasMessages ? (
          <ProfileConversationEmpty
            icon={MessageCircle}
            title="Nenhuma conversa ainda"
            description={`Quando ${displayName} enviar uma mensagem, ela aparecerá aqui.`}
            action={
              waConnected ? null : (
                <Link to={inboxHref} className="btn btn-outline" style={{ marginTop: 8 }}>
                  Abrir no Inbox
                </Link>
              )
            }
          />
        ) : null}

        {!loading && !error && hasMessages && hasMore ? (
          <div className="profile-conversation-load-more">
            <button
              type="button"
              className="btn btn-outline inbox-btn--ctx"
              disabled={loadingMore}
              onClick={() => void loadMore()}
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
              const content = String(b.m?.content || '').trim();
              if (!content) return null;
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
                  content={content}
                  onRetry={
                    sendFailed && mid && typeof retryFailedMessage === 'function'
                      ? () => void retryFailedMessage(mid)
                      : null
                  }
                />
              );
            })
          : null}
      </div>

      {sendError ? (
        <div role="alert" className="profile-conversation-send-error">
          {sendError}
        </div>
      ) : null}

      {showAiHandoffBanner ? (
        <HandoffBanner onDismiss={() => setHandoffBannerDismissed(true)} />
      ) : null}

      <InboxComposer
        mode="compact"
        compactDisabled={!waConnected}
        compactPlaceholder="Digite uma mensagem..."
        draft={draft}
        setDraft={setDraft}
        handleDraftChange={handleDraftChange}
        sendManual={handleSend}
        sending={sending}
        selectedPhone={phoneDigits}
        textareaRef={textareaRef}
        inboxVvInset={0}
        isMobile={false}
      />
    </div>
  );
}
