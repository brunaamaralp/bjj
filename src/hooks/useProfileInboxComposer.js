import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyWhatsappTemplatePlaceholders,
  WHATSAPP_TEMPLATE_LABELS,
} from '../../lib/whatsappTemplateDefaults.js';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { friendlyError } from '../lib/errorMessages';
import { getInboxJwt, normalizeInboxApiError, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';
import { useTerms } from '../lib/terminology.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { useInboxComposerProps } from './useInboxComposerProps.js';
import { useInboxComposerUi } from './useInboxComposerUi.js';
import { useInboxDeferredBoot } from './useInboxDeferredBoot.js';
import { useInboxVisualViewport } from './useInboxVisualViewport.js';
import { useToast } from './useToast.js';

const EMOJIS = [
  '\u{1F600}',
  '\u{1F602}',
  '\u{1F60D}',
  '\u{1F970}',
  '\u{1F64F}',
  '\u{1F44D}',
  '\u{1F44F}',
  '\u{1F389}',
  '\u{1F525}',
  '\u{2705}',
  '\u{274C}',
  '\u{1F91D}',
  '\u{1F622}',
  '\u{1F914}',
  '\u{2B50}',
  '\u{1F4AA}',
  '\u{1F94B}',
  '\u{1F4CD}',
  '\u{1F4DE}',
  '\u{23F0}',
];

/**
 * Composer completo do Inbox para painéis embutidos (perfil do aluno/lead).
 */
export function useProfileInboxComposer({
  academyId,
  phone,
  leadId,
  leadName,
  summary,
  isMobile = false,
  waConnected = true,
  sendOutbound,
  sending = false,
}) {
  const toast = useToast();
  const terms = useTerms();
  const aiModuleEnabled = useLeadStore((s) => s.modules?.aiEnabled !== false);
  const { agentIaActive } = useInboxDeferredBoot(academyId);

  const phoneDigits = primaryInboxPhone(phone);
  const leadIdStr = String(leadId || summary?.lead_id || '').trim();

  const [draftState, setDraftState] = useState({ key: phoneDigits, draft: '' });
  const draft = draftState.key === phoneDigits ? draftState.draft : '';
  const setDraft = useCallback(
    (value) => {
      setDraftState((prev) => ({
        key: phoneDigits,
        draft: typeof value === 'function' ? value(prev.key === phoneDigits ? prev.draft : '') : value,
      }));
    },
    [phoneDigits]
  );

  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [improvingDraft, setImprovingDraft] = useState(false);
  const [draftBeforeImprove, setDraftBeforeImprove] = useState(null);
  const draftRef = useRef('');

  const {
    emojiOpen,
    setEmojiOpen,
    templatesOpen,
    setTemplatesOpen,
    slashOpen,
    setSlashOpen,
    slashQuery,
    setSlashQuery,
    slashIndex,
    setSlashIndex,
    composerExpanded,
    setComposerExpanded,
    textareaRef,
    slashPopupRef,
    slashActiveItemRef,
  } = useInboxComposerUi({ selectedPhone: phoneDigits });

  const { inboxVvInset, inboxSlashMaxHeight } = useInboxVisualViewport(isMobile);

  const { templates: whatsappTemplatesObj, academyName: academyNameForTemplates } = useWhatsappTemplates(
    academyId,
    { enabled: templatesOpen || slashOpen }
  );

  const quickTemplates = useMemo(() => {
    const raw = whatsappTemplatesObj;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([, tpl]) => typeof tpl === 'string' && String(tpl).trim())
      .map(([key, text]) => ({
        key,
        label: WHATSAPP_TEMPLATE_LABELS[key] || key,
        text: String(text),
      }));
  }, [whatsappTemplatesObj]);

  const slashFilteredTemplates = useMemo(() => {
    const q = String(slashQuery || '').trim().toLowerCase();
    return quickTemplates.filter(
      (t) =>
        !q ||
        String(t.label).toLowerCase().includes(q) ||
        String(t.text).toLowerCase().includes(q)
    );
  }, [quickTemplates, slashQuery]);

  const selected = useMemo(
    () => ({
      lead_id: leadIdStr,
      lead_name: String(leadName || summary?.lead_name || '').trim(),
    }),
    [leadIdStr, leadName, summary?.lead_name]
  );

  const getLeadById = useCallback((id) => {
    const lid = String(id || '').trim();
    if (!lid) return null;
    const leads = useLeadStore.getState().leads;
    return Array.isArray(leads) ? leads.find((l) => String(l?.id || '') === lid) || null : null;
  }, []);

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    if (!slashOpen) return;
    try {
      slashActiveItemRef.current?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      void 0;
    }
  }, [slashIndex, slashOpen, slashFilteredTemplates.length, slashActiveItemRef]);

  const applyWrapToDraft = useCallback(
    (prefix, suffix = prefix) => {
      const cur = String(draftRef.current || '');
      const el = textareaRef.current;
      const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
      const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
      const selectedText = cur.slice(start, end);
      const wrappingEmpty = start === end;
      const insert = wrappingEmpty ? `${prefix}${suffix}` : `${prefix}${selectedText}${suffix}`;
      const next = cur.slice(0, start) + insert + cur.slice(end);
      setDraft(next);
      setEmojiOpen(false);
      try {
        setTimeout(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          textarea.focus();
          if (wrappingEmpty) {
            const pos = start + prefix.length;
            textarea.setSelectionRange(pos, pos);
          } else {
            const selStart = start + prefix.length;
            const selEnd = selStart + selectedText.length;
            textarea.setSelectionRange(selStart, selEnd);
          }
        }, 0);
      } catch {
        void 0;
      }
    },
    [setDraft, setEmojiOpen, textareaRef]
  );

  const insertAtCursor = useCallback(
    (text) => {
      const cur = String(draftRef.current || '');
      const el = textareaRef.current;
      const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
      const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
      const next = cur.slice(0, start) + text + cur.slice(end);
      setDraft(next);
      try {
        setTimeout(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          textarea.focus();
          const pos = start + text.length;
          textarea.setSelectionRange(pos, pos);
        }, 0);
      } catch {
        void 0;
      }
    },
    [setDraft, textareaRef]
  );

  const applySlashTemplate = useCallback(
    (tpl) => {
      if (!tpl || typeof tpl.text !== 'string') return;
      const fromStore = leadIdStr ? getLeadById(leadIdStr) : null;
      const leadForTpl =
        fromStore || { name: selected.lead_name, lead_name: selected.lead_name };
      const out = applyWhatsappTemplatePlaceholders(tpl.text, {
        lead: leadForTpl,
        academyName: academyNameForTemplates,
      });
      setDraft(out);
      setSlashOpen(false);
      setSlashQuery('');
      setTimeout(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        const end = ta.value.length;
        ta.setSelectionRange(end, end);
      }, 0);
    },
    [
      academyNameForTemplates,
      getLeadById,
      leadIdStr,
      selected.lead_name,
      setDraft,
      setSlashOpen,
      setSlashQuery,
      textareaRef,
    ]
  );

  const handleDraftChange = useCallback(
    (e) => {
      const value = e.target.value;
      setDraft(value);
      if (!phoneDigits) {
        setSlashOpen(false);
        setSlashQuery('');
        return;
      }
      const parts = String(value || '')
        .split(/\s+/)
        .filter((p) => p.length > 0);
      const lastSeg = parts.length ? parts[parts.length - 1] : '';
      if (lastSeg.startsWith('/')) {
        setSlashQuery(lastSeg.slice(1));
        setSlashOpen(true);
      } else {
        setSlashOpen(false);
        setSlashQuery('');
      }
    },
    [phoneDigits, setDraft, setSlashOpen, setSlashQuery]
  );

  const improveDraftWithAi = useCallback(async () => {
    const current = String(draftRef.current || '');
    if (!phoneDigits || current.trim().length <= 3) return;
    setImprovingDraft(true);
    try {
      const jwt = await getInboxJwt();
      const aid = String(academyId || '').trim();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': aid,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'improve_reply',
          draft: current,
          phone: phoneDigits,
          academyId: aid,
        }),
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeInboxApiError(raw, 'Falha ao melhorar texto', 'action'));
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
      toast.error(friendlyError(e, 'action'));
    } finally {
      setImprovingDraft(false);
    }
  }, [academyId, phoneDigits, setDraft, textareaRef, toast]);

  const sendManual = useCallback(
    async ({ file, caption: captionArg } = {}) => {
      if (!waConnected || !phoneDigits) return;
      if (file && scheduleOn) {
        toast.show({ type: 'error', message: 'Agendamento não está disponível para envio de mídia.' });
        return;
      }
      const text = String(draft || '').trim();
      const caption = String(captionArg ?? '').trim();
      if (!text && !caption && !file) return;

      const ok = await sendOutbound({
        file,
        text,
        caption,
        sendAtLocal: scheduleOn && !file ? scheduleAtLocal : '',
      });
      if (ok) {
        setDraft('');
        setDraftBeforeImprove(null);
        setScheduleOn(false);
        setScheduleAtLocal('');
      }
    },
    [draft, phoneDigits, scheduleAtLocal, scheduleOn, sendOutbound, setDraft, toast, waConnected]
  );

  const composerProps = useInboxComposerProps({
    isMobile,
    inboxVvInset,
    composerExpanded,
    selectedPhone: phoneDigits,
    selected,
    templatesOpen,
    setTemplatesOpen,
    setEmojiOpen,
    quickTemplates,
    terms,
    getLeadById,
    academyNameForTemplates,
    setDraft,
    textareaRef,
    emojiOpen,
    emojis: EMOJIS,
    insertAtCursor,
    scheduleOn,
    setScheduleOn,
    sending,
    scheduleAtLocal,
    setScheduleAtLocal,
    improveDraftWithAi,
    improvingDraft,
    draft,
    draftBeforeImprove,
    setDraftBeforeImprove,
    slashOpen,
    slashPopupRef,
    inboxSlashMaxHeight,
    slashFilteredTemplates,
    slashIndex,
    setSlashIndex,
    slashActiveItemRef,
    applySlashTemplate,
    handleDraftChange,
    applyWrapToDraft,
    sendManual,
    setComposerExpanded,
    setSlashOpen,
    setSlashQuery,
    toast,
    agentIaActive,
    aiModuleEnabled,
  });

  return {
    composerProps,
    composerDisabled: !waConnected,
    composerPlaceholder: waConnected
      ? 'Digite uma mensagem…'
      : 'Conecte o WhatsApp para enviar mensagens',
  };
}
