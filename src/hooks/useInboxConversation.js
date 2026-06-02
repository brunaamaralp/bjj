import { useCallback, useEffect, useRef, useState } from 'react';
import { account, realtime, DB_ID, CONVERSATIONS_COL } from '../lib/appwrite';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { normalizeInboxPhone } from '../lib/normalizeInboxPhone';
import { AGENT_HISTORY_WINDOW } from '../../lib/constants.js';

const PAGE_LIMIT = 30;
const POLL_ACTIVE_MS = 30_000;
const POLL_FALLBACK_MS = 28_000;
const REALTIME_DEBOUNCE_MS = 250;
const REALTIME_SUBSCRIBE_DELAY_MS = 300;

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

function parseApiError(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  try {
    const data = JSON.parse(s);
    return String(data?.erro || data?.error || data?.message || fallback).trim() || fallback;
  } catch {
    return s.length > 200 ? fallback : s;
  }
}

function dedupeMessages(list) {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const m of arr) {
    const mid = String(m?.message_id || '').trim();
    const key =
      mid ||
      `${String(m?.role || '')}:${String(m?.timestamp || '')}:${String(m?.content || '').slice(0, 80)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function mapSummaryFromApi(data, phone) {
  const needHuman = Boolean(data?.need_human);
  return {
    phone,
    conversation_id:
      typeof data?.conversation_id === 'string' && String(data.conversation_id).trim()
        ? String(data.conversation_id).trim()
        : null,
    lead_id: typeof data?.lead_id === 'string' ? data.lead_id : null,
    lead_name: typeof data?.lead_name === 'string' ? data.lead_name : '',
    need_human: needHuman,
    human_handoff_until:
      typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : null,
    ticket_status: typeof data?.ticket_status === 'string' ? data.ticket_status : 'open',
    transfer_to: typeof data?.transfer_to === 'string' ? data.transfer_to : '',
    unread_count: Number.isFinite(Number(data?.unread_count)) ? Number(data.unread_count) : 0,
    archived: Boolean(data?.archived),
    /** Agente IA ativo (não está em atendimento humano). */
    handoff: !needHuman,
    aiActive: !needHuman,
  };
}

/**
 * Hook isolado para thread de conversa (perfil, etc.) — não depende de Inbox.jsx.
 */
export function useInboxConversation({ phone: rawPhone, academyId, enabled = true } = {}) {
  const phone = normalizeInboxPhone(rawPhone);
  const academyIdStr = String(academyId || '').trim();
  const isActive = Boolean(enabled && phone && academyIdStr);

  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [realtimeOn, setRealtimeOn] = useState(false);

  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);
  const phoneRef = useRef(phone);
  const academyIdRef = useRef(academyIdStr);
  const summaryRef = useRef(null);
  const realtimeTimerRef = useRef(null);
  const fetchThreadRef = useRef(null);

  useEffect(() => {
    phoneRef.current = phone;
  }, [phone]);

  useEffect(() => {
    academyIdRef.current = academyIdStr;
  }, [academyIdStr]);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  const fetchThread = useCallback(
    async ({ silent = false, cursor: pageCursor = '', append = false } = {}) => {
      const p = phoneRef.current;
      const aid = academyIdRef.current;
      if (!p || !aid || !enabled) return;

      const reqSeq = ++requestSeqRef.current;

      if (!append) {
        try {
          if (abortRef.current) abortRef.current.abort();
        } catch {
          void 0;
        }
        abortRef.current = new AbortController();
      }

      const signal = !append && abortRef.current ? abortRef.current.signal : undefined;

      if (!silent) {
        if (append) setLoadingMore(true);
        else setLoading(true);
      }
      if (!append && !silent) setError(null);

      try {
        const jwt = await getJwt();
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        if (pageCursor) params.set('cursor', String(pageCursor));
        const qs = params.toString();

        const { blocked, res: resp } = await fetchWithBillingGuard(
          `/api/conversations/${encodeURIComponent(p)}${qs ? `?${qs}` : ''}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'x-academy-id': aid,
            },
            ...(signal ? { signal } : {}),
          }
        );

        if (blocked || reqSeq !== requestSeqRef.current) return;
        if (!resp) return;

        const raw = await resp.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if (!silent) setError('Erro ao carregar conversa.');
          return;
        }

        if (!resp.ok) {
          if (!silent) setError(parseApiError(raw, 'Erro ao carregar conversa.'));
          return;
        }

        const incoming = Array.isArray(data?.messages) ? data.messages : [];
        const nextCur = typeof data?.next_cursor === 'string' ? data.next_cursor : '';

        setCursor(nextCur);
        setHasMore(Boolean(nextCur));
        setSummary(mapSummaryFromApi(data, p));

        setMessages((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const optimistic = prevArr.filter((m) => m?._optimistic);
          if (!append) {
            return dedupeMessages([...incoming, ...optimistic]);
          }
          const stable = prevArr.filter((m) => !m?._optimistic);
          return dedupeMessages([...incoming, ...stable]);
        });
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!silent) setError(friendlyError(e, 'load'));
      } finally {
        if (reqSeq === requestSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    fetchThreadRef.current = fetchThread;
  }, [fetchThread]);

  const refresh = useCallback(() => fetchThread({ silent: true }), [fetchThread]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || !cursor) return;
    return fetchThread({ silent: true, cursor, append: true });
  }, [cursor, fetchThread, hasMore, loadingMore]);

  const assumeHandoff = useCallback(async () => {
    const p = phoneRef.current;
    const aid = academyIdRef.current;
    if (!p || !aid) return false;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(
        `/api/conversations/${encodeURIComponent(p)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': aid,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ action: 'handoff', ativo: true }),
        }
      );
      if (blocked || !resp) return false;
      const raw = await resp.text();
      if (!resp.ok) return false;
      const data = raw ? JSON.parse(raw) : {};
      const until = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
      const active = Boolean(data?.need_human);
      setSummary((prev) => ({
        ...(prev || mapSummaryFromApi({}, p)),
        need_human: active,
        human_handoff_until: until || null,
        handoff: !active,
        aiActive: !active,
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const markRead = useCallback(async () => {
    const p = phoneRef.current;
    const aid = academyIdRef.current;
    if (!p || !aid) return;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(
        `/api/conversations/${encodeURIComponent(p)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': aid,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ action: 'read' }),
        }
      );
      if (blocked || !resp?.ok) return;
      setSummary((prev) => (prev ? { ...prev, unread_count: 0 } : prev));
    } catch {
      void 0;
    }
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const p = phoneRef.current;
      const aid = academyIdRef.current;
      const body = String(text || '').trim();
      if (!p || !aid || !body || sending) return false;

      setSendError(null);
      setSending(true);

      const tempId = `opt-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optimistic = {
        role: 'assistant',
        content: body,
        timestamp: nowIso,
        sender: 'human',
        message_id: tempId,
        _optimistic: true,
      };

      setMessages((prev) => dedupeMessages([...(Array.isArray(prev) ? prev : []), optimistic]));

      try {
        const cur = summaryRef.current;
        if (cur && !cur.need_human) {
          await assumeHandoff();
        }

        const jwt = await getJwt();
        const resp = await fetch('/api/whatsapp?action=send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': aid,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ phone: p, text: body }),
        });
        const raw = await resp.text();
        if (!resp.ok) throw new Error(parseApiError(raw, 'Falha ao enviar'));

        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }

        const status = String(data?.status || '').trim();
        const msgId = typeof data?.message_id === 'string' ? data.message_id : null;
        const sendAt = typeof data?.send_at === 'string' ? data.send_at : null;

        setMessages((prev) => {
          const arr = (Array.isArray(prev) ? prev : []).filter((m) => String(m?.message_id || '') !== tempId);
          arr.push({
            role: 'assistant',
            content: body,
            timestamp: nowIso,
            sender: 'human',
            ...(status ? { status } : {}),
            ...(sendAt ? { send_at: sendAt } : {}),
            ...(msgId ? { message_id: msgId } : { message_id: tempId }),
          });
          return dedupeMessages(arr).slice(-AGENT_HISTORY_WINDOW);
        });

        void markRead();
        return true;
      } catch (e) {
        setMessages((prev) =>
          (Array.isArray(prev) ? prev : []).map((m) =>
            String(m?.message_id || '') === tempId
              ? { ...m, _optimistic: false, _sendFailed: true }
              : m
          )
        );
        setSendError(friendlyError(e, 'action'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [assumeHandoff, markRead, sending]
  );

  const retryFailedMessage = useCallback(
    async (messageId) => {
      const mid = String(messageId || '').trim();
      if (!mid || sending) return false;

      const failed = (Array.isArray(messages) ? messages : []).find(
        (m) => String(m?.message_id || '') === mid && m?._sendFailed
      );
      const body = String(failed?.content || '').trim();
      if (!body) return false;

      setSendError(null);
      setSending(true);
      setMessages((prev) =>
        (Array.isArray(prev) ? prev : []).map((m) =>
          String(m?.message_id || '') === mid
            ? { ...m, _optimistic: true, _sendFailed: false, timestamp: new Date().toISOString() }
            : m
        )
      );

      const p = phoneRef.current;
      const aid = academyIdRef.current;

      try {
        const cur = summaryRef.current;
        if (cur && !cur.need_human) {
          await assumeHandoff();
        }

        const jwt = await getJwt();
        const resp = await fetch('/api/whatsapp?action=send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': aid,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ phone: p, text: body }),
        });
        const raw = await resp.text();
        if (!resp.ok) throw new Error(parseApiError(raw, 'Falha ao enviar'));

        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }

        const status = String(data?.status || '').trim();
        const msgId = typeof data?.message_id === 'string' ? data.message_id : null;
        const sendAt = typeof data?.send_at === 'string' ? data.send_at : null;
        const nowIso = new Date().toISOString();

        setMessages((prev) => {
          const arr = (Array.isArray(prev) ? prev : []).filter((m) => String(m?.message_id || '') !== mid);
          arr.push({
            role: 'assistant',
            content: body,
            timestamp: nowIso,
            sender: 'human',
            ...(status ? { status } : {}),
            ...(sendAt ? { send_at: sendAt } : {}),
            ...(msgId ? { message_id: msgId } : { message_id: mid }),
          });
          return dedupeMessages(arr).slice(-AGENT_HISTORY_WINDOW);
        });

        void markRead();
        return true;
      } catch (e) {
        setMessages((prev) =>
          (Array.isArray(prev) ? prev : []).map((m) =>
            String(m?.message_id || '') === mid ? { ...m, _optimistic: false, _sendFailed: true } : m
          )
        );
        setSendError(friendlyError(e, 'action'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [assumeHandoff, markRead, messages, sending]
  );

  useEffect(() => {
    if (!isActive) {
      setMessages([]);
      setSummary(null);
      setCursor('');
      setHasMore(false);
      setLoading(false);
      setError(null);
      return undefined;
    }

    requestSeqRef.current += 1;
    void fetchThread({ silent: false });

    return () => {
      requestSeqRef.current += 1;
      try {
        if (abortRef.current) abortRef.current.abort();
      } catch {
        void 0;
      }
    };
  }, [isActive, phone, academyIdStr, fetchThread]);

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return undefined;
    if (!DB_ID || !CONVERSATIONS_COL) return undefined;

    const channel = `databases.${DB_ID}.collections.${CONVERSATIONS_COL}.documents`;
    const cancelledRef = { current: false };
    let subscription = null;
    let subscribeTimer = null;

    const onRealtimeEvent = (ev) => {
      if (cancelledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const payload = ev && typeof ev === 'object' ? ev.payload : null;
      const academy =
        payload && typeof payload === 'object'
          ? String(payload.academy_id ?? payload.academyId ?? '').trim()
          : '';
      const expected = academyIdRef.current;
      const eventPhone =
        payload && typeof payload === 'object' ? String(payload.phone_number || '').trim() : '';
      const currentPhone = phoneRef.current;

      if (academy && expected && academy !== expected) return;
      if (eventPhone && currentPhone && eventPhone !== currentPhone) return;

      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        const fn = fetchThreadRef.current;
        if (typeof fn === 'function') void fn({ silent: true });
      }, REALTIME_DEBOUNCE_MS);
    };

    subscribeTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      void realtime
        .subscribe(channel, onRealtimeEvent)
        .then((sub) => {
          if (cancelledRef.current) {
            void sub?.close?.();
            return;
          }
          subscription = sub;
          setRealtimeOn(true);
        })
        .catch(() => {
          if (!cancelledRef.current) setRealtimeOn(false);
        });
    }, REALTIME_SUBSCRIBE_DELAY_MS);

    return () => {
      cancelledRef.current = true;
      if (subscribeTimer) clearTimeout(subscribeTimer);
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      try {
        if (subscription && typeof subscription.close === 'function') void subscription.close();
      } catch {
        void 0;
      }
      setRealtimeOn(false);
    };
  }, [isActive, phone, academyIdStr]);

  useEffect(() => {
    if (!isActive || loading) return undefined;

    let timer = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const fn = fetchThreadRef.current;
      if (typeof fn === 'function') void fn({ silent: true });
    };

    const schedule = () => {
      if (timer) clearInterval(timer);
      if (realtimeOn) return;
      const ms = typeof document !== 'undefined' && document.hidden ? POLL_FALLBACK_MS * 2 : POLL_ACTIVE_MS;
      timer = setInterval(tick, ms);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isActive, loading, realtimeOn]);

  return {
    messages,
    summary,
    loading,
    loadingMore,
    sending,
    error,
    sendError,
    hasMore,
    loadMore,
    sendMessage,
    retryFailedMessage,
    markRead,
    refresh,
    realtimeOn,
  };
}
