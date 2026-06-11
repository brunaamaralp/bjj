import { useMemo } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import {
  FOLLOWUP_AGENDA_MAX_DAYS,
  enrichFollowUpLeads,
  sortFollowupsByTemperature,
  groupFollowUpsByTemperature,
  countFollowupsByTemperature,
} from '../lib/followupState.js';
import { computeFollowupHealthSummary } from '../lib/followupManagerHealth.js';

function excludeImportedOrigin(l) {
  return String(l?.origin || '').trim() !== 'Planilha';
}

/**
 * Retornos pendentes e saúde do follow-up — subscribe isolado em `leads[]`.
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

  const followupHealthSummary = useMemo(
    () =>
      computeFollowupHealthSummary(followUpsAll, {
        followupDoneByLead: followupEventsCtx.followupDoneByLead,
        followupContactByLead: followupEventsCtx.followupContactByLead,
        inboundAfterByLead: followupEventsCtx.inboundAfterByLead,
        inboundAfterByPhone: followupEventsCtx.inboundAfterByPhone,
      }),
    [followUpsAll, followupEventsCtx]
  );

  const showFollowupHealthPanel = useMemo(() => {
    if (!followupHealthSummary) return false;
    const { on_track, cooling, critical, d1RatePercent, attendedInWeek } = followupHealthSummary;
    const hasTemperatureActivity = on_track + cooling + critical > 0;
    const hasD1Metric = attendedInWeek > 0 && d1RatePercent !== null;
    return hasTemperatureActivity || hasD1Metric;
  }, [followupHealthSummary]);

  return {
    followUpsAll,
    followUps,
    followUpsKanbanOnlyCount,
    followupTemperatureCounts,
    followUpGroups,
    followupHealthSummary,
    showFollowupHealthPanel,
  };
}
