import { useEffect, useRef, useState } from 'react';
import { realtime, DB_ID, CONVERSATIONS_COL } from '../lib/appwrite';
import {
  buildConversationsChannel,
  conversationEventToInboundPatch,
  shouldProcessConversationEvent,
  subscribeConversationsRealtime,
} from '../lib/conversationsRealtime.js';
import { emitFollowupInboundChanged, emitFollowupInboundRefresh } from '../lib/leadTimelineEvents.js';

/**
 * Appwrite Realtime em conversas → atualiza cache de inbound para retornos/hero.
 * @param {string} academyId
 * @param {{ enabled?: boolean }} [opts]
 */
export function useFollowupInboundRealtime(academyId, { enabled = true } = {}) {
  const [realtimeOn, setRealtimeOn] = useState(false);
  const academyIdRef = useRef(academyId);

  useEffect(() => {
    academyIdRef.current = academyId;
  }, [academyId]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setRealtimeOn(false);
      return undefined;
    }
    const aid = String(academyId || '').trim();
    if (!aid || !DB_ID || !CONVERSATIONS_COL) {
      setRealtimeOn(false);
      return undefined;
    }

    const channel = buildConversationsChannel(DB_ID, CONVERSATIONS_COL);
    const sub = subscribeConversationsRealtime({
      realtimeClient: realtime,
      channel,
      onConnected: () => setRealtimeOn(true),
      onError: () => setRealtimeOn(false),
      onEvent: (ev) => {
        const payload = ev && typeof ev === 'object' ? ev.payload : null;
        if (!shouldProcessConversationEvent(payload, academyIdRef.current)) return;
        const patch = conversationEventToInboundPatch(payload);
        if (patch) {
          emitFollowupInboundChanged({
            academyId: academyIdRef.current,
            leadId: patch.leadId,
            phone: patch.phone,
            lastUserMsgAt: patch.lastUserMsgAt,
          });
          return;
        }
        emitFollowupInboundRefresh(academyIdRef.current);
      },
    });

    return () => {
      sub.close();
      setRealtimeOn(false);
    };
  }, [academyId, enabled]);

  return { realtimeOn };
}
