import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Sparkles, WifiOff } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import InboxComposer from './InboxComposer';
import NaviChatThread from '../chat-widget/NaviChatThread';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';

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

export default function ProfileConversationTab({
  phone: rawPhone,
  academyId,
  leadName,
  leadId,
  onSummaryChange,
  onRequestEditPhone,
}) {
  const displayName = String(leadName || '').trim() || 'o contato';
  const phoneDigits = primaryInboxPhone(rawPhone);
  const leadIdStr = String(leadId || '').trim();

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
  } = useInboxConversation({
    phone: rawPhone,
    leadId: leadIdStr,
    academyId,
    enabled: Boolean(academyId && (phoneDigits || leadIdStr)),
  });

  const { waStatus, waStatusChecked } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = !waStatusChecked || String(waStatus || '').trim() === 'connected';

  const [composerState, setComposerState] = useState({
    key: phoneDigits,
    draft: '',
    handoffBannerDismissed: false,
  });
  const draft = composerState.key === phoneDigits ? composerState.draft : '';
  const handoffBannerDismissed =
    composerState.key === phoneDigits ? composerState.handoffBannerDismissed : false;
  const setDraft = (value) => {
    setComposerState((prev) => ({
      key: phoneDigits,
      draft: typeof value === 'function' ? value(prev.key === phoneDigits ? prev.draft : '') : value,
      handoffBannerDismissed: prev.key === phoneDigits ? prev.handoffBannerDismissed : false,
    }));
  };
  const setHandoffBannerDismissed = (value) => {
    setComposerState((prev) => ({
      key: phoneDigits,
      draft: prev.key === phoneDigits ? prev.draft : '',
      handoffBannerDismissed: typeof value === 'function'
        ? value(prev.key === phoneDigits ? prev.handoffBannerDismissed : false)
        : value,
    }));
  };
  const textareaRef = useRef(null);
  const markedReadRef = useRef(false);
  const markedReadPhoneRef = useRef(phoneDigits);
  if (markedReadPhoneRef.current !== phoneDigits) {
    markedReadPhoneRef.current = phoneDigits;
    markedReadRef.current = false;
  }

  useEffect(() => {
    if (loading || markedReadRef.current) return;
    if ((summary?.unread_count ?? 0) > 0) {
      markedReadRef.current = true;
      void markRead();
    }
  }, [loading, summary?.unread_count, markRead]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);

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

  if (!phoneDigits && !leadIdStr) {
    return (
      <ProfileConversationEmpty
        icon={MessageCircle}
        title="Nenhum telefone cadastrado"
        description="Adicione o telefone do contato para ver o histórico de mensagens."
        action={
          onRequestEditPhone ? (
            <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onRequestEditPhone}>
              Adicionar telefone
            </button>
          ) : null
        }
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

      <NaviChatThread
        messages={messages}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        displayName={displayName}
        phoneDigits={phoneDigits}
        inboxHref={inboxHref}
        waConnected={waConnected}
        onLoadMore={loadMore}
        onRetry={refresh}
        retryFailedMessage={retryFailedMessage}
      />

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
        compactPlaceholder="Digite uma mensagem…"
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
