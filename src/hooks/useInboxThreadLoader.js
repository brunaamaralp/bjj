import { useCallback, useEffect, useRef } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';

/**
 * Carrega o thread de uma conversa (/api/conversations/:phone) com abort e paginação.
 */
export function useInboxThreadLoader({
  academyIdRef,
  threadScrollRef,
  threadAbortRef,
  threadRequestSeqRef,
  lastAutoScrollPhoneRef,
  setError,
  setThreadError,
  setThreadPaging,
  setThreadLoading,
  setThreadCursor,
  setThreadHasMore,
  setSelected,
  setItems,
}) {
  const loadThread = useCallback(
    async (phone, { silent = false, cursor = '', append = false } = {}) => {
      const p = String(phone || '').trim();
      if (!p) return;
      if (!silent) {
        setError('');
        setThreadError('');
      }
      const reqSeq = ++threadRequestSeqRef.current;
      if (!append) {
        try {
          if (threadAbortRef.current) threadAbortRef.current.abort();
        } catch {
          void 0;
        }
        threadAbortRef.current = new AbortController();
      }
      const signal = !append && threadAbortRef.current ? threadAbortRef.current.signal : undefined;
      const prevScroll = (() => {
        if (!append) return null;
        const el = threadScrollRef.current;
        if (!el) return null;
        return { height: el.scrollHeight, top: el.scrollTop };
      })();
      try {
        if (append) setThreadPaging(true);
        else setThreadLoading(true);
        const jwt = await getInboxJwt();
        const params = new URLSearchParams();
        params.set('limit', '35');
        if (cursor) params.set('cursor', String(cursor));
        const qs = params.toString();
        const { blocked, res: resp } = await fetchWithBillingGuard(
          `/api/conversations/${encodeURIComponent(p)}${qs ? `?${qs}` : ''}`,
          {
            headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') },
            ...(signal ? { signal } : {}),
          }
        );
        if (blocked) return;
        const contentType = resp.headers.get('content-type') || '';
        const raw = await resp.text();
        if (!contentType.includes('application/json')) {
          console.error('[loadThread] resposta não é JSON', {
            phone: p,
            status: resp.status,
            contentType,
            bodyPreview: raw.slice(0, 100),
          });
          if (!silent) setThreadError('Erro ao carregar conversa. Tente novamente.');
          return;
        }
        if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao carregar conversa'));
        const data = safeParseInboxJson(raw) || {};
        const incoming = Array.isArray(data?.messages) ? data.messages : [];
        const nextCur = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
        const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
        const handoffUntil = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
        const ticketStatus = typeof data?.ticket_status === 'string' ? data.ticket_status : 'open';
        const transferTo = typeof data?.transfer_to === 'string' ? data.transfer_to : '';
        if (reqSeq !== threadRequestSeqRef.current) return;
        setThreadCursor(nextCur || null);
        setThreadHasMore(Boolean(nextCur));
        setSelected((prev) => {
          const convId =
            typeof data?.conversation_id === 'string' && String(data.conversation_id).trim()
              ? String(data.conversation_id).trim()
              : append && prev && prev.phone === p
                ? String(prev.conversation_id || '').trim()
                : '';
          const base = {
            phone: p,
            conversation_id: convId || null,
            summary,
            lead_id: typeof data?.lead_id === 'string' ? data.lead_id : null,
            lead_name: typeof data?.lead_name === 'string' ? data.lead_name : '',
            contact_name: typeof data?.contact_name === 'string' ? data.contact_name : '',
            contact_name_source:
              typeof data?.contact_name_source === 'string' ? data.contact_name_source : '',
            whatsapp_profile_name:
              typeof data?.whatsapp_profile_name === 'string' ? data.whatsapp_profile_name : '',
            whatsapp_profile_image_url:
              typeof data?.whatsapp_profile_image_url === 'string' ? data.whatsapp_profile_image_url : '',
            need_human: Boolean(data?.need_human),
            human_handoff_until: handoffUntil || null,
            ticket_status: String(ticketStatus || 'open'),
            transfer_to: transferTo || null,
            archived: Boolean(data?.archived),
          };
          if (!append || !prev || prev.phone !== p) {
            return { ...base, messages: incoming };
          }
          const existing = Array.isArray(prev.messages) ? prev.messages : [];
          const combined = [...incoming, ...existing];
          const seen = new Set();
          const deduped = [];
          for (const m of combined) {
            const mid = String(m?.message_id || '').trim();
            const key = mid || `${String(m?.role || '')}:${String(m?.timestamp || '')}:${String(m?.content || '')}`;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(m);
          }
          return { ...base, messages: deduped };
        });
        try {
          const last = incoming.length > 0 ? incoming[incoming.length - 1] : null;
          const textRaw = String(last?.content || '')
            .replace(/_{2,}/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const preview = textRaw.length > 40 ? `${textRaw.slice(0, 40)}…` : textRaw;
          if (preview) {
            setItems((prev) => {
              const arr = Array.isArray(prev) ? prev : [];
              return arr.map((it) => {
                const ph = String(it?.phone_number || '').trim();
                if (ph !== p) return it;
                return { ...it, last_preview: preview };
              });
            });
          }
        } catch {
          void 0;
        }
        try {
          if (!append) {
            setTimeout(() => {
              if (reqSeq !== threadRequestSeqRef.current) return;
              const el = threadScrollRef.current;
              if (!el) return;
              el.scrollTop = el.scrollHeight;
              lastAutoScrollPhoneRef.current = p;
            }, 0);
          } else if (prevScroll) {
            setTimeout(() => {
              if (reqSeq !== threadRequestSeqRef.current) return;
              const el = threadScrollRef.current;
              if (!el) return;
              const nextHeight = el.scrollHeight;
              const delta = nextHeight - prevScroll.height;
              el.scrollTop = prevScroll.top + delta;
            }, 0);
          }
        } catch {
          void 0;
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!silent) setError(friendlyError(e, 'load'));
      } finally {
        if (reqSeq === threadRequestSeqRef.current) {
          setThreadLoading(false);
          setThreadPaging(false);
        }
      }
    },
    [
      academyIdRef,
      threadScrollRef,
      threadAbortRef,
      threadRequestSeqRef,
      lastAutoScrollPhoneRef,
      setError,
      setThreadError,
      setThreadPaging,
      setThreadLoading,
      setThreadCursor,
      setThreadHasMore,
      setSelected,
      setItems,
    ]
  );

  const loadThreadRef = useRef(loadThread);
  useEffect(() => {
    loadThreadRef.current = loadThread;
  }, [loadThread]);

  return { loadThread, loadThreadRef };
}
