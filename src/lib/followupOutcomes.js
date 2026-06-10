import { LEAD_STATUS } from './leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { addDaysToYmd } from './enrollmentSettings.js';

export const FOLLOWUP_OUTCOMES = {
  INTERESTED: 'interested',
  THINKING: 'thinking',
  OBJECTION: 'objection',
  RESCHEDULE: 'reschedule',
  LOST: 'lost',
  ENROLLED: 'enrolled',
};

export const FOLLOWUP_OUTCOME_LABELS = {
  [FOLLOWUP_OUTCOMES.INTERESTED]: 'Interessado',
  [FOLLOWUP_OUTCOMES.THINKING]: 'Vai pensar',
  [FOLLOWUP_OUTCOMES.OBJECTION]: 'Objeção',
  [FOLLOWUP_OUTCOMES.RESCHEDULE]: 'Remarcar experimental',
  [FOLLOWUP_OUTCOMES.LOST]: 'Sem interesse',
  [FOLLOWUP_OUTCOMES.ENROLLED]: 'Matriculou',
};

export const OBJECTION_TYPES = {
  PRICE: 'price',
  SCHEDULE: 'schedule',
  OTHER: 'other',
};

export const OBJECTION_TYPE_LABELS = {
  [OBJECTION_TYPES.PRICE]: 'Preço',
  [OBJECTION_TYPES.SCHEDULE]: 'Horário',
  [OBJECTION_TYPES.OTHER]: 'Outro',
};

export const DEFAULT_SNOOZE_DAYS = 2;

export const OUTCOMES_WITH_SNOOZE = new Set([
  FOLLOWUP_OUTCOMES.INTERESTED,
  FOLLOWUP_OUTCOMES.THINKING,
]);

/**
 * @param {string} outcome
 * @param {object} opts
 * @param {string} [opts.objectionType]
 * @param {boolean} [opts.snooze]
 * @param {number} [opts.snoozeDays]
 */
export function buildOutcomeLeadPatch(outcome, opts = {}) {
  const key = String(outcome || '').trim();
  if (key === FOLLOWUP_OUTCOMES.LOST) {
    return {
      status: LEAD_STATUS.LOST,
      pipelineStage: LEAD_STATUS.LOST,
      scheduledDate: '',
      scheduledTime: '',
      lostAt: new Date().toISOString(),
    };
  }
  if (key === FOLLOWUP_OUTCOMES.ENROLLED) {
    return null;
  }
  if (key === FOLLOWUP_OUTCOMES.RESCHEDULE) {
    return null;
  }
  return {
    pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
  };
}

export function buildSnoozeUntilYmd(snoozeDays = DEFAULT_SNOOZE_DAYS, fromDate = new Date()) {
  return addDaysToYmd(snoozeDays, fromDate);
}
