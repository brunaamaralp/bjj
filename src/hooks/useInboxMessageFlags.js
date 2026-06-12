import { useCallback, useEffect, useMemo, useState } from 'react';
import { getInboxJwt as getJwt } from '../lib/inboxApiUtils.js';

/**
 * Flags de mensagem (fixar / importante) com migração legada do localStorage.
 */
export function useInboxMessageFlags({
  academyId,
  selectedPhone,
  selected,
  items,
  loading,
  toast,
  messageFlagsMigrationDoneRef,
}) {
  const [msgFlags, setMsgFlags] = useState({});

  const conversationIdForFlags = useMemo(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return '';
    const fromSelected = String(selected?.conversation_id || '').trim();
    if (fromSelected) return fromSelected;
    const row = (Array.isArray(items) ? items : []).find((it) => String(it?.phone_number || '').trim() === phone);
    return String(row?.id || '').trim();
  }, [selectedPhone, selected?.conversation_id, items]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!academyId || messageFlagsMigrationDoneRef.current) return;
    const raw = window.localStorage.getItem('inbox_msg_flags');
    if (!raw || raw === '{}') {
      messageFlagsMigrationDoneRef.current = true;
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      messageFlagsMigrationDoneRef.current = true;
      try {
        window.localStorage.removeItem('inbox_msg_flags');
      } catch {
        void 0;
      }
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      messageFlagsMigrationDoneRef.current = true;
      try {
        window.localStorage.removeItem('inbox_msg_flags');
      } catch {
        void 0;
      }
      return;
    }

    const arr = Array.isArray(items) ? items : [];
    const phones = Object.keys(parsed).filter((ph) => {
      const p = String(ph || '').trim();
      if (!p) return false;
      const cur = parsed[p];
      const pin = cur?.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
      const imp = cur?.important && typeof cur.important === 'object' ? cur.important : {};
      const nPin = Object.keys(pin).filter((k) => pin[k]).length;
      const nImp = Object.keys(imp).filter((k) => imp[k]).length;
      return nPin + nImp > 0;
    });
    if (phones.length > 0 && arr.length === 0) {
      if (!loading) {
        messageFlagsMigrationDoneRef.current = true;
        try {
          window.localStorage.removeItem('inbox_msg_flags');
        } catch {
          void 0;
        }
      }
      return;
    }

    (async () => {
      let ok = true;
      try {
        const jwt = await getJwt();
        const headers = {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId,
        };
        for (const phone of phones.length ? phones : Object.keys(parsed)) {
          const p = String(phone || '').trim();
          if (!p) continue;
          const cur = parsed[p];
          if (!cur || typeof cur !== 'object') continue;
          const row = arr.find((it) => String(it?.phone_number || '').trim() === p);
          const conversationId = String(row?.id || '').trim();
          if (!conversationId) continue;
          const pin = cur.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
          const imp = cur.important && typeof cur.important === 'object' ? cur.important : {};
          for (const k of Object.keys(pin)) {
            if (!pin[k]) continue;
            const mid = String(k || '').trim();
            if (!mid) continue;
            const res = await fetch('/api/message-flags', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                academy_id: academyId,
                conversation_id: conversationId,
                message_id: mid,
                type: 'pinned',
              }),
            });
            if (!res.ok) ok = false;
          }
          for (const k of Object.keys(imp)) {
            if (!imp[k]) continue;
            const mid = String(k || '').trim();
            if (!mid) continue;
            const res = await fetch('/api/message-flags', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                academy_id: academyId,
                conversation_id: conversationId,
                message_id: mid,
                type: 'important',
              }),
            });
            if (!res.ok) ok = false;
          }
        }
        if (ok) {
          try {
            window.localStorage.removeItem('inbox_msg_flags');
          } catch {
            void 0;
          }
        }
      } catch {
        ok = false;
      } finally {
        messageFlagsMigrationDoneRef.current = true;
      }
    })();
  }, [academyId, items, loading, messageFlagsMigrationDoneRef]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    const cid = String(conversationIdForFlags || '').trim();
    if (!academyId || !phone || !cid) return;
    let cancelled = false;
    (async () => {
      try {
        const jwt = await getJwt();
        const qs = new URLSearchParams({
          conversation_id: cid,
          academy_id: academyId,
        });
        const res = await fetch(`/api/message-flags?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.sucesso) return;
        const list = Array.isArray(data.flags) ? data.flags : [];
        const mapPinned = {};
        const mapImp = {};
        for (const f of list) {
          const mid = String(f?.message_id || '').trim();
          if (!mid) continue;
          if (f.type === 'pinned') mapPinned[mid] = true;
          if (f.type === 'important') mapImp[mid] = true;
        }
        setMsgFlags((prev) => {
          const base = prev && typeof prev === 'object' ? prev : {};
          return {
            ...base,
            [phone]: { pinned: mapPinned, important: mapImp },
          };
        });
      } catch {
        void 0;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, selectedPhone, conversationIdForFlags]);

  const toggleMsgFlag = useCallback(
    async (phone, key, kind) => {
      const p = String(phone || '').trim();
      const k = String(key || '').trim();
      const t = String(kind || '').trim();
      if (!p || !k || (t !== 'pinned' && t !== 'important')) return;
      const cid =
        p === String(selectedPhone || '').trim()
          ? String(conversationIdForFlags || '').trim()
          : String(
              (Array.isArray(items) ? items : []).find((it) => String(it?.phone_number || '').trim() === p)?.id || ''
            ).trim();
      if (!cid || !academyId) return;

      const curPhone =
        msgFlags && typeof msgFlags === 'object' && msgFlags[p] && typeof msgFlags[p] === 'object' ? msgFlags[p] : {};
      const curMap = curPhone[t] && typeof curPhone[t] === 'object' ? curPhone[t] : {};
      const has = Boolean(curMap[k]);
      const nextHas = !has;

      const applyLocal = () => {
        setMsgFlags((prev) => {
          const base = prev && typeof prev === 'object' ? prev : {};
          const cur = base[p] && typeof base[p] === 'object' ? base[p] : {};
          const next = { ...base };
          const cm = cur[t] && typeof cur[t] === 'object' ? cur[t] : {};
          const nextMap = { ...cm };
          if (nextHas) nextMap[k] = true;
          else delete nextMap[k];
          next[p] = { ...cur, [t]: nextMap };
          return next;
        });
      };

      try {
        const jwt = await getJwt();
        if (nextHas) {
          const res = await fetch('/api/message-flags', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
              'x-academy-id': academyId,
            },
            body: JSON.stringify({
              academy_id: academyId,
              conversation_id: cid,
              message_id: k,
              type: t,
            }),
          });
          if (!res.ok) throw new Error('post');
          applyLocal();
          if (t === 'pinned') {
            toast.success('Mensagem fixada');
          } else {
            toast.success('Marcada como importante');
          }
        } else {
          const qs = new URLSearchParams({
            type: t,
            academy_id: academyId,
            conversation_id: cid,
          });
          const res = await fetch(`/api/message-flags/${encodeURIComponent(k)}?${qs.toString()}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
          });
          if (!res.ok) throw new Error('delete');
          applyLocal();
          if (t === 'pinned') {
            toast.success('Mensagem desfixada');
          } else {
            toast.success('Importante removido');
          }
        }
      } catch (e) {
        toast.error(e, 'action');
      }
    },
    [academyId, conversationIdForFlags, items, msgFlags, selectedPhone, toast]
  );

  return {
    msgFlags,
    setMsgFlags,
    conversationIdForFlags,
    toggleMsgFlag,
  };
}
