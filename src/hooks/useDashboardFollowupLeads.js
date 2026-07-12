import { useMemo } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import {
  FOLLOWUP_AGENDA_MAX_DAYS,
  enrichFollowUpLeads,
  sortFollowupsByTemperature,
  groupFollowUpsByTemperature,
  countFollowupsByTemperature,
} from '../lib/followupState.js';

function excludeImportedOrigin(l) {
  return String(l?.origin || '').trim() !== 'Planilha';
}

/**
 * Retornos pendentes — subscribe isolado em `leads[]`.
 * @param {object} followupEventsCtx
 */
export function useDashboardFollowupLeads(followupEventsCtx) {
  const leads = useLeadStore((s) => s.leads);

  const followUpsAll = useMemo(
    () =>
      enrichFollowUpLeads(
        leads.filter(
          (l) =>
            excludeImportedOrigin(l) &&
            (l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED)
        ),
        followupEventsCtx
      ),
    [leads, followupEventsCtx]
  );

  const followUpsKanbanOnlyCount = followUpsAll.filter(
    (l) => !l.doneForCurrentClass && !l.isSnoozed && l.daysAgo >= FOLLOWUP_AGENDA_MAX_DAYS
  ).length;

  const followUps = useMemo(
    () =>
      followUpsAll
        .filter((l) => !l.doneForCurrentClass && !l.isSnoozed && l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS)
        .sort(sortFollowupsByTemperature),
    [followUpsAll]
  );

  const followupTemperatureCounts = useMemo(() => countFollowupsByTemperature(followUps), [followUps]);

  const followUpGroups = useMemo(() => groupFollowUpsByTemperature(followUps), [followUps]);

  return {
    followUpsAll,
    followUps,
    followUpsKanbanOnlyCount,
    followupTemperatureCounts,
    followUpGroups,
  };
}
