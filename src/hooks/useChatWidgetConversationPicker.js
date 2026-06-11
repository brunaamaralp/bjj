import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { getInboxJwt, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { pickInboxDisplayName } from '../lib/inboxContactDisplay.js';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';

const POLL_MS = 60_000;

function mapPickerItem(it) {
  const phone = String(it?.phone_number || '').trim();
  if (!phone) return null;
  const ts = String(it?.last_message_timestamp || it?.updated_at || '').trim();
  return {
    phone,
    leadId: String(it?.lead_id || '').trim(),
    leadName: pickInboxDisplayName({
      leadName: it?.lead_name,
      manualContactName: it?.contact_name,
      whatsappProfileName: it?.whatsapp_profile_name,
      phone,
    }),
    unreadCount: Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0,
    lastPreview: String(it?.last_preview || '').trim(),
    profileImageUrl: String(it?.whatsapp_profile_image_url || '').trim(),
    timestamp: ts,
  };
}

function sortPickerItems(items) {
  const arr = Array.isArray(items) ? [...items] : [];
  arr.sort((a, b) => {
    const au = Number(a?.unreadCount || 0);
    const bu = Number(b?.unreadCount || 0);
    if (au > 0 && bu === 0) return -1;
    if (bu > 0 && au === 0) return 1;
    const at = Date.parse(a?.timestamp || '') || 0;
    const bt = Date.parse(b?.timestamp || '') || 0;
    return bt - at;
  });
  return arr;
}

/**
 * Fetch imperativo de conversas para o atalho/launcher do chat widget.
 * @returns {Promise<{ items: object[], blocked: boolean, error: string|null }>}
 */
export async function loadChatWidgetConversations(academyId, { signal } = {}) {
  const academyIdStr = String(academyId || '').trim();
  if (!academyIdStr) return { items: [], blocked: false, error: null };

  try {
    const jwt = await getInboxJwt();
    const qs = new URLSearchParams();
    qs.set('limit', '15');
    qs.set('archived', '0');
    const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations?${qs.toString()}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'x-academy-id': academyIdStr,
      },
      signal,
    });
    if (blocked) return { items: [], blocked: true, error: null };
    const raw = await resp.text();
    if (!resp.ok) throw new Error(friendlyError(raw, 'load'));
    const data = safeParseInboxJson(raw) || {};
    const items = sortPickerItems(
      (Array.isArray(data?.items) ? data.items : []).map(mapPickerItem).filter(Boolean)
    );
    return { items, blocked: false, error: null };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return { items: [], blocked: false, error: friendlyError(e, 'load') };
  }
}

/**
 * Lista leve de conversas para o seletor do chat widget.
 */
export function useChatWidgetConversationPicker({ academyId, enabled = false } = {}) {
  const academyIdStr = String(academyId || '').trim();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!academyIdStr) return;
    const seq = ++requestSeqRef.current;
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const result = await loadChatWidgetConversations(academyIdStr, { signal: ac.signal });
      if (seq !== requestSeqRef.current) return;
      if (result.blocked) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setItems(result.items);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (seq !== requestSeqRef.current) return;
      setError(friendlyError(e, 'load'));
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [academyIdStr]);

  useEffect(() => {
    if (!enabled || !academyIdStr) return undefined;
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort?.();
    };
  }, [enabled, academyIdStr, load]);

  return { items, loading, error, refresh: load };
}

export function pickerItemMatchesPhone(item, phone) {
  const a = primaryInboxPhone(item?.phone);
  const b = primaryInboxPhone(phone);
  return Boolean(a && b && a === b);
}
