import { ATTENDANCE_RISK_STATUS } from '../../lib/attendanceRetentionCore.js';

/** Query param for status filter on the retention queue. */
export const URL_RET_STATUS = 'ret_status';

/**
 * @param {string | null | undefined} value
 * @returns {'' | 'at_risk' | 'absent'}
 */
export function resolveRetentionStatusFilter(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === ATTENDANCE_RISK_STATUS.AT_RISK || s === 'at_risk') {
    return ATTENDANCE_RISK_STATUS.AT_RISK;
  }
  if (s === ATTENDANCE_RISK_STATUS.ABSENT || s === 'absent') {
    return ATTENDANCE_RISK_STATUS.ABSENT;
  }
  return '';
}

/**
 * @param {URLSearchParams | Record<string, string>} prev
 * @param {string | null | undefined} status
 */
export function patchRetentionStatusParam(prev, status) {
  const next = prev instanceof URLSearchParams ? new URLSearchParams(prev) : new URLSearchParams(prev);
  const resolved = resolveRetentionStatusFilter(status);
  if (resolved) next.set(URL_RET_STATUS, resolved);
  else next.delete(URL_RET_STATUS);
  return next;
}

/**
 * @param {'' | 'at_risk' | 'absent'} status
 */
export function retentionStatusFilterLabel(status) {
  const resolved = resolveRetentionStatusFilter(status);
  if (resolved === ATTENDANCE_RISK_STATUS.AT_RISK) return 'Em risco';
  if (resolved === ATTENDANCE_RISK_STATUS.ABSENT) return 'Sumidos';
  return '';
}
