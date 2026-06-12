import { useCallback, useMemo } from 'react';
import { useToast } from './useToast';
import { useFollowupOutcome } from './useFollowupOutcome.js';
import { isLeadPendingTriage, LEAD_TRIAGE_STATUS } from '../lib/leadTriage.js';
import { buildTriageConfirmClientPatch } from '../../lib/agentClassificationFields.js';
import {
  computeFollowupState,
  describePlaybookStep,
  isFollowUpLead,
} from '../lib/followupState.js';

/**
 * Lead ativo, follow-up, triagem e candidatos do painel associar (Conversas).
 */
export function useInboxLeadContext({
  selectedPhone,
  selected,
  leadById,
  leadByPhone,
  leadSearch,
  leadsForAssociate,
  followupPlaybook,
  followupDoneByLead,
  followupContactByLead,
  followupSnoozeUntilByLead,
  inboundAfterByLead,
  inboundAfterByPhone,
  quickTemplates,
  whatsappTemplatesObj,
  applySlashTemplate,
  normalizePhone,
  updateLead,
  setLinkingLead,
  setDismissTriageLead,
}) {
  const toast = useToast();

  const leadCandidates = useMemo(() => {
    const q = String(leadSearch || '').trim().toLowerCase();
    const qPhone = normalizePhone(q);
    const all = Array.isArray(leadsForAssociate) ? leadsForAssociate : [];
    const filtered = all.filter((l) => {
      const name = String(l?.name || '').toLowerCase();
      const phone = normalizePhone(l?.phone || '');
      if (!q && selectedPhone) return phone.endsWith(normalizePhone(selectedPhone));
      if (qPhone) return phone.includes(qPhone);
      return name.includes(q);
    });
    return filtered.slice(0, 20);
  }, [leadsForAssociate, leadSearch, selectedPhone, normalizePhone]);

  const activeContactLead = useMemo(() => {
    const phone = normalizePhone(selectedPhone);
    const leadId = String(selected?.lead_id || '').trim();
    if (leadId && leadById.has(leadId)) return leadById.get(leadId);
    if (phone && leadByPhone.has(phone)) return leadByPhone.get(phone);
    return null;
  }, [selectedPhone, selected?.lead_id, leadById, leadByPhone, normalizePhone]);

  const pendingTriage = isLeadPendingTriage(activeContactLead);

  const activeFollowupState = useMemo(() => {
    if (!activeContactLead || !isFollowUpLead(activeContactLead)) return null;
    const state = computeFollowupState(activeContactLead, {
      playbook: followupPlaybook,
      followupDoneByLead,
      followupContactByLead,
      followupSnoozeUntilByLead,
      inboundAfterByLead,
      inboundAfterByPhone,
    });
    if (!state) return null;
    return {
      ...state,
      nextActionLabel: describePlaybookStep(state.nextStep),
    };
  }, [
    activeContactLead,
    followupPlaybook,
    followupDoneByLead,
    followupContactByLead,
    followupSnoozeUntilByLead,
    inboundAfterByLead,
    inboundAfterByPhone,
  ]);

  const {
    outcomeLead: followupOutcomeLead,
    saving: savingFollowupOutcome,
    openOutcome: openFollowupOutcome,
    closeOutcome: closeFollowupOutcome,
    confirmOutcome: confirmFollowupOutcome,
  } = useFollowupOutcome({ source: 'inbox' });

  const handleFollowupSendTemplate = useCallback(
    (templateKey) => {
      const key = String(templateKey || '').trim();
      if (!key) return;
      const fromList = quickTemplates.find((t) => t.key === key);
      if (fromList) {
        applySlashTemplate(fromList);
        return;
      }
      const raw = whatsappTemplatesObj?.[key];
      if (typeof raw === 'string' && raw.trim()) {
        applySlashTemplate({ key, text: raw });
      }
    },
    [quickTemplates, whatsappTemplatesObj, applySlashTemplate]
  );

  const handleInboxConfirmTriage = useCallback(
    async (lead) => {
      const id = String(lead?.id || '').trim();
      if (!id) return;
      setLinkingLead(true);
      try {
        await updateLead(id, buildTriageConfirmClientPatch(lead), { fallbackLead: lead });
        toast.success('Lead confirmado');
      } catch (e) {
        toast.error(e, 'update');
      } finally {
        setLinkingLead(false);
      }
    },
    [setLinkingLead, toast, updateLead]
  );

  const handleInboxDismissTriage = useCallback(
    (lead) => {
      setDismissTriageLead(lead);
    },
    [setDismissTriageLead]
  );

  return {
    leadCandidates,
    activeContactLead,
    pendingTriage,
    activeFollowupState,
    followupOutcomeLead,
    savingFollowupOutcome,
    openFollowupOutcome,
    closeFollowupOutcome,
    confirmFollowupOutcome,
    handleFollowupSendTemplate,
    handleInboxConfirmTriage,
    handleInboxDismissTriage,
  };
}
