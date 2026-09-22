/**
 * Rótulos e hints de vencimento para a fila A pagar.
 */
import { todayYmdLocal } from './financeForecastCore.js';

function daysBetweenYmd(fromYmd, toYmd) {
  const a = String(fromYmd || '').slice(0, 10);
  const b = String(toYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

export function payableStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Vencida';
  if (s === 'due_today') return 'Vence hoje';
  if (s === 'due_soon') return 'Vence em breve';
  if (s === 'open') return 'A vencer';
  return 'Programada';
}

export function payableStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'finance-badge-atraso';
  if (s === 'due_today' || s === 'due_soon') return 'finance-badge-aguardando';
  return 'finance-badge-pendente';
}

export function payableDueRelativeHint(dueYmd, todayYmd = todayYmdLocal()) {
  const due = String(dueYmd || '').slice(0, 10);
  const today = String(todayYmd || '').slice(0, 10);
  const diff = daysBetweenYmd(today, due);
  if (diff == null) return '';
  if (diff === 0) return 'hoje';
  if (diff < 0) {
    const n = Math.abs(diff);
    return n === 1 ? 'há 1 dia' : `há ${n} dias`;
  }
  return diff === 1 ? 'em 1 dia' : `em ${diff} dias`;
}

/** Chip filter: week = due_today | due_soon */
export function payableMatchesStatusFilter(item, filter) {
  const f = String(filter || 'all').toLowerCase();
  if (f === 'all' || !f) return true;
  const st = String(item?.status || '').toLowerCase();
  if (f === 'week') return st === 'due_today' || st === 'due_soon';
  if (f === 'open') return st === 'open';
  if (f === 'overdue') return st === 'overdue';
  return true;
}
