import '../../styles/chat-widget.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, MessageCircle, Minus, Sparkles, User, WifiOff, X } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useInboxDeferredBoot } from '../../hooks/useInboxDeferredBoot';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';
import { useLeadStore } from '../../store/useLeadStore';
import { isAgentAutoReplyEnabled } from '../../../lib/inboxHandoffPresentation.js';
import { isWhatsAppIntegrationConnected, isWhatsAppIntegrationDisconnected } from '../../lib/whatsappIntegrationState.js';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';
import { useProfileInboxComposer } from '../../hooks/useProfileInboxComposer.js';
import InboxComposer from '../inbox/InboxComposer';
import ProfileConversationEmpty from '../inbox/ProfileConversationEmpty.jsx';
import ProfileWhatsAppOfflineEmptyActions from '../profile/ProfileWhatsAppOfflineEmptyActions.jsx';
import ProfileWhatsAppOfflinePanelBanner from '../profile/ProfileWhatsAppOfflinePanelBanner.jsx';
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
  embedded = false,
  hideProfileLink = false,
  onMinimize,
  onClose,
  onSummaryChange,
  onRequestEditPhone,
}) {
  const navigate = useNavigate();
  const switchConversation = useChatWidgetStore((s) => s.switchConversation);
  const setLeadName = useChatWidgetStore((s) => s.setLeadName);
  const aiModuleEnabled = useLeadStore((s) => s.modules?.aiEnabled !== false);
  const { agentIaActive } = useInboxDeferredBoot(academyId);
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
    sendOutbound,
    retryFailedMessage,
    markRead,
    refresh,
  } = useInboxConversation({
    phone: activePhone,
    leadId: leadIdStr,
    academyId,
    enabled: Boolean(academyId && (phoneDigits || leadIdStr)),
  });

  const { waStatus, waStatusChecked } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = isWhatsAppIntegrationConnected(waStatus, waStatusChecked);
  const waOfflineUi = isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked);
  const hasMessages = messages.length > 0;
  const showWaStatusLoading = !waStatusChecked;
  const showOfflineEmpty = waOfflineUi && !loading && !hasMessages;
  const showComposer = waStatusChecked && !showOfflineEmpty;

  const [handoffState, setHandoffState] = useState({
    key: phoneDigits,
    dismissed: false,
  });
  const handoffBannerDismissed =
    handoffState.key === phoneDigits ? handoffState.dismissed : false;
  const setHandoffBannerDismissed = (value) => {
    setHandoffState((prev) => ({
      key: phoneDigits,
      dismissed:
        typeof value === 'function'
          ? value(prev.key === phoneDigits ? prev.dismissed : false)
          : value,
    }));
  };

  const [compactDraftState, setCompactDraftState] = useState({ key: phoneDigits, draft: '' });
  const compactDraft = compactDraftState.key === phoneDigits ? compactDraftState.draft : '';
  const setCompactDraft = useCallback((value) => {
    setCompactDraftState((prev) => ({
      key: phoneDigits,
      draft: typeof value === 'function' ? value(prev.key === phoneDigits ? prev.draft : '') : value,
    }));
  }, [phoneDigits]);
  const compactTextareaRef = useRef(null);

  const { composerProps, composerDisabled, composerPlaceholder } = useProfileInboxComposer({
    academyId,
    phone: activePhone,
    leadId: leadIdStr,
    leadName,
    summary,
    isMobile,
    waConnected,
    sendOutbound,
    sending,
  });
  const markedReadRef = useRef(false);
  const markedReadPhoneRef = useRef(phoneDigits);

  useEffect(() => {
    if (markedReadPhoneRef.current !== phoneDigits) {
      markedReadPhoneRef.current = phoneDigits;
      markedReadRef.current = false;
    }
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
    onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);

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

  const showAiHandoffBanner =
    isAgentAutoReplyEnabled(agentIaActive, aiModuleEnabled) &&
    Boolean(summary?.handoff) &&
    !handoffBannerDismissed;
  const inboxHref = phoneDigits ? `/inbox?phone=${encodeURIComponent(phoneDigits)}` : '/inbox';
  const resolvedName = String(leadName || summary?.lead_name || '').trim() || displayName;
  const profileHref = String(summary?.lead_id || leadIdStr || '').trim()
    ? `/lead/${encodeURIComponent(String(summary?.lead_id || leadIdStr))}`
    : null;

  const handleCompactSend = useCallback(async () => {
    const text = String(compactDraft || '').trim();
    if (!text) return;
    const ok = await sendMessage(text);
    if (ok) setCompactDraft('');
  }, [compactDraft, sendMessage, setCompactDraft]);

  const handleCompactDraftChange = useCallback((e) => {
    setCompactDraft(e.target.value);
  }, [setCompactDraft]);

  const handleSwitch = useCallback(
    (next) => {
      switchConversation(next);
    },
    [switchConversation]
  );

  if (!phoneDigits && !leadIdStr && embedded) {
    return (
      <div
        className={`navi-chat-widget__panel navi-chat-widget__panel--embedded${isMobile && !embedded ? ' navi-chat-widget__panel--mobile' : ''}`}
        role="region"
        aria-label="Conversa WhatsApp"
      >
        <header className="navi-chat-widget__header">
          <span className="navi-chat-widget__header-name" style={{ flex: 1, padding: '4px 6px' }}>
            Conversa
          </span>
          <div className="navi-chat-widget__header-actions">
            <button
              type="button"
              className="navi-chat-widget__icon-btn"
              title="Recolher"
              aria-label="Recolher conversa"
              onClick={onMinimize}
            >
              <Minus size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="navi-chat-widget__icon-btn"
              title="Fechar"
              aria-label="Fechar conversa"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>
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
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={[
        'navi-chat-widget__panel',
        isMobile && !embedded ? 'navi-chat-widget__panel--mobile' : '',
        embedded ? 'navi-chat-widget__panel--embedded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={embedded ? 'region' : 'dialog'}
      aria-label={`Conversa WhatsApp com ${resolvedName}`}
      aria-modal={embedded ? undefined : 'false'}
    >
      {isMobile && !embedded ? <div className="navi-chat-widget__sheet-handle" aria-hidden /> : null}

      <header className="navi-chat-widget__header">
        <NaviChatWidgetSwitcher
          academyId={academyId}
          activePhone={phoneDigits}
          leadName={resolvedName}
          profileImageUrl={String(summary?.whatsapp_profile_image_url || '').trim()}
          onSelect={handleSwitch}
          panelOpen
        />
        <div className="navi-chat-widget__header-actions">
          {profileHref && !hideProfileLink ? (
            <Link
              to={profileHref}
              className="navi-chat-widget__icon-btn"
              title="Ver perfil"
              aria-label="Ver perfil do contato"
            >
              <User size={16} strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
          {!embedded ? (
            <button
              type="button"
              className="navi-chat-widget__icon-btn"
              title="Abrir no Inbox"
              aria-label="Abrir no Inbox"
              onClick={() => navigate(inboxHref)}
            >
              <ExternalLink size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
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
        {showOfflineEmpty ? (
          <ProfileConversationEmpty
            icon={WifiOff}
            title="WhatsApp não conectado"
            description="Conecte o WhatsApp em Agente IA para enviar e receber mensagens por aqui."
            action={<ProfileWhatsAppOfflineEmptyActions phoneDigits={phoneDigits} />}
          />
        ) : (
          <>
            {waOfflineUi ? <ProfileWhatsAppOfflinePanelBanner /> : null}

            <NaviChatThread
              messages={messages}
              loading={loading || showWaStatusLoading}
              loadingMore={loadingMore}
              error={error}
              hasMore={hasMore}
              displayName={resolvedName}
              phoneDigits={phoneDigits}
              inboxHref={inboxHref}
              waConnected={waConnected}
              waOfflineUi={waOfflineUi}
              hideInboxLink={embedded}
              suppressEmpty={waOfflineUi && !hasMessages}
              onLoadMore={loadMore}
              onRetry={refresh}
              retryFailedMessage={retryFailedMessage}
              scrollClassName="navi-chat-widget__messages"
            />
          </>
        )}
      </div>

      {sendError ? (
        <div role="alert" className="profile-conversation-send-error">
          {sendError}
        </div>
      ) : null}

      {showAiHandoffBanner ? (
        <HandoffBanner onDismiss={() => setHandoffBannerDismissed(true)} />
      ) : null}

      {showComposer ? (
        <div className="navi-chat-widget__composer">
          {embedded ? (
            <InboxComposer
              {...composerProps}
              compactDisabled={composerDisabled}
              compactPlaceholder={composerPlaceholder}
            />
          ) : (
            <InboxComposer
              mode="compact"
              compactDisabled={!waConnected}
              compactPlaceholder={composerPlaceholder}
              draft={compactDraft}
              setDraft={setCompactDraft}
              handleDraftChange={handleCompactDraftChange}
              sendManual={handleCompactSend}
              sending={sending}
              selectedPhone={phoneDigits}
              textareaRef={compactTextareaRef}
              inboxVvInset={0}
              isMobile={isMobile}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
