import { useMemo, useRef } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import {
  buildInboxLeadMaps,
  collectVisibleLeadKeys,
  extractEmbeddedLeadsFromItems,
  fingerprintInboxLeadMaps,
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
  const cacheRef = useRef(null);

  return useMemo(() => {
    const mergedLeadsById = { ...embeddedLeadsById, ...storeLeadsById };
    const { leadById, leadByPhone } = buildInboxLeadMaps(mergedLeadsById, visibleKeys);
    const fp = fingerprintInboxLeadMaps(leadById, leadByPhone, visibleKeys);

    if (cacheRef.current?.fp === fp) {
      return cacheRef.current.result;
    }

    const getLeadById = (id) => {
      const lid = String(id || '').trim();
      if (!lid) return null;
      return leadById.get(lid) ?? null;
    };

    const result = { leadById, leadByPhone, getLeadById };
    cacheRef.current = { fp, result };
    return result;
  }, [embeddedLeadsById, storeLeadsById, visibleKeys]);
}
