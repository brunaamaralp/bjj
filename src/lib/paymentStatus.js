/**
 * Status de mensalidade: paid | pending | awaiting | partial | cancelled
 * + status derivados de calendário: soon | none
 */
import { getPaymentRowStatus, openAmountForStudent, studentDueDay, dueDateInMonth } from './collectionOverdue.js';

export const PAYMENT_DB_STATUSES = ['paid', 'pending', 'awaiting', 'partial', 'cancelled', 'covered'];

export const GRID_STATUS_LABELS = {
  paid: 'Pago',
  covered: 'Coberto',
  awaiting: 'Aguardando',
  partial: 'Parcial',
  pending: 'Pendente',
  soon: 'A vencer',
  none: 'Sem registro',
};

export const GRID_STATUS_COLORS = {
  paid: { bg: '#EAF3DE', color: '#3B6D11' },
  covered: { bg: 'var(--v50, #f3f0ff)', color: 'var(--v700, #5B3FBF)' },
  awaiting: { bg: '#FEF3C7', color: '#B45309' },
  partial: { bg: '#FFEDD5', color: '#C2410C' },
  pending: { bg: '#FCEBEB', color: '#A32D2D' },
  soon: { bg: '#f0f0f8', color: 'var(--text-secondary)' },
  none: { bg: '#f0f0f8', color: 'var(--text-secondary)' },
};

export const HISTORY_BADGE = {
  paid: 'P',
  covered: 'C',
  awaiting: 'A',
  partial: 'Pa',
  pending: '—',
  soon: '·',
  none: '—',
};

export function expectedAmountForStudent(student, financeConfig, payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered') return 0;
  const fromPayment = Number(payment?.expected_amount);
  if (Number.isFinite(fromPayment) && fromPayment > 0) return fromPayment;
  return openAmountForStudent(student, payment, financeConfig);
}

export function receivedAmountForPayment(payment) {
  if (!payment) return 0;
  const st = String(payment.status || '').toLowerCase();
  if (st === 'covered') return 0;
  if (st === 'paid' || st === 'partial') {
    const paid = Number(payment.paid_amount);
    if (Number.isFinite(paid) && paid >= 0) return paid;
    return Number(payment.amount) || 0;
  }
  return 0;
}

/**
 * Status exibido na grade (prioriza registro no banco sobre calendário).
 * @returns {{ key: string, label: string, dbStatus: string|null, row: ReturnType<typeof getPaymentRowStatus> }}
 */
export function resolveGridDisplayStatus(student, payment, currentMonth, today = new Date()) {
  const row = getPaymentRowStatus(student, payment, currentMonth, today);
  const db = String(payment?.status || '').toLowerCase();

  if (db === 'cancelled' || !payment) {
    if (row.status === 'paid') {
      return { key: 'paid', label: GRID_STATUS_LABELS.paid, dbStatus: null, row };
    }
  }

  if (db === 'paid') {
    return { key: 'paid', label: GRID_STATUS_LABELS.paid, dbStatus: 'paid', row };
  }
  if (db === 'covered') {
    return {
      key: 'covered',
      label: GRID_STATUS_LABELS.covered,
      dbStatus: 'covered',
      row,
      bundleOriginId: String(payment.bundle_origin_id || '').trim() || null,
    };
  }
  if (db === 'awaiting') {
    return { key: 'awaiting', label: GRID_STATUS_LABELS.awaiting, dbStatus: 'awaiting', row };
  }
  if (db === 'partial') {
    return { key: 'partial', label: GRID_STATUS_LABELS.partial, dbStatus: 'partial', row };
  }
  if (db === 'pending') {
    if (row.status === 'soon') {
      return { key: 'soon', label: GRID_STATUS_LABELS.soon, dbStatus: 'pending', row };
    }
    if (row.status === 'pending' && row.daysOverdue > 0) {
      return { key: 'pending', label: GRID_STATUS_LABELS.pending, dbStatus: 'pending', row };
    }
    return { key: 'soon', label: GRID_STATUS_LABELS.soon, dbStatus: 'pending', row };
  }

  if (row.status === 'paid') {
    return { key: 'paid', label: GRID_STATUS_LABELS.paid, dbStatus: null, row };
  }
  if (row.status === 'pending') {
    return { key: 'pending', label: GRID_STATUS_LABELS.pending, dbStatus: null, row };
  }
  if (row.status === 'soon') {
    return { key: 'soon', label: GRID_STATUS_LABELS.soon, dbStatus: null, row };
  }
  return { key: 'none', label: GRID_STATUS_LABELS.none, dbStatus: null, row };
}

export function formatDueDayLabel(student) {
  const day = studentDueDay(student);
  if (!day) return '—';
  return `dia ${day}`;
}

export function monthKeysBack(fromYm, count) {
  const keys = [];
  const d = new Date(`${fromYm}-02T12:00:00`);
  for (let i = 0; i < count; i++) {
    keys.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() - 1);
  }
  return keys;
}

export function historyStatusForMonth(student, payment, ym) {
  if (!payment) {
    const due = dueDateInMonth(ym, studentDueDay(student));
    if (!due) return 'none';
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const due0 = new Date(due);
    due0.setHours(0, 0, 0, 0);
    if (due0 < today0) return 'pending';
    return 'none';
  }
  const db = String(payment.status || '').toLowerCase();
  if (db === 'paid') return 'paid';
  if (db === 'covered') return 'covered';
  if (db === 'awaiting') return 'awaiting';
  if (db === 'partial') return 'partial';
  if (db === 'pending') return 'pending';
  return 'none';
}

export function mapDbStatusFromGridForm(gridKey) {
  if (gridKey === 'paid') return 'paid';
  if (gridKey === 'awaiting') return 'awaiting';
  if (gridKey === 'partial') return 'partial';
  if (gridKey === 'pending') return 'pending';
  if (gridKey === 'soon') return 'pending';
  return 'pending';
}

export function shouldMirrorPaymentToCaixa(status) {
  const s = String(status || '').toLowerCase();
  return s === 'paid' || s === 'partial';
}

export function mirrorGrossForPayment(status, paidAmount, expectedAmount) {
  const s = String(status || '').toLowerCase();
  if (s === 'partial') {
    const p = Number(paidAmount);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }
  if (s === 'paid') {
    const p = Number(paidAmount);
    if (Number.isFinite(p) && p > 0) return p;
    const e = Number(expectedAmount);
    return Number.isFinite(e) && e > 0 ? e : 0;
  }
  return 0;
}
