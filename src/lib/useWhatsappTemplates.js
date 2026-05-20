import { useEffect, useMemo } from 'react';
import { useWhatsappTemplatesStore } from '../store/useWhatsappTemplatesStore.js';
import { getTemplateUsageByKey } from '../../lib/whatsappTemplateDefaults.js';

/**
 * Cache em memória dos templates WhatsApp da academia (invalidar após save em Templates).
 */
export function useWhatsappTemplates(academyId, { enabled = true } = {}) {
  const id = String(academyId || '').trim();
  const entry = useWhatsappTemplatesStore((s) => (id ? s.byAcademy[id] : null));
  const fetch = useWhatsappTemplatesStore((s) => s.fetch);
  const invalidate = useWhatsappTemplatesStore((s) => s.invalidate);

  useEffect(() => {
    if (!enabled || !id) return;
    void fetch(id);
  }, [enabled, id, fetch]);

  const usageByKey = useMemo(
    () => getTemplateUsageByKey(entry?.automationsRaw || ''),
    [entry?.automationsRaw]
  );

  return {
    templates: entry?.templates,
    archive: entry?.archive || {},
    automationsRaw: entry?.automationsRaw || '',
    academyName: entry?.academyName || '',
    zapsterInstanceId: entry?.zapsterInstanceId || '',
    updatedAt: entry?.updatedAt,
    updatedBy: entry?.updatedBy,
    usageByKey,
    loading: Boolean(entry?.loading),
    error: entry?.error || null,
    refetch: (opts) => fetch(id, { force: true, ...opts }),
    invalidate: () => invalidate(id),
  };
}
