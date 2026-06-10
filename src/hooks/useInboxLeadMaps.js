import { useMemo } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import {
  buildInboxLeadMaps,
  collectVisibleLeadKeys,
  extractEmbeddedLeadsFromItems,
} from '../lib/inboxLeadMaps.js';
import { normalizeInboxPhone } from '../lib/normalizeInboxPhone.js';

/**
 * Maps de lead escopados às conversas visíveis — evita rebuild quando leads fora da lista mudam.
 */
export function useInboxLeadMaps({ items, selectedPhone, normalizePhone = normalizeInboxPhone }) {
  const visibleKeys = useMemo(
    () => collectVisibleLeadKeys(items, selectedPhone, normalizePhone),
    [items, selectedPhone, normalizePhone]
  );

  const embeddedLeadsById = useMemo(() => extractEmbeddedLeadsFromItems(items), [items]);
  const storeLeadsById = useLeadStore((s) => s.leadsById);

  return useMemo(() => {
    const mergedLeadsById = { ...embeddedLeadsById, ...storeLeadsById };
    const { leadById, leadByPhone } = buildInboxLeadMaps(mergedLeadsById, visibleKeys);

    const getLeadById = (id) => {
      const lid = String(id || '').trim();
      if (!lid) return null;
      return leadById.get(lid) ?? null;
    };

    return { leadById, leadByPhone, getLeadById };
  }, [embeddedLeadsById, storeLeadsById, visibleKeys]);
}
