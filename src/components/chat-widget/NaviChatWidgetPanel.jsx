import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Minus, Sparkles, User, X } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';
import InboxComposer from '../inbox/InboxComposer';
import NaviChatThread from './NaviChatThread';
import NaviChatWidgetSwitcher from './NaviChatWidgetSwitcher';

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

export default function NaviChatWidgetPanel({
  academyId,
  activePhone,
  leadId,
  leadName,
  isMobile = false,
  onMinimize,
  onClose,
}) {
  const navigate = useNavigate();
  const switchConversation = useChatWidgetStore((s) => s.switchConversation);
  const setLeadName = useChatWidgetStore((s) => s.setLeadName);
  const panelRef = useRef(null);

  const phoneDigits = primaryInboxPhone(activePhone);
  const leadIdStr = String(leadId || '').trim();
  const displayName = String(leadName || '').trim() || 'o contato';

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
    phone: activePhone,
    leadId: leadIdStr,
    academyId,
    enabled: Boolean(academyId && phoneDigits),
  });

  const { waStatus, waStatusChecked } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = !waStatusChecked || String(waStatus || '').trim() === 'connected';

  const [draft, setDraft] = useState('');
  const [handoffBannerDismissed, setHandoffBannerDismissed] = useState(false);
  const textareaRef = useRef(null);
  const markedReadRef = useRef(false);

  useEffect(() => {
    markedReadRef.current = false;
    setHandoffBannerDismissed(false);
    setDraft('');
  }, [phoneDigits]);

  useEffect(() => {
    const fromSummary = String(summary?.lead_name || '').trim();
    if (fromSummary && fromSummary !== leadName) setLeadName(fromSummary);
  }, [summary?.lead_name, leadName, setLeadName]);

  useEffect(() => {
    if (loading || markedReadRef.current) return;
    if ((summary?.unread_count ?? 0) > 0) {
      markedReadRef.current = true;
      void markRead();
    }
  }, [loading, summary?.unread_count, markRead]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      onMinimize?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onMinimize]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    const focusable = el.querySelector(
      'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus?.();
    return undefined;
  }, [phoneDigits]);

  const showAiHandoffBanner = Boolean(summary?.handoff) && !handoffBannerDismissed;
  const inboxHref = phoneDigits ? `/inbox?phone=${encodeURIComponent(phoneDigits)}` : '/inbox';
  const resolvedName = String(leadName || summary?.lead_name || '').trim() || displayName;
  const profileImageUrl = String(summary?.whatsapp_profile_image_url || '').trim();
  const profileHref = String(summary?.lead_id || leadIdStr || '').trim()
    ? `/lead/${encodeURIComponent(String(summary?.lead_id || leadIdStr))}`
    : null;

  const handleSend = useCallback(async () => {
    const text = String(draft || '').trim();
    if (!text) return;
    const ok = await sendMessage(text);
    if (ok) setDraft('');
  }, [draft, sendMessage]);

  const handleDraftChange = useCallback((e) => {
    setDraft(e.target.value);
  }, []);

  const handleSwitch = useCallback(
    (next) => {
      switchConversation(next);
    },
    [switchConversation]
  );

  return (
    <div
      ref={panelRef}
      className={`navi-chat-widget__panel${isMobile ? ' navi-chat-widget__panel--mobile' : ''}`}
      role="dialog"
      aria-label={`Conversa WhatsApp com ${resolvedName}`}
      aria-modal="false"
    >
      {isMobile ? <div className="navi-chat-widget__sheet-handle" aria-hidden /> : null}

      <header className="navi-chat-widget__header">
        <NaviChatWidgetSwitcher
          academyId={academyId}
          activePhone={phoneDigits}
          leadName={resolvedName}
          profileImageUrl={profileImageUrl}
          onSelect={handleSwitch}
          panelOpen
        />
        <div className="navi-chat-widget__header-actions">
          {profileHref ? (
            <Link
              to={profileHref}
              className="navi-chat-widget__icon-btn"
              title="Ver perfil"
              aria-label="Ver perfil do contato"
            >
              <User size={16} strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
          <button
            type="button"
            className="navi-chat-widget__icon-btn"
            title="Abrir no Inbox"
            aria-label="Abrir no Inbox"
            onClick={() => navigate(inboxHref)}
          >
            <ExternalLink size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="navi-chat-widget__icon-btn"
            title="Minimizar"
            aria-label="Minimizar conversa"
            onClick={onMinimize}
          >
            <Minus size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="navi-chat-widget__icon-btn"
            title="Fechar"
            aria-label="Fechar conversa fixada"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </header>

      <div className="navi-chat-widget__body">
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
          displayName={resolvedName}
          phoneDigits={phoneDigits}
          inboxHref={inboxHref}
          waConnected={waConnected}
          onLoadMore={loadMore}
          onRetry={refresh}
          retryFailedMessage={retryFailedMessage}
          scrollClassName="navi-chat-widget__messages"
        />
      </div>

      {sendError ? (
        <div role="alert" className="profile-conversation-send-error">
          {sendError}
        </div>
      ) : null}

      {showAiHandoffBanner ? (
        <HandoffBanner onDismiss={() => setHandoffBannerDismissed(true)} />
      ) : null}

      <div className="navi-chat-widget__composer">
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
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}
