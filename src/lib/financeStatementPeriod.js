/**
 * Normalização de período para DRE (competência) e DFC (caixa).
 */

import { competenceMonthsInRange } from './financeCompetence.js';

function parseYmd(value) {
  const s = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function parseYm(value) {
  const s = String(value || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

/** @param {{ from?: string, to?: string, month?: string }} period */
export function normalizeStatementPeriod(period = {}) {
  const month = parseYm(period.month);
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${month}-01`,
      to: `${month}-${String(lastDay).padStart(2, '0')}`,
      months: [month],
    };
  }

  const from = parseYmd(period.from);
  const to = parseYmd(period.to);
  if (!from || !to) {
    return { from: '', to: '', months: [] };
  }
  return {
    from,
    to,
    months: competenceMonthsInRange(from, to),
  };
}

export function ymdInInclusiveRange(ymd, from, to) {
  const d = parseYmd(ymd);
  if (!d || !from || !to) return false;
  return d >= from && d <= to;
}
