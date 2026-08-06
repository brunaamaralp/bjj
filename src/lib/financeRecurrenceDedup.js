/**
 * Dedupe instâncias recorrentes vs projeções (Previsão + A pagar).
 */

/** Status que cobrem a competência (não projetar / não reabrir na fila). */
const COVERING_INSTANCE_STATUSES = new Set(['pending', 'settled', 'cancelled']);

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

/**
 * Instância pending/settled/cancelled para o período — evita reabrir conta já liquidada
 * ou projetar mês já gerado.
 */
export function hasInstanceForPeriod(instances = [], templateId, competenceMonth) {
  const tid = String(templateId || '').trim();
  const ym = String(competenceMonth || '').trim();
  if (!tid || !ym) return false;
  return instances.some((tx) => {
    if (String(tx.recurrence_origin_id || '').trim() !== tid) return false;
    if (String(tx.competence_month || '').trim() !== ym) return false;
    return COVERING_INSTANCE_STATUSES.has(String(tx.status || '').toLowerCase());
  });
}

/** Qualquer instância pendente do template — evita fila com vencimento atual + projeção do próximo mês. */
export function hasAnyPendingInstanceForTemplate(pending = [], templateId) {
  const tid = String(templateId || '').trim();
  if (!tid) return false;
  return pending.some((tx) => {
    if (String(tx.recurrence_origin_id || '').trim() !== tid) return false;
    return String(tx.status || '').toLowerCase() === 'pending';
  });
}
