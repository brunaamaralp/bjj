import { useMemo } from 'react';
import { buildInboxThreadBlocks } from '../lib/inboxThreadBlocks.js';
import { inboxMessageKey } from '../lib/inboxMessageUtils.js';

/**
 * Blocos da thread, flags por mensagem e lista de fixadas para o painel de contexto.
 */
export function useInboxThreadDerived({ selectedPhone, selected, msgFlags }) {
  const threadBlocks = useMemo(
    () => buildInboxThreadBlocks(selected?.messages),
    [selected?.messages]
  );

  const selectedPhoneFlags = useMemo(() => {
    const phone = String(selectedPhone || '').trim();
    const base = msgFlags && typeof msgFlags === 'object' ? msgFlags : {};
    const cur = phone && base[phone] && typeof base[phone] === 'object' ? base[phone] : {};
    const pinned = cur.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
    const important = cur.important && typeof cur.important === 'object' ? cur.important : {};
    return { pinned, important };
  }, [msgFlags, selectedPhone]);

  const pinnedMessages = useMemo(() => {
    const pinned = selectedPhoneFlags.pinned || {};
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const list = [];
    for (const m of msgs) {
      const k = inboxMessageKey(m);
      if (!pinned[k]) continue;
      const content = String(m?.content || '').trim();
      list.push({ key: k, preview: content.length > 80 ? `${content.slice(0, 80)}…` : content });
    }
    return list;
  }, [selected, selectedPhoneFlags]);

  return { threadBlocks, selectedPhoneFlags, pinnedMessages };
}
