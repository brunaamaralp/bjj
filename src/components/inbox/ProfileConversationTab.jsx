import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Sparkles, WifiOff } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useInboxDeferredBoot } from '../../hooks/useInboxDeferredBoot';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { useLeadStore } from '../../store/useLeadStore';
import { isAgentAutoReplyEnabled } from '../../../lib/inboxHandoffPresentation.js';
import { isWhatsAppIntegrationConnected, isWhatsAppIntegrationDisconnected } from '../../lib/whatsappIntegrationState.js';
import { useProfileInboxComposer } from '../../hooks/useProfileInboxComposer.js';
import InboxComposer from './InboxComposer';
import NaviChatThread from '../chat-widget/NaviChatThread';
import ProfileConversationEmpty from './ProfileConversationEmpty.jsx';
import ProfileWhatsAppOfflineEmptyActions from '../profile/ProfileWhatsAppOfflineEmptyActions.jsx';
import ProfileWhatsAppOfflinePanelBanner from '../profile/ProfileWhatsAppOfflinePanelBanner.jsx';
import { primaryInboxPhone } from '../../lib/normalizeInboxPhone.js';

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
  const aiModuleEnabled = useLeadStore((s) => s.modules?.aiEnabled !== false);
  const { agentIaActive } = useInboxDeferredBoot(academyId);

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
    sendOutbound,
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
  const waConnected = isWhatsAppIntegrationConnected(waStatus, waStatusChecked);
  const waOfflineUi = isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked);

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

  const { composerProps, composerDisabled, composerPlaceholder } = useProfileInboxComposer({
    academyId,
    phone: rawPhone,
    leadId: leadIdStr,
    leadName,
    summary,
    isMobile: false,
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
  const showAiHandoffBanner =
    isAgentAutoReplyEnabled(agentIaActive, aiModuleEnabled) &&
    Boolean(summary?.handoff) &&
    !handoffBannerDismissed;
  const inboxHref = phoneDigits ? `/inbox?phone=${encodeURIComponent(phoneDigits)}` : '/inbox';

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

  if (!waStatusChecked || loading) {
    return (
      <div className="profile-conversation-tab profile-conversation-tab--loading">
        <NaviChatThread loading displayName={displayName} suppressEmpty />
      </div>
    );
  }

  if (waOfflineUi && !hasMessages) {
    return (
      <ProfileConversationEmpty
        icon={WifiOff}
        title="WhatsApp não conectado"
        description="Conecte o WhatsApp em Agente IA para enviar e receber mensagens por aqui."
        action={<ProfileWhatsAppOfflineEmptyActions phoneDigits={phoneDigits} />}
      />
    );
  }

  return (
    <div className="profile-conversation-tab">
      {waOfflineUi ? <ProfileWhatsAppOfflinePanelBanner /> : null}

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
        waOfflineUi={waOfflineUi}
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
        {...composerProps}
        compactDisabled={composerDisabled}
        compactPlaceholder={composerPlaceholder}
      />
    </div>
  );
}
