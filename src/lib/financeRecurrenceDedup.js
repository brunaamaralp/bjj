/**
 * Dedupe instâncias recorrentes vs projeções (Previsão + A pagar).
 */

export function dueDateForRecurrenceMonth(recurrenceDay, ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Math.min(28, Math.max(1, Math.trunc(Number(recurrenceDay) || 1)));
  const lastDay = new Date(y, mo, 0).getDate();
  const dom = Math.min(day, lastDay);
  return `${y}-${String(mo).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
}

export function competenceMonthFromYmd(ymd) {
  const s = String(ymd || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

export function hasPendingInstanceForPeriod(pending = [], templateId, competenceMonth) {
  const tid = String(templateId || '').trim();
  const ym = String(competenceMonth || '').trim();
  if (!tid || !ym) return false;
  return pending.some((tx) => {
    if (String(tx.recurrence_origin_id || '').trim() !== tid) return false;
    if (String(tx.competence_month || '').trim() !== ym) return false;
    return String(tx.status || '').toLowerCase() === 'pending';
  });
}
