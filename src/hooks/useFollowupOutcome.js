import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addLeadEvent } from '../lib/leadEvents.js';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useToast } from './useToast';
import {
  buildOutcomeLeadPatch,
  buildSnoozeUntilYmd,
  FOLLOWUP_OUTCOMES,
  OUTCOMES_WITH_SNOOZE,
} from '../lib/followupOutcomes.js';
import {
  patchFollowupDoneCache,
  patchFollowupSnoozeCache,
} from '../lib/followupEventsCache.js';
import { LEAD_PROFILE_FROM_DASHBOARD } from '../lib/pipelineSessionState.js';

/**
 * Fluxo compartilhado de conclusão de retorno (Dashboard, Inbox, Perfil).
 * @param {{ source?: string; navigateOnOutcome?: boolean; onSuccess?: (lead, outcome) => void }} [options]
 */
export function useFollowupOutcome(options = {}) {
  const source = String(options.source || 'app').trim();
  const navigateOnOutcome = options.navigateOnOutcome !== false;
  const onSuccess = options.onSuccess;
  const navigate = useNavigate();
  const toast = useToast();
  const updateLead = useLeadStore((s) => s.updateLead);

  const [outcomeLead, setOutcomeLead] = useState(null);
  const [saving, setSaving] = useState(false);

  const openOutcome = useCallback((lead) => {
    const leadId = String(lead?.id || '').trim();
    if (!leadId) return;
    setOutcomeLead(lead);
  }, []);

  const closeOutcome = useCallback(() => {
    if (!saving) setOutcomeLead(null);
  }, [saving]);

  const confirmOutcome = useCallback(
    async ({ outcome, objectionType, note, snooze, snoozeDays }) => {
      const lead = outcomeLead;
      const leadId = String(lead?.id || '').trim();
      if (!leadId || saving) return;

      setSaving(true);
      try {
        const st = useLeadStore.getState();
        const acad = (st.academyList || []).find((a) => a.id === st.academyId) || {};
        const permCtx = { ownerId: acad.ownerId, teamId: acad.teamId, userId: st.userId || '' };
        const nowIso = new Date().toISOString();
        const scheduledDate = lead.scheduledDate || '';

        const snoozeOnly = snooze && OUTCOMES_WITH_SNOOZE.has(outcome);
        const untilYmd = snooze ? buildSnoozeUntilYmd(snoozeDays) : '';

        if (snooze) {
          await addLeadEvent({
            academyId: st.academyId,
            leadId: lead.id,
            type: 'followup_snooze',
            text: 'Retorno adiado',
            createdBy: st.userId || 'user',
            permissionContext: permCtx,
            payloadJson: { scheduledDate, untilYmd, reason: outcome },
          });
          patchFollowupSnoozeCache(st.academyId, leadId, untilYmd);
        }

        if (!snoozeOnly) {
          await addLeadEvent({
            academyId: st.academyId,
            leadId: lead.id,
            type: 'followup_done',
            text: 'Retorno concluído',
            createdBy: st.userId || 'user',
            permissionContext: permCtx,
            payloadJson: {
              source,
              status: lead.status || '',
              scheduledDate,
              outcome,
              objectionType: objectionType || undefined,
              note: note || undefined,
              snoozeUntil: untilYmd || undefined,
            },
          });
          patchFollowupDoneCache(st.academyId, leadId, nowIso);
        }

        const patch = buildOutcomeLeadPatch(outcome, { objectionType });
        if (patch) await updateLead(leadId, patch);

        if (outcome === FOLLOWUP_OUTCOMES.LOST) {
          await addLeadEvent({
            academyId: st.academyId,
            leadId: lead.id,
            type: 'lost',
            from: lead?.status || '',
            to: LEAD_STATUS.LOST,
            text: note || 'Sem interesse (retorno)',
            createdBy: st.userId || 'user',
            permissionContext: permCtx,
          });
        }

        setOutcomeLead(null);
        toast.success(snoozeOnly ? 'Retorno adiado na lista.' : 'Retorno registrado.');

        if (navigateOnOutcome) {
          if (outcome === FOLLOWUP_OUTCOMES.ENROLLED) {
            navigate(`/lead/${leadId}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } });
            toast.info('Abra a matrícula no perfil do contato.');
          } else if (outcome === FOLLOWUP_OUTCOMES.RESCHEDULE) {
            navigate(`/lead/${leadId}`, { state: { from: LEAD_PROFILE_FROM_DASHBOARD } });
            toast.info('Reagende a experimental no perfil do contato.');
          }
        }

        onSuccess?.(lead, outcome);
      } catch (e) {
        toast.error(e, 'save');
      } finally {
        setSaving(false);
      }
    },
    [navigate, navigateOnOutcome, onSuccess, outcomeLead, saving, source, toast, updateLead]
  );

  return {
    outcomeLead,
    saving,
    openOutcome,
    closeOutcome,
    confirmOutcome,
  };
}
