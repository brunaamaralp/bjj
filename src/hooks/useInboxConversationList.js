import { useCallback, useEffect, useRef } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { capInboxListItems } from '../lib/inboxListCap.js';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { normalizeInboxPhone as normalizePhone, pickInboxDisplayName } from '../lib/inboxContactDisplay.js';
import { inboxListFilterToServerParam } from './useInboxInitialLoad.js';

/**
 * Carrega e pagina a lista de conversas da inbox (/api/conversations).
 */
export function useInboxConversationList({
  academyIdRef,
  debouncedSearchQuery,
  listFilterRef,
  selectedPhoneRef,
  listMetaRef,
  notifiedOnceRef,
  loadingListRef,
  nextCursor,
  hasMore,
  loading,
  loadingMore,
  setNextCursor,
  setHasMore,
  setError,
  setLoading,
  setLoadingMore,
  setLastUpdatedAt,
  setItems,
  setListCapped,
  onListItemNotifyRef,
  onListReadyRef,
  onStatsFromListRef,
}) {
  const nextCursorRef = useRef(nextCursor);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const loadingMoreRef = useRef(loadingMore);
  const debouncedSearchRef = useRef(debouncedSearchQuery);
  const listRequestSeqRef = useRef(0);

  nextCursorRef.current = nextCursor;
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  debouncedSearchRef.current = debouncedSearchQuery;

  const loadList = useCallback(async ({ reset = false, silent = false, includeStats = false } = {}) => {
    const aid = String(academyIdRef.current || '').trim();
    if (!aid) return;
    if (!reset && (!hasMoreRef.current || loadingMoreRef.current || loadingRef.current)) return;

    const requestId = ++listRequestSeqRef.current;
    if (reset) {
      setNextCursor(null);
      setHasMore(true);
    }
    if (!silent) setError('');
    loadingListRef.current = true;
    if (reset && !silent) setLoading(true);
    else if (!reset) setLoadingMore(true);
    try {
      const jwt = await getInboxJwt();
      if (requestId !== listRequestSeqRef.current) return;
      const qs = new URLSearchParams();
      qs.set('limit', '50');
      const cursorToUse = reset ? '' : String(nextCursorRef.current || '').trim();
      if (cursorToUse) qs.set('cursor', cursorToUse);
      const searchQ = String(debouncedSearchRef.current || '').trim();
      const searchDigits = normalizePhone(searchQ);
      if (searchDigits.length >= 2) qs.set('search', searchQ);
      qs.set('archived', listFilterRef.current === 'archived' ? '1' : '0');
      const serverFilter = inboxListFilterToServerParam(listFilterRef.current);
      if (serverFilter) qs.set('filter', serverFilter);
      if (includeStats && listFilterRef.current !== 'archived' && !searchQ) {
        qs.set('include_stats', '1');
      }
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid },
      });
      if (blocked) return;
      if (requestId !== listRequestSeqRef.current) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao carregar conversas', 'load'));
      if (requestId !== listRequestSeqRef.current) return;
      const data = safeParseInboxJson(raw) || {};
      const next = Array.isArray(data?.items) ? data.items : [];
      const nextCur = data?.next_cursor ? String(data.next_cursor) : null;
      const previousMeta = listMetaRef.current instanceof Map ? listMetaRef.current : new Map();
      const nextMeta = reset ? new Map() : new Map(previousMeta);
      for (const it of next) {
        const phone = String(it?.phone_number || '').trim();
        if (!phone) continue;
        const ts = String(it?.last_message_timestamp || it?.updated_at || '').trim();
        const curUnread = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
        const curUpdated = String(it?.updated_at || '').trim();
        const curLu = String(it?.last_user_msg_at || '').trim();
        nextMeta.set(phone, {
          ts,
          role: String(it?.last_message_role || '').trim(),
          sender: String(it?.last_message_sender || '').trim(),
          unread_count: curUnread,
          updated_at: curUpdated,
          last_user_msg_at: curLu,
        });
      }
      setNextCursor(nextCur);
      setHasMore(Boolean(nextCur) && next.length > 0 && searchDigits.length < 2);
      setLastUpdatedAt(new Date().toISOString());
      setItems((prev) => {
        const incoming = reset ? next : [...(Array.isArray(prev) ? prev : []), ...next];
        const seen = new Set();
        const deduped = [];
        for (const it of incoming) {
          const phoneKey = String(it?.phone_number || '').trim();
          const k = phoneKey || String(it?.id || '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          deduped.push(it);
        }
        const { items: cappedItems, capped } = capInboxListItems(deduped, selectedPhoneRef.current);
        setListCapped(capped);
        return cappedItems;
      });
      if (reset && notifiedOnceRef.current) {
        const selected = String(selectedPhoneRef.current || '').trim();
        for (const it of next) {
          const phone = String(it?.phone_number || '').trim();
          if (!phone || phone === selected) continue;
          const curUnread = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
          if (curUnread <= 0) continue;
          const prev = previousMeta.get(phone);
          const prevUnread = prev && Number.isFinite(Number(prev.unread_count)) ? Number(prev.unread_count) : 0;
          const prevLu = prev && typeof prev.last_user_msg_at === 'string' ? prev.last_user_msg_at : '';
          const curLu = String(it?.last_user_msg_at || '').trim();
          const prevUpdated = prev && typeof prev.updated_at === 'string' ? prev.updated_at : '';
          const curUpdated = String(it?.updated_at || '').trim();
          const unreadIncreased = curUnread > prevUnread;
          const userMsgRenewed = Boolean(curLu && curLu !== prevLu);
          const updatedAdvanced = Boolean(curUpdated && curUpdated !== prevUpdated);
          if (!unreadIncreased && !(userMsgRenewed && updatedAdvanced)) continue;
          const preview = String(it?.last_preview || '').trim();
          const name = pickInboxDisplayName({
            leadName: it?.lead_name,
            manualContactName: it?.contact_name,
            whatsappProfileName: it?.whatsapp_profile_name,
            phone,
          });
          onListItemNotifyRef.current?.({ phone, name, preview });
        }
      } else if (reset) {
        notifiedOnceRef.current = true;
      }
      listMetaRef.current = nextMeta;

      if (reset && data?.stats && typeof data.stats === 'object') {
        onStatsFromListRef?.current?.(data.stats);
      }

      if (reset) {
        const first = next[0];
        const firstPhone = String(first?.phone_number || '').trim();
        const firstConversationId = String(first?.id || '').trim();
        onListReadyRef?.current?.({
          firstPhone,
          firstConversationId,
          items: next,
          hasSelection: Boolean(String(selectedPhoneRef.current || '').trim()),
        });
      }
    } catch (e) {
      if (!silent) setError(friendlyError(e, 'load'));
    } finally {
      if (requestId !== listRequestSeqRef.current) return;
      loadingListRef.current = false;
      if (reset && !silent) setLoading(false);
      else if (!reset) setLoadingMore(false);
    }
  }, [
    academyIdRef,
    listFilterRef,
    listMetaRef,
    notifiedOnceRef,
    loadingListRef,
    selectedPhoneRef,
    onListItemNotifyRef,
    onListReadyRef,
    onStatsFromListRef,
    setNextCursor,
    setHasMore,
    setError,
    setLoading,
    setLoadingMore,
    setLastUpdatedAt,
    setItems,
    setListCapped,
  ]);

  const loadListRef = useRef(loadList);
  useEffect(() => {
    loadListRef.current = loadList;
  }, [loadList]);

  return { loadList, loadListRef };
}
