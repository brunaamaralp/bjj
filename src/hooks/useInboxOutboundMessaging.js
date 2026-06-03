import { useCallback } from 'react';
import { AGENT_HISTORY_WINDOW } from '../../lib/constants.js';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import {
  buildOutboundDisplayContent,
  outboundSuccessMessage,
  toIsoFromLocalDatetime,
} from '../lib/inboxOutboundUtils.js';
import { uploadInboxMedia, InboxMediaUploadError } from '../lib/uploadInboxMedia.js';

/**
 * Envio manual, retry otimista e cancelamento de mensagens agendadas.
 */
export function useInboxOutboundMessaging({
  toast,
  academyIdRef,
  selectedPhoneRef,
  threadScrollRef,
  lastAutoScrollPhoneRef,
  draftRef,
  textareaRef,
  selectedPhone,
  selected,
  draft,
  scheduleOn,
  scheduleAtLocal,
  sending,
  cancelingMsgId,
  cancelConfirmMsgId,
  setError,
  setSelected,
  setDraft,
  setDraftBeforeImprove,
  setScheduleOn,
  setScheduleAtLocal,
  setSending,
  setImprovingDraft,
  setCancelConfirmMsgId,
  setCancelingMsgId,
  scrollThreadToBottom,
  setHandoffActive,
  markSeen,
  loadList,
}) {
  const patchOutboundMessage = useCallback(
    (phone, tempId, updater) => {
      const p = String(phone || '').trim();
      const tid = String(tempId || '').trim();
      if (!p || !tid || typeof updater !== 'function') return;
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== p) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages : [];
        let changed = false;
        const next = msgs.map((m) => {
          if (String(m?.message_id || '').trim() !== tid) return m;
          changed = true;
          return updater(m);
        });
        if (!changed) return prev;
        return { ...prev, messages: next };
      });
    },
    [setSelected]
  );

  const markOutboundMessageFailed = useCallback(
    (phone, tempId) => {
      patchOutboundMessage(phone, tempId, (m) => ({ ...m, _optimistic: false, _sendFailed: true }));
    },
    [patchOutboundMessage]
  );

  const postWhatsappOutbound = useCallback(
    async ({ phone, apiBody, tempId }) => {
      const jwt = await getInboxJwt();
      const resp = await fetch('/api/whatsapp?action=send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json',
        },
        body: JSON.stringify(apiBody),
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao enviar'));
      const data = safeParseInboxJson(raw) || {};
      const waUrl = typeof data?.wa_me_url === 'string' ? data.wa_me_url.trim() : '';
      if (String(data?.channel || '').trim() === 'wa_me' && waUrl) {
        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch {
          void 0;
        }
      }
      const status = String(data?.status || '').trim();
      const sendAt = typeof data?.send_at === 'string' ? data.send_at : null;
      const msgId = typeof data?.message_id === 'string' ? data.message_id : null;
      const mime = String(apiBody?.mimeType || '').trim();
      const mediaUrl = String(apiBody?.mediaUrl || '').trim();
      const mediaType = mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('audio/')
          ? 'audio'
          : mediaUrl
            ? 'document'
            : '';
      patchOutboundMessage(phone, tempId, (m) => {
        const { _optimistic, _sendFailed, _retryPayload, ...rest } = m;
        return {
          ...rest,
          message_id: msgId || tempId,
          ...(status ? { status } : {}),
          ...(sendAt ? { send_at: sendAt } : {}),
          ...(mediaUrl
            ? {
                type: mediaType,
                mediaUrl,
                mimeType: mime || null,
                media_stored: true,
                ...(mediaType === 'document' && apiBody?.fileName ? { fileName: apiBody.fileName } : {}),
              }
            : {}),
        };
      });
      return { data, status, mediaUrl };
    },
    [academyIdRef, patchOutboundMessage]
  );

  const deliverOutboundMessage = useCallback(
    async ({ phone, tempId, apiBody, displayContent, mediaFields }) => {
      const nowIso = new Date().toISOString();
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        msgs.push({
          role: 'assistant',
          content: displayContent,
          timestamp: nowIso,
          sender: 'human',
          message_id: tempId,
          _optimistic: true,
          _retryPayload: { apiBody, displayContent, mediaFields },
          ...mediaFields,
        });
        return { ...prev, messages: msgs.slice(-AGENT_HISTORY_WINDOW) };
      });
      setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);

      const shouldAssume = !selected?.need_human;
      if (shouldAssume) {
        await setHandoffActive(true);
      }

      try {
        const { data, status, mediaUrl } = await postWhatsappOutbound({ phone, apiBody, tempId });
        markSeen(phone);
        toast.show({ type: 'success', message: outboundSuccessMessage({ data, status, mediaUrl }) });
        await loadList({ reset: true, silent: true });
        setTimeout(() => {
          const el = threadScrollRef.current;
          if (!el) return;
          el.scrollTop = el.scrollHeight;
          lastAutoScrollPhoneRef.current = phone;
        }, 0);
        return true;
      } catch {
        markOutboundMessageFailed(phone, tempId);
        return false;
      }
    },
    [
      lastAutoScrollPhoneRef,
      loadList,
      markOutboundMessageFailed,
      markSeen,
      postWhatsappOutbound,
      scrollThreadToBottom,
      selected?.need_human,
      setHandoffActive,
      setSelected,
      threadScrollRef,
      toast,
    ]
  );

  const sendManual = useCallback(
    async ({ file, mediaUrl: mediaUrlArg, mimeType: mimeTypeArg, caption: captionArg, fileName: fileNameArg } = {}) => {
      const phone = String(selectedPhone || '').trim();
      const text = String(draft || '').trim();
      const caption = String(captionArg ?? '').trim();
      let mediaUrl = String(mediaUrlArg || '').trim();
      let mimeType = String(mimeTypeArg || '').trim();
      let fileName = String(fileNameArg || '').trim();

      if (!phone || (!text && !caption && !mediaUrl && !file)) return;
      if (file && scheduleOn) {
        toast.show({ type: 'error', message: 'Agendamento não está disponível para envio de mídia.' });
        return;
      }
      setSending(true);
      try {
        if (file) {
          try {
            const uploaded = await uploadInboxMedia(file);
            mediaUrl = uploaded.mediaUrl;
            mimeType = uploaded.mimeType;
            fileName = uploaded.fileName;
          } catch (e) {
            if (e instanceof InboxMediaUploadError) {
              if (e.code === 'too_large') toast.show({ type: 'error', message: 'Arquivo muito grande. Máximo: 16MB.' });
              else if (e.code === 'unsupported') toast.show({ type: 'error', message: 'Tipo de arquivo não suportado.' });
              else toast.show({ type: 'error', message: e.message || 'Erro ao enviar arquivo.' });
            } else {
              toast.show({ type: 'error', message: 'Erro ao enviar arquivo. Tente novamente.' });
            }
            return;
          }
        }
        const sendAtIso = scheduleOn && !mediaUrl ? toIsoFromLocalDatetime(scheduleAtLocal) : '';
        if (scheduleOn && !mediaUrl && !sendAtIso) {
          toast.show({ type: 'error', message: 'Escolha data e hora para agendar' });
          return;
        }
        if (scheduleOn && !mediaUrl && sendAtIso) {
          const sendMs = new Date(sendAtIso).getTime();
          if (!Number.isFinite(sendMs) || sendMs <= Date.now()) {
            toast.show({ type: 'error', message: 'Selecione um horário posterior ao atual para agendar.' });
            return;
          }
        }

        const mime = mimeType || '';
        const mediaType = mime.startsWith('image/')
          ? 'image'
          : mime.startsWith('audio/')
            ? 'audio'
            : mediaUrl
              ? 'document'
              : '';
        const displayContent = buildOutboundDisplayContent({ caption, text, mediaType });
        const apiBody = mediaUrl
          ? {
              phone,
              mediaUrl,
              mimeType: mimeType || 'image/jpeg',
              caption: caption || text,
              ...(fileName ? { fileName } : {}),
            }
          : { phone, text, ...(sendAtIso ? { send_at: sendAtIso } : {}) };
        const mediaFields = mediaUrl
          ? {
              type: mediaType,
              mediaUrl,
              mimeType: mime || null,
              media_stored: true,
              ...(mediaType === 'document' && fileName ? { fileName } : {}),
            }
          : {};

        const tempId = `opt-${Date.now()}`;
        setDraft('');
        setDraftBeforeImprove(null);
        setScheduleOn(false);
        setScheduleAtLocal('');

        await deliverOutboundMessage({
          phone,
          tempId,
          apiBody,
          displayContent,
          mediaFields,
        });
      } finally {
        setSending(false);
      }
    },
    [
      deliverOutboundMessage,
      draft,
      scheduleAtLocal,
      scheduleOn,
      selectedPhone,
      setDraft,
      setDraftBeforeImprove,
      setScheduleAtLocal,
      setScheduleOn,
      setSending,
      toast,
    ]
  );

  const retryFailedMessage = useCallback(
    async (tempId) => {
      const phone = String(selectedPhoneRef.current || '').trim();
      const tid = String(tempId || '').trim();
      if (!phone || !tid || sending) return;
      const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
      const failed = msgs.find((m) => String(m?.message_id || '').trim() === tid && m?._sendFailed);
      const payload = failed?._retryPayload;
      if (!payload?.apiBody) return;

      patchOutboundMessage(phone, tid, (m) => ({ ...m, _optimistic: true, _sendFailed: false }));
      setSending(true);
      try {
        const shouldAssume = !selected?.need_human;
        if (shouldAssume) {
          await setHandoffActive(true);
        }
        const { data, status, mediaUrl } = await postWhatsappOutbound({
          phone,
          apiBody: payload.apiBody,
          tempId: tid,
        });
        markSeen(phone);
        toast.show({ type: 'success', message: outboundSuccessMessage({ data, status, mediaUrl }) });
        await loadList({ reset: true, silent: true });
      } catch {
        markOutboundMessageFailed(phone, tid);
      } finally {
        setSending(false);
      }
    },
    [
      markOutboundMessageFailed,
      markSeen,
      patchOutboundMessage,
      postWhatsappOutbound,
      selected?.messages,
      selected?.need_human,
      selectedPhoneRef,
      sending,
      setHandoffActive,
      setSending,
      loadList,
      toast,
    ]
  );

  const cancelScheduledMessage = useCallback(
    (messageId) => {
      const mid = String(messageId || '').trim();
      if (!mid || cancelingMsgId) return;
      setCancelConfirmMsgId(mid);
    },
    [cancelingMsgId, setCancelConfirmMsgId]
  );

  const runCancelScheduledMessage = useCallback(async () => {
    const phone = String(selectedPhoneRef.current || '').trim();
    const mid = String(cancelConfirmMsgId || '').trim();
    if (!phone || !mid) return;
    setCancelConfirmMsgId('');
    setCancelingMsgId(mid);
    try {
      const jwt = await getInboxJwt();
      const resp = await fetch('/api/whatsapp?action=cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ phone, message_id: mid }),
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao cancelar'));
      const data = safeParseInboxJson(raw) || {};
      const canceledAt = typeof data?.canceled_at === 'string' ? data.canceled_at : new Date().toISOString();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        const i = msgs.findIndex((m) => String(m?.message_id || '').trim() === mid);
        if (i < 0) return prev;
        msgs[i] = {
          ...(msgs[i] && typeof msgs[i] === 'object' ? msgs[i] : {}),
          status: 'canceled',
          canceled_at: canceledAt,
        };
        return { ...prev, messages: msgs };
      });
      toast.success('Agendamento cancelado');
      await loadList({ reset: true, silent: true });
    } catch (e) {
      toast.error(e, 'action');
    } finally {
      setCancelingMsgId('');
    }
  }, [
    academyIdRef,
    cancelConfirmMsgId,
    loadList,
    selectedPhoneRef,
    setCancelConfirmMsgId,
    setCancelingMsgId,
    setSelected,
    toast,
  ]);

  const improveDraftWithAi = useCallback(async () => {
    const phone = String(selectedPhoneRef.current || '').trim();
    const current = String(draftRef.current || '');
    if (!phone || current.trim().length <= 3) return;
    setError('');
    setImprovingDraft(true);
    try {
      const jwt = await getInboxJwt();
      const aid = String(academyIdRef.current || '').trim();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': aid,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'improve_reply', draft: current, phone, academyId: aid }),
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao melhorar texto'));
      const data = safeParseInboxJson(raw) || {};
      const improved = typeof data?.improved === 'string' ? data.improved.trim() : '';
      if (!improved) throw new Error('Resposta inválida do servidor');
      setDraftBeforeImprove(current);
      setDraft(improved);
      toast.success('Texto atualizado — revise antes de enviar');
      try {
        setTimeout(() => textareaRef.current?.focus?.(), 0);
      } catch {
        void 0;
      }
    } catch (e) {
      setError(friendlyError(e, 'action'));
    } finally {
      setImprovingDraft(false);
    }
  }, [
    academyIdRef,
    draftRef,
    selectedPhoneRef,
    setDraft,
    setDraftBeforeImprove,
    setError,
    setImprovingDraft,
    textareaRef,
    toast,
  ]);

  return {
    sendManual,
    retryFailedMessage,
    cancelScheduledMessage,
    runCancelScheduledMessage,
    improveDraftWithAi,
  };
}
