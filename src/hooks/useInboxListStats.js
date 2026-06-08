import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { getInboxJwt, safeParseInboxJson } from '../lib/inboxApiUtils.js';

const DEFAULT_STATS = {
  resolvedCount: 0,
  transferredCount: 0,
  needsMeBacklog: 0,
  unreadBacklog: 0,
};

/**
 * Contadores do header da inbox via GET /api/conversations?stats=1.
 */
export function useInboxListStats({ academyId, listFilter }) {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const loadingRef = useRef(false);

  const refreshStats = useCallback(async () => {
    const id = String(academyId || '').trim();
    if (!id || loadingRef.current) return;
    if (listFilter === 'archived') return;
    loadingRef.current = true;
    try {
      const jwt = await getInboxJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/conversations?stats=1', {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': id },
      });
      if (blocked || !resp.ok) return;
      const raw = await resp.text();
      const data = safeParseInboxJson(raw) || {};
      setStats({
        unreadBacklog: Math.max(0, Math.floor(Number(data?.unread_conversations ?? 0))),
        needsMeBacklog: Math.max(0, Math.floor(Number(data?.needs_me ?? 0))),
        resolvedCount: Math.max(0, Math.floor(Number(data?.resolved ?? 0))),
        transferredCount: Math.max(0, Math.floor(Number(data?.transferred ?? 0))),
      });
    } catch {
      void 0;
    } finally {
      loadingRef.current = false;
    }
  }, [academyId, listFilter]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  return { stats, refreshStats };
}
