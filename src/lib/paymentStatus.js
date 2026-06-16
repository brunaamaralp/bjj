/**
 * Status de mensalidade: paid | pending | awaiting | partial | cancelled
 * + status derivados de calendário: soon | none
 */
import { parseCurrencyBRL } from './masks.js';
import { getPaymentRowStatus, openAmountForStudent, studentDueDay, dueDateInMonth } from './collectionOverdue.js';
import {
  canonicalPaymentMethodKey,
  isPlanFeeEligiblePaymentMethod,
  usesInstallmentCardFee,
} from './paymentMethods.js';

export const PAYMENT_DB_STATUSES = ['paid', 'pending', 'awaiting', 'partial', 'cancelled', 'covered', 'frozen'];

export const GRID_STATUS_LABELS = {
  paid: 'Pago',
  covered: 'Coberto',
  awaiting: 'Aguardando',
  partial: 'Parcial',
  pending: 'Pendente',
  soon: 'A vencer',
  none: 'Não registrado',
  frozen: 'Trancado',
};

export const GRID_STATUS_COLORS = {
  paid: { bg: '#EAF3DE', color: '#3B6D11' },
  covered: { bg: 'var(--v50, var(--azul-gelo))', color: 'var(--v700, var(--petroleo))' },
  awaiting: { bg: '#FEF3C7', color: '#B45309' },
  partial: { bg: '#FFEDD5', color: '#C2410C' },
  pending: { bg: '#FCEBEB', color: '#A32D2D' },
  soon: { bg: '#f0f0f8', color: 'var(--text-secondary)' },
  none: { bg: '#f0f0f8', color: 'var(--text-secondary)' },
  frozen: { bg: '#e8eef5', color: '#475569' },
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

function cardFeePercent(financeConfig, method, installments) {
  const fees = financeConfig?.cardFees || {};
  const key = canonicalPaymentMethodKey(method);

  if (usesInstallmentCardFee(key, installments)) {
    const n = Math.max(2, Math.min(12, Math.trunc(Number(installments) || 2)));
    const parcelado = fees.credito_parcelado || {};
    return Number(parcelado[String(n)] ?? parcelado[n] ?? 0) || 0;
  }
  if (key === 'cartao_credito') {
    return Number(fees.credito_avista?.percent ?? 0) || 0;
  }
  if (key === 'cartao_debito') {
    return Number(fees.debito?.percent ?? 0) || 0;
  }
  if (key === 'pix') {
    return Number(fees.pix?.percent ?? 0) || 0;
  }
  return 0;
}

/**
 * Valor esperado com repasse de taxa (cartão ou PIX) quando o plano tem applyCardFee.
 */
export function expectedAmountWithCardFee(student, financeConfig, method, installments, payment) {
  const base = expectedAmountForStudent(student, financeConfig, payment);
  if (!(base > 0)) return base;

  const planName = String(student?.plan || payment?.plan_name || '').trim();
  const plan = (financeConfig?.plans || []).find((p) => String(p?.name || '').trim() === planName);
  if (!plan?.applyCardFee) return base;

  const key = canonicalPaymentMethodKey(method);
  if (!isPlanFeeEligiblePaymentMethod(key)) return base;

  const pct = cardFeePercent(financeConfig, method, installments);
  if (!(pct > 0)) return base;
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

export function expectedAmountForStudent(student, financeConfig, payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return 0;
  const fromPayment = Number(payment?.expected_amount);
  if (Number.isFinite(fromPayment) && fromPayment > 0) return fromPayment;
  return openAmountForStudent(student, payment, financeConfig);
}

export function receivedAmountForPayment(payment) {
  if (!payment) return 0;
  const st = String(payment.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return 0;
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

  if (String(student?.freeze_status || student?.freezeStatus || '').trim() === 'active') {
    return { key: 'frozen', label: GRID_STATUS_LABELS.frozen, dbStatus: 'frozen', row };
  }

  if (db === 'frozen') {
    return { key: 'frozen', label: GRID_STATUS_LABELS.frozen, dbStatus: 'frozen', row };
  }

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

/**
 * Status simplificado para banner/badge do perfil (mês corrente).
 * `covered` e `frozen` contam como em dia — alinhado a getPaymentStatus e à grade de Mensalidades.
 * @param {string|{ key?: string, status?: string }|null|undefined} raw
 * @returns {'paid'|'pending'|'partial'|'awaiting'|'none'|string}
 */
export function normalizeProfilePaymentStatus(raw) {
  const key = String(
    raw && typeof raw === 'object' ? raw.key || raw.status || '' : raw || ''
  ).toLowerCase();
  if (!key || key === 'none') return 'none';
  if (key === 'paid' || key === 'covered' || key === 'frozen') return 'paid';
  if (key === 'awaiting') return 'awaiting';
  if (key === 'partial') return 'partial';
  if (key === 'pending') return 'pending';
  return key;
}

export function mapDbStatusFromGridForm(gridKey) {
  if (gridKey === 'paid') return 'paid';
  if (gridKey === 'awaiting') return 'awaiting';
  if (gridKey === 'partial') return 'partial';
  if (gridKey === 'pending') return 'pending';
  if (gridKey === 'soon') return 'pending';
  return 'pending';
}

export const PAYMENT_STATUS_POPOVER_FIELD_IDS = {
  paid_amount: 'payment-popover-amount',
  paid_at: 'payment-popover-paid-at',
};

/** Validação do popover de status na grade de mensalidades. */
export function validatePaymentStatusPopoverForm({ gridStatus, paidAmount, paidAt }) {
  const errors = {};
  const dbStatus = mapDbStatusFromGridForm(gridStatus);
  const paidNum = parseCurrencyBRL(paidAmount);
  if (dbStatus === 'paid' || dbStatus === 'partial') {
    if (!Number.isFinite(paidNum) || paidNum <= 0) {
      errors.paid_amount = 'Informe um valor maior que zero.';
    }
  }
  if (dbStatus !== 'awaiting') {
    const paidAtStr = String(paidAt || '').trim();
    if (!paidAtStr || !Number.isFinite(new Date(`${paidAtStr}T12:00:00`).getTime())) {
      errors.paid_at = 'Informe uma data válida.';
    }
  }
  return { errors, dbStatus, paidNum };
}

export function focusFirstPaymentStatusPopoverError(errors) {
  if (!errors || typeof document === 'undefined') return;
  for (const key of ['paid_amount', 'paid_at']) {
    if (!errors[key]) continue;
    const id = PAYMENT_STATUS_POPOVER_FIELD_IDS[key];
    const el = id ? document.getElementById(id) : null;
    if (el && typeof el.focus === 'function') {
      el.focus();
      return;
    }
  }
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
