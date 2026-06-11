import '../../styles/tokens/inbox.css';
import '../../styles/inbox.css';
import '../../styles/chat-widget.css';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import NaviChatWidgetBubble from './NaviChatWidgetBubble';
import NaviChatWidgetPanel from './NaviChatWidgetPanel';

const MOBILE_BP = 1024;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

export default function NaviChatWidget({ academyId, commandBarOpen = false }) {
  const isMobile = useIsMobileViewport();

  const isPinned = useChatWidgetStore((s) => s.isPinned);
  const isOpen = useChatWidgetStore((s) => s.isOpen);
  const activePhone = useChatWidgetStore((s) => s.activePhone);
  const leadId = useChatWidgetStore((s) => s.leadId);
  const leadName = useChatWidgetStore((s) => s.leadName);
  const openPanel = useChatWidgetStore((s) => s.openPanel);
  const minimizePanel = useChatWidgetStore((s) => s.minimizePanel);
  const closeWidget = useChatWidgetStore((s) => s.closeWidget);
  const resetForAcademy = useChatWidgetStore((s) => s.resetForAcademy);

  const { summary } = useInboxConversation({
    phone: activePhone,
    leadId,
    academyId,
    enabled: Boolean(isPinned && academyId && activePhone && !isOpen),
  });

  useEffect(() => {
    resetForAcademy(academyId);
  }, [academyId, resetForAcademy]);

  useEffect(() => {
    if (commandBarOpen && isOpen) minimizePanel();
  }, [commandBarOpen, isOpen, minimizePanel]);

  if (!isPinned) return null;
  if (typeof document === 'undefined') return null;

  const unreadCount = Number(summary?.unread_count || 0);
  const resolvedName = String(leadName || summary?.lead_name || '').trim() || 'Conversa';

  const content = (
    <div className={`navi-chat-widget${isMobile ? ' navi-chat-widget--mobile' : ''}`}>
      {isOpen ? (
        <NaviChatWidgetPanel
          academyId={academyId}
          activePhone={activePhone}
          leadId={leadId}
          leadName={leadName}
          isMobile={isMobile}
          onMinimize={minimizePanel}
          onClose={closeWidget}
        />
      ) : (
        <NaviChatWidgetBubble
          leadName={resolvedName}
          profileImageUrl={String(summary?.whatsapp_profile_image_url || '').trim()}
          unreadCount={unreadCount}
          isMobile={isMobile}
          onOpen={openPanel}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
