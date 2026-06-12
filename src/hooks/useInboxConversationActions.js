import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { postInboxConversation } from '../lib/inboxConversationPost.js';
import { pickInboxDisplayName } from '../lib/inboxContactDisplay.js';

/**
 * Ações REST na conversa: leitura, arquivo, handoff, ticket, lead e contato.
 */
export function useInboxConversationActions({
  toast,
  academyIdRef,
  selectedPhoneRef,
  listFilterRef,
  loadListRef,
  loadList,
  closeMenu,
  setError,
  setItems,
  setSelected,
  setSelectedPhone,
  setHighlighted,
  setConversationSheet,
  setHandoffReleaseHint,
  setTicketUpdating,
  ticketUpdating,
  setLinkingLead,
  setLeadPanel,
  setLeadSearch,
  setEditingContactName,
  setSavingContactName,
  savingContactName,
  contactNameDraft,
  leadNameDraft,
  leadTypeDraft,
  selected,
  contactLabel,
  updateLead,
}) {
  const navigate = useNavigate();

  const markSeen = useCallback(
    async (phone, { notifySuccess = false } = {}) => {
      const p = String(phone || '').trim();
      if (!p || !academyIdRef.current) return;
      try {
        const result = await postInboxConversation({
          phone: p,
          academyId: academyIdRef.current,
          body: { action: 'read' },
          fallbackError: 'Falha ao marcar como lida',
        });
        if (result.blocked || !result.ok) return;
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map((it) => {
            const ph = String(it?.phone_number || '').trim();
            if (ph !== p) return it;
            return { ...it, unread_count: 0, last_read_at: new Date().toISOString() };
          });
        });
        setSelected((prev) => {
          if (!prev || prev.phone !== p) return prev;
          return { ...prev, unread_count: 0, last_read_at: new Date().toISOString() };
        });
        setHighlighted((prev) => {
          const cur = prev && typeof prev === 'object' ? prev : {};
          if (!cur[p]) return cur;
          const n = { ...cur };
          delete n[p];
          return n;
        });
        if (notifySuccess) toast.success('Marcado como lida');
      } catch (e) {
        try {
          toast.error(e, 'action');
        } catch {
          void 0;
        }
      }
    },
    [academyIdRef, setItems, setSelected, setHighlighted, toast]
  );

  const markUnread = useCallback(
    async (phone) => {
      const p = String(phone || '').trim();
      if (!p || !academyIdRef.current) return;
      try {
        await postInboxConversation({
          phone: p,
          academyId: academyIdRef.current,
          body: { action: 'unread' },
          fallbackError: 'Falha ao marcar como não lida',
        });
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map((it) => {
            const ph = String(it?.phone_number || '').trim();
            if (ph !== p) return it;
            const cur = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
            return { ...it, unread_count: Math.max(1, cur) };
          });
        });
        setSelected((prev) => {
          if (!prev || String(prev.phone || '').trim() !== p) return prev;
          return null;
        });
        setSelectedPhone((prevPhone) => (String(prevPhone || '').trim() === p ? '' : prevPhone));
        setConversationSheet(null);
        closeMenu();
        toast.success('Marcado como não lida');
      } catch (e) {
        try {
          toast.error(e, 'action');
        } catch {
          void 0;
        }
      }
    },
    [academyIdRef, closeMenu, setConversationSheet, setItems, setSelected, setSelectedPhone, toast]
  );

  const unarchiveConversation = useCallback(
    async (phone, { silent = false } = {}) => {
      const p = String(phone || '').trim();
      if (!p || !academyIdRef.current) return false;
      try {
        await postInboxConversation({
          phone: p,
          academyId: academyIdRef.current,
          body: { action: 'unarchive' },
          fallbackError: 'Falha ao desarquivar',
        });
        const curFilter = listFilterRef.current;
        setSelected((prev) => {
          if (!prev || String(prev.phone || '').trim() !== p) return prev;
          return { ...prev, archived: false };
        });
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          if (curFilter === 'archived') return arr.filter((it) => String(it?.phone_number || '').trim() !== p);
          return arr.map((it) => {
            const ph = String(it?.phone_number || '').trim();
            if (ph !== p) return it;
            return { ...it, archived: false };
          });
        });
        if (curFilter === 'archived' && String(selectedPhoneRef.current || '').trim() === p) {
          setSelectedPhone('');
          setSelected(null);
        }
        const fn = loadListRef.current;
        if (typeof fn === 'function') void fn({ reset: true, silent: true });
        if (!silent) toast.success('Conversa desarquivada');
        closeMenu();
        return true;
      } catch (e) {
        try {
          toast.error(e, 'action');
        } catch {
          void 0;
        }
        return false;
      }
    },
    [
      academyIdRef,
      closeMenu,
      listFilterRef,
      loadListRef,
      selectedPhoneRef,
      setItems,
      setSelected,
      setSelectedPhone,
      toast,
    ]
  );

  const archiveConversation = useCallback(
    async (phone) => {
      const p = String(phone || '').trim();
      if (!p || !academyIdRef.current) return;
      try {
        await postInboxConversation({
          phone: p,
          academyId: academyIdRef.current,
          body: { action: 'archive' },
          fallbackError: 'Falha ao arquivar',
        });
        const curFilter = listFilterRef.current;
        setSelected((prev) => {
          if (!prev || String(prev.phone || '').trim() !== p) return prev;
          return { ...prev, archived: true };
        });
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          if (curFilter !== 'archived') return arr.filter((it) => String(it?.phone_number || '').trim() !== p);
          return arr.map((it) => {
            const ph = String(it?.phone_number || '').trim();
            if (ph !== p) return it;
            return { ...it, archived: true };
          });
        });
        if (curFilter !== 'archived' && String(selectedPhoneRef.current || '').trim() === p) {
          setSelectedPhone('');
          setSelected(null);
        }
        const fn = loadListRef.current;
        if (typeof fn === 'function') void fn({ reset: true, silent: true });
        toast.show({
          type: 'info',
          message: 'Conversa arquivada',
          duration: 5000,
          action: {
            label: 'Desfazer',
            onClick: () => {
              void unarchiveConversation(p, { silent: true });
            },
          },
        });
        closeMenu();
      } catch (e) {
        try {
          toast.error(e, 'action');
        } catch {
          void 0;
        }
      }
    },
    [
      academyIdRef,
      closeMenu,
      listFilterRef,
      loadListRef,
      selectedPhoneRef,
      setItems,
      setSelected,
      setSelectedPhone,
      toast,
      unarchiveConversation,
    ]
  );

  const setHandoffActive = useCallback(
    async (ativo, { silent = false } = {}) => {
      const phone = String(selectedPhoneRef.current || '').trim();
      if (!phone) return false;
      if (!silent) setError('');
      try {
        const { blocked, data } = await postInboxConversation({
          phone,
          academyId: academyIdRef.current,
          body: { action: 'handoff', ativo: Boolean(ativo) },
          fallbackError: 'Falha ao atualizar o modo de atendimento',
        });
        if (blocked) return false;
        const until = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
        const active = Boolean(data?.need_human);
        setSelected((prev) => {
          if (!prev || prev.phone !== phone) return prev;
          return { ...prev, need_human: active, human_handoff_until: until || null };
        });
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map((it) => {
            const rowPhone = String(it?.phone_number || '').trim();
            if (rowPhone !== phone) return it;
            return { ...it, need_human: active, human_handoff_until: until || null };
          });
        });
        await loadList({ reset: true, silent: true });
        if (!silent) {
          toast.show({
            type: 'success',
            message: ativo ? 'Você assumiu esta conversa' : 'IA reativada',
          });
        }
        if (!ativo) setHandoffReleaseHint(false);
        return true;
      } catch (e) {
        if (!silent) setError(friendlyError(e, 'load'));
        return false;
      }
    },
    [academyIdRef, loadList, selectedPhoneRef, setError, setHandoffReleaseHint, setItems, setSelected, toast]
  );

  const updateTicket = useCallback(
    async ({ status, transferTo } = {}) => {
      const phone = String(selectedPhoneRef.current || '').trim();
      if (!phone) return false;
      const s = String(status || '').trim();
      if (!s) return false;
      if (ticketUpdating) return false;
      setTicketUpdating(true);
      setError('');
      try {
        const { blocked, data } = await postInboxConversation({
          phone,
          academyId: academyIdRef.current,
          body: {
            action: 'ticket',
            status: s,
            ...(transferTo ? { transfer_to: String(transferTo) } : {}),
          },
          fallbackError: 'Falha ao atualizar ticket',
        });
        if (blocked) return false;
        const nextStatus = typeof data?.ticket_status === 'string' ? data.ticket_status : s;
        const nextTransferTo = typeof data?.transfer_to === 'string' ? data.transfer_to : '';
        setSelected((prev) => {
          if (!prev || prev.phone !== phone) return prev;
          return { ...prev, ticket_status: nextStatus, transfer_to: nextTransferTo || null };
        });
        setItems((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map((it) => {
            const rowPhone = String(it?.phone_number || '').trim();
            if (rowPhone !== phone) return it;
            return { ...it, ticket_status: nextStatus, transfer_to: nextTransferTo || null };
          });
        });
        await loadList({ reset: true, silent: true });
        if (s === 'resolved') {
          toast.success('Conversa resolvida');
        } else if (s === 'open') {
          toast.success('Conversa reaberta');
        } else if (s === 'waiting_customer') {
          toast.success('Marcado como aguardando cliente');
        } else if (s === 'transferred') {
          toast.show({
            type: 'success',
            message: nextTransferTo ? `Conversa transferida para ${nextTransferTo}` : 'Conversa transferida',
          });
        }
        return true;
      } catch (e) {
        setError(friendlyError(e, 'action'));
        return false;
      } finally {
        setTicketUpdating(false);
      }
    },
    [academyIdRef, loadList, selectedPhoneRef, setError, setItems, setSelected, setTicketUpdating, ticketUpdating, toast]
  );

  const linkLeadToConversation = useCallback(
    async ({ leadId }) => {
      const phone = String(selectedPhoneRef.current || '').trim();
      if (!phone || !leadId) return;
      setLinkingLead(true);
      setError('');
      try {
        const { blocked, data } = await postInboxConversation({
          phone,
          academyId: academyIdRef.current,
          body: { action: 'link_lead', lead_id: leadId },
          fallbackError: 'Falha ao associar lead',
        });
        if (blocked) return;
        setSelected((prev) => {
          if (!prev || prev.phone !== phone) return prev;
          return {
            ...prev,
            lead_id: typeof data?.lead_id === 'string' ? data.lead_id : leadId,
            lead_name: typeof data?.lead_name === 'string' ? data.lead_name : prev.lead_name,
          };
        });
        await loadList({ reset: true, silent: true });
        toast.success(`${contactLabel} associado`);
        setLeadPanel(null);
        setLeadSearch('');
      } catch (e) {
        setError(friendlyError(e, 'action'));
      } finally {
        setLinkingLead(false);
      }
    },
    [
      academyIdRef,
      contactLabel,
      loadList,
      selectedPhoneRef,
      setError,
      setLeadPanel,
      setLeadSearch,
      setLinkingLead,
      setSelected,
      toast,
    ]
  );

  const saveContactName = useCallback(async () => {
    const phone = String(selectedPhoneRef.current || '').trim();
    if (!phone || savingContactName) return;
    const nextName = String(contactNameDraft || '').trim();
    const leadId = String(selected?.lead_id || '').trim();
    setSavingContactName(true);
    setError('');
    try {
      if (leadId) {
        if (!nextName) {
          toast.show({ type: 'error', message: 'Informe um nome' });
          return;
        }
        if (typeof updateLead !== 'function') {
          throw new Error('Não foi possível atualizar o contato');
        }
        await updateLead(leadId, { name: nextName });
        setSelected((prev) => {
          if (!prev || prev.phone !== phone) return prev;
          return { ...prev, lead_name: nextName };
        });
        setItems((prev) =>
          (Array.isArray(prev) ? prev : []).map((it) => {
            const rowPhone = String(it?.phone_number || '').trim();
            if (rowPhone !== phone) return it;
            return { ...it, lead_name: nextName };
          })
        );
        setEditingContactName(false);
        toast.show({ type: 'success', message: 'Nome atualizado' });
        return;
      }

      const { blocked, data } = await postInboxConversation({
        phone,
        academyId: academyIdRef.current,
        body: { action: 'set_contact_name', contact_name: nextName },
        fallbackError: 'Falha ao salvar nome do contato',
      });
      if (blocked) return;
      const savedName = String(data?.contact_name || '').trim();
      const savedSource = String(data?.contact_name_source || '').trim();
      const waProfileName = String(data?.whatsapp_profile_name || '').trim();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        return {
          ...prev,
          contact_name: savedName,
          contact_name_source: savedSource || (savedName ? 'manual' : ''),
          whatsapp_profile_name: waProfileName || prev.whatsapp_profile_name || '',
        };
      });
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((it) => {
          const rowPhone = String(it?.phone_number || '').trim();
          if (rowPhone !== phone) return it;
          return {
            ...it,
            contact_name: savedName,
            contact_name_source: savedSource || (savedName ? 'manual' : ''),
            whatsapp_profile_name: waProfileName || String(it?.whatsapp_profile_name || '').trim(),
          };
        })
      );
      setEditingContactName(false);
      toast.show({ type: 'success', message: savedName ? 'Nome do contato salvo' : 'Nome do contato removido' });
    } catch (e) {
      setError(friendlyError(e, 'save'));
    } finally {
      setSavingContactName(false);
    }
  }, [
    academyIdRef,
    contactNameDraft,
    savingContactName,
    selected,
    selectedPhoneRef,
    setEditingContactName,
    setError,
    setItems,
    setSavingContactName,
    setSelected,
    toast,
    updateLead,
  ]);

  const convertToLead = useCallback(async () => {
    const phone = String(selectedPhoneRef.current || '').trim();
    const name =
      String(leadNameDraft || '').trim() ||
      pickInboxDisplayName({
        leadName: selected?.lead_name,
        manualContactName: selected?.contact_name,
        whatsappProfileName: selected?.whatsapp_profile_name,
        phone,
      });
    if (!phone) return;
    setLinkingLead(true);
    setError('');
    try {
      const latestClass = (() => {
        const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.classificacao && typeof m.classificacao === 'object') return m.classificacao;
        }
        return {};
      })();
      const jwt = await getInboxJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/leads/convert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          name,
          type: String(leadTypeDraft || 'Adulto').trim(),
          classificacao: {
            intencao: String(latestClass?.intencao || '').trim(),
            prioridade: String(latestClass?.prioridade || '').trim(),
            lead_quente: String(latestClass?.lead_quente || '').trim(),
            precisa_resposta_humana: String(latestClass?.precisa_resposta_humana || '').trim(),
          },
        }),
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao converter lead', 'save'));
      const data = safeParseInboxJson(raw) || {};
      const leadId = String(data?.id || '').trim();
      if (!leadId) throw new Error('ID do lead ausente');
      await linkLeadToConversation({ leadId });
      toast.show({
        type: 'success',
        message: data?.ja_existe ? `${contactLabel} já existente` : `${contactLabel} criado`,
      });
      navigate(`/lead/${encodeURIComponent(leadId)}`);
    } catch (e) {
      setError(friendlyError(e, 'action'));
    } finally {
      setLinkingLead(false);
    }
  }, [
    academyIdRef,
    contactLabel,
    leadNameDraft,
    leadTypeDraft,
    linkLeadToConversation,
    navigate,
    selected,
    selectedPhoneRef,
    setError,
    setLinkingLead,
    toast,
  ]);

  const openPromptSettings = useCallback(() => {
    navigate('/agente-ia');
  }, [navigate]);

  return {
    markSeen,
    markUnread,
    unarchiveConversation,
    archiveConversation,
    setHandoffActive,
    updateTicket,
    linkLeadToConversation,
    saveContactName,
    convertToLead,
    openPromptSettings,
  };
}
