import { LEAD_STATUS } from './leadStatus.js';

/** @typedef {'on_track' | 'cooling' | 'critical'} FollowupTemperature */

export const FOLLOWUP_TEMPERATURE_ORDER = {
  critical: 0,
  cooling: 1,
  on_track: 2,
};

/**
 * Regras fallback (fase 1) — sem playbook.
 * @param {{ status?: string }} lead
 * @param {'attended' | 'missed'} kind
 * @param {number} daysAgo
 * @param {boolean} hasContactInCycle
 * @returns {FollowupTemperature}
 */
export function computeFallbackTemperature(lead, kind, daysAgo, hasContactInCycle) {
  if (kind === 'missed') {
    if (String(lead?.status || '').trim() !== LEAD_STATUS.MISSED) return 'on_track';
    if (daysAgo >= 3) return 'critical';
    if (daysAgo >= 1) return 'cooling';
    return 'on_track';
  }

  if (hasContactInCycle) return 'on_track';
  if (daysAgo >= 3) return 'critical';
  if (daysAgo >= 1) return 'cooling';
  return 'on_track';
}

/**
 * @param {number} daysAgo
 * @param {boolean} hasContactInCycle
 * @param {{ offset_days: number, skip_if_contacted?: boolean } | null} dueStep
 * @returns {FollowupTemperature}
 */
export function computePlaybookTemperature(daysAgo, hasContactInCycle, dueStep) {
  if (!hasContactInCycle && daysAgo >= 3) return 'critical';
  if (!dueStep) return hasContactInCycle ? 'on_track' : computeFallbackTemperature({ status: LEAD_STATUS.COMPLETED }, 'attended', daysAgo, hasContactInCycle);

  const offset = Number(dueStep.offset_days) || 0;
  if (!hasContactInCycle && daysAgo > offset + 1) return 'critical';
  if (!hasContactInCycle && daysAgo > offset) return 'cooling';
  return 'on_track';
}

export function temperatureLabel(temperature) {
  if (temperature === 'critical') return 'Crítico';
  if (temperature === 'cooling') return 'Esfriando';
  return 'Em dia';
}
