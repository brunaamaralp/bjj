import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { getInboxJwt, safeParseInboxJson } from '../lib/inboxApiUtils.js';

const DEFAULT_STATS = {
  resolvedCount: 0,
  transferredCount: 0,
  needsMeBacklog: 0,
  unreadBacklog: 0,
};

function mapStatsPayload(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    unreadBacklog: Math.max(0, Math.floor(Number(data?.unread_conversations ?? 0))),
    needsMeBacklog: Math.max(0, Math.floor(Number(data?.needs_me ?? 0))),
    resolvedCount: Math.max(0, Math.floor(Number(data?.resolved ?? 0))),
    transferredCount: Math.max(0, Math.floor(Number(data?.transferred ?? 0))),
  };
}

/**
 * Contadores do header da inbox via GET /api/conversations?stats=1
 * ou embutidos em include_stats=1 na lista.
 */
export function useInboxListStats({ academyId, listFilter }) {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const loadingRef = useRef(false);
  const hydratedFromListRef = useRef(false);

  const applyStatsPayload = useCallback((payload) => {
    const mapped = mapStatsPayload(payload);
    if (!mapped) return;
    setStats(mapped);
  }, []);

  const applyStatsFromList = useCallback((payload) => {
    hydratedFromListRef.current = true;
    applyStatsPayload(payload);
  }, [applyStatsPayload]);

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
      applyStatsPayload(data);
    } catch {
      void 0;
    } finally {
      loadingRef.current = false;
    }
  }, [academyId, listFilter, applyStatsPayload]);

  useEffect(() => {
    hydratedFromListRef.current = false;
  }, [academyId, listFilter]);

  useEffect(() => {
    const id = String(academyId || '').trim();
    if (!id || listFilter === 'archived') return;
    const t = setTimeout(() => {
      if (!hydratedFromListRef.current) {
        void refreshStats();
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [academyId, listFilter, refreshStats]);

  return { stats, refreshStats, applyStatsFromList };
}
