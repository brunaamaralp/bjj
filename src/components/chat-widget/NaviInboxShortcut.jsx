import '../../styles/tokens/inbox.css';
import '../../styles/inbox.css';
import '../../styles/chat-widget.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { loadChatWidgetConversations } from '../../hooks/useChatWidgetConversationPicker.js';
import { useChatWidgetStore } from '../../store/useChatWidgetStore';
import { useLeadStore } from '../../store/useLeadStore';
import NaviChatWidget from './NaviChatWidget';
import NaviChatWidgetLauncherPanel from './NaviChatWidgetLauncherPanel';
import NaviInboxShortcutFab from './NaviInboxShortcutFab';

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

export default function NaviInboxShortcut({ academyId, commandBarOpen = false }) {
  const location = useLocation();
  const isMobile = useIsMobileViewport();

  const isPinned = useChatWidgetStore((s) => s.isPinned);
  const launcherOpen = useChatWidgetStore((s) => s.launcherOpen);
  const openPanel = useChatWidgetStore((s) => s.openPanel);
  const openLauncher = useChatWidgetStore((s) => s.openLauncher);
  const closeLauncher = useChatWidgetStore((s) => s.closeLauncher);
  const pinConversation = useChatWidgetStore((s) => s.pinConversation);
  const setShortcutLoading = useChatWidgetStore((s) => s.setShortcutLoading);
  const resetForAcademy = useChatWidgetStore((s) => s.resetForAcademy);

  const inboxUnread = useLeadStore((s) => s.inboxUnreadConversations);

  useEffect(() => {
    resetForAcademy(academyId);
  }, [academyId, resetForAcademy]);

  const hideOnRoute = useMemo(() => {
    if (location.pathname.startsWith('/inbox')) return true;
    if (/^\/lead\/[^/]+/.test(location.pathname)) return true;
    return false;
  }, [location.pathname]);

  const handleShortcutClick = useCallback(async () => {
    if (isPinned) {
      openPanel();
      return;
    }

    const unread = Math.max(0, Math.floor(Number(inboxUnread) || 0));
    if (unread > 0) {
      setShortcutLoading(true);
      try {
        const result = await loadChatWidgetConversations(academyId);
        const firstUnread = result.items.find((i) => Number(i?.unreadCount || 0) > 0);
        if (firstUnread) {
          pinConversation({
            phone: firstUnread.phone,
            leadId: firstUnread.leadId,
            leadName: firstUnread.leadName,
            academyId,
            openPanel: true,
          });
        } else {
          openLauncher();
        }
      } catch {
        openLauncher();
      } finally {
        setShortcutLoading(false);
      }
      return;
    }

    openLauncher();
  }, [
    academyId,
    inboxUnread,
    isPinned,
    openLauncher,
    openPanel,
    pinConversation,
    setShortcutLoading,
  ]);

  useEffect(() => {
    if (!launcherOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeLauncher();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [launcherOpen, closeLauncher]);

  if (isMobile || hideOnRoute) return null;
  if (typeof document === 'undefined') return null;

  if (isPinned) {
    return <NaviChatWidget academyId={academyId} commandBarOpen={commandBarOpen} />;
  }

  const content = (
    <div className="navi-chat-widget">
      {launcherOpen ? (
        <NaviChatWidgetLauncherPanel academyId={academyId} onClose={closeLauncher} />
      ) : (
        <NaviInboxShortcutFab onClick={handleShortcutClick} />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
