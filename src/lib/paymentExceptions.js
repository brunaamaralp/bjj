/**
 * Visão de exceções de mensalidade — regras fixas; rótulos configuráveis em financeConfig.
 */
import {
  expectedAmountForStudent,
  receivedAmountForPayment,
} from './paymentStatus.js';
import { getPaymentRowStatus, studentDueDay, dueDateInMonth } from './collectionOverdue.js';

export const EXCEPTION_STATUS_KEYS = ['pending', 'awaiting', 'partial', 'divergence', 'none'];

export const DEFAULT_EXCEPTION_STATUS_LABELS = {
  pending: 'Pendente',
  awaiting: 'Aguardando',
  partial: 'Parcial',
  divergence: 'Divergência',
  none: 'Sem registro',
};

export const EXCEPTION_STATUS_COLORS = {
  pending: { bg: '#FCEBEB', color: '#A32D2D' },
  awaiting: { bg: '#FEF3C7', color: '#B45309' },
  partial: { bg: '#FFEDD5', color: '#C2410C' },
  divergence: { bg: '#EDE9FE', color: '#6D28D9' },
  none: { bg: '#f0f0f8', color: 'var(--text-secondary)' },
};

const PRIMARY_ORDER = ['pending', 'awaiting', 'partial', 'divergence', 'none'];

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function planPrices(financeConfig) {
  return (financeConfig?.plans || [])
    .map((p) => Number(p?.price))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Valor recebido não corresponde a nenhum plano cadastrado (tolerância 1 centavo). */
export function amountMatchesAnyPlan(financeConfig, amount) {
  const amt = roundMoney(amount);
  if (amt <= 0) return true;
  const prices = planPrices(financeConfig);
  if (!prices.length) return true;
  return prices.some((p) => Math.abs(p - amt) < 0.01);
}

function hasNonZeroDifference(expected, received) {
  return Math.abs(roundMoney(expected) - roundMoney(received)) > 0.009;
}

/**
 * @returns {{
 *   isException: boolean,
 *   reasons: string[],
 *   primaryStatus: string,
 *   expected: number,
 *   received: number,
 *   difference: number,
 *   row: ReturnType<typeof getPaymentRowStatus>,
 *   dbStatus: string,
 * }}
 */
export function analyzePaymentException(student, payment, currentMonth, financeConfig, today = new Date()) {
  const row = getPaymentRowStatus(student, payment, currentMonth, today);
  const db = String(payment?.status || '').toLowerCase();
  const expected = expectedAmountForStudent(student, financeConfig, payment);
  const received = receivedAmountForPayment(payment);
  const difference = roundMoney(expected - received);
  const reasons = [];

  const noPayment = !payment || db === 'cancelled';
  const overdue = row.daysOverdue > 0;

  if (db === 'awaiting') reasons.push('awaiting');
  if (db === 'partial') reasons.push('partial');

  if (noPayment) {
    if (overdue) reasons.push('pending');
    else reasons.push('none');
  } else if (db === 'pending' && overdue) {
    reasons.push('pending');
  } else if (!noPayment && row.status === 'pending' && overdue && db !== 'paid' && db !== 'partial' && db !== 'awaiting') {
    reasons.push('pending');
  }

  if (!noPayment && db !== 'cancelled') {
    if (hasNonZeroDifference(expected, received)) {
      if (db === 'paid' && !amountMatchesAnyPlan(financeConfig, received)) {
        reasons.push('divergence');
      } else if (db === 'paid' && hasNonZeroDifference(expected, received)) {
        reasons.push('divergence');
      } else if (db !== 'partial' && db !== 'awaiting' && received > 0) {
        reasons.push('divergence');
      }
    } else if (db === 'paid' && received > 0 && !amountMatchesAnyPlan(financeConfig, received)) {
      reasons.push('divergence');
    }
  }

  const unique = [...new Set(reasons)];
  let primaryStatus = 'pending';
  for (const k of PRIMARY_ORDER) {
    if (unique.includes(k)) {
      primaryStatus = k;
      break;
    }
  }

  const isException = unique.length > 0;

  return {
    isException,
    reasons: unique,
    primaryStatus,
    expected,
    received,
    difference,
    row,
    dbStatus: db,
  };
}

export function isPaymentExceptionResolved(student, payment, currentMonth, financeConfig, today = new Date()) {
  return !analyzePaymentException(student, payment, currentMonth, financeConfig, today).isException;
}

/** Contagem do badge da aba Exceções: com plano + problema financeiro real (não só dado incompleto). */
export function isRealPaymentException(student, payment, currentMonth, financeConfig, today = new Date()) {
  if (!String(student?.plan || '').trim()) return false;
  const analysis = analyzePaymentException(student, payment, currentMonth, financeConfig, today);
  if (!analysis.isException) return false;
  if (analysis.primaryStatus === 'none' && analysis.row.daysOverdue <= 0) return false;
  return true;
}

export function readExceptionStatusLabels(financeConfig) {
  const cfg = financeConfig && typeof financeConfig === 'object' ? financeConfig : {};
  const raw = cfg.exceptionStatusLabels || cfg.exception_status_labels || {};
  const out = { ...DEFAULT_EXCEPTION_STATUS_LABELS };
  for (const key of EXCEPTION_STATUS_KEYS) {
    const label = String(raw[key] || '').trim();
    if (label) out[key] = label.slice(0, 40);
  }
  return out;
}

export function mergeExceptionLabelsIntoFinanceConfig(financeConfig, labels) {
  const base = financeConfig && typeof financeConfig === 'object' ? { ...financeConfig } : {};
  const merged = { ...DEFAULT_EXCEPTION_STATUS_LABELS };
  for (const key of EXCEPTION_STATUS_KEYS) {
    const v = String(labels?.[key] ?? merged[key] ?? '').trim();
    if (v) merged[key] = v.slice(0, 40);
  }
  return { ...base, exceptionStatusLabels: merged };
}

export function labelForExceptionStatus(statusKey, labels) {
  return labels?.[statusKey] || DEFAULT_EXCEPTION_STATUS_LABELS[statusKey] || statusKey;
}

export function colorsForExceptionStatus(statusKey) {
  return EXCEPTION_STATUS_COLORS[statusKey] || EXCEPTION_STATUS_COLORS.none;
}

export function formatExceptionDueLabel(student, row, currentMonth) {
  const day = studentDueDay(student);
  const due = row?.dueDate || (currentMonth && day ? dueDateInMonth(currentMonth, day) : null);
  if (!day && !row?.dueDate) return '—';
  const base = day ? `dia ${day}` : '';
  if (row?.daysOverdue > 0) {
    return `${base}${base ? ' · ' : ''}${row.daysOverdue}d atraso`;
  }
  return base || '—';
}

export function studentTurma(student) {
  return String(
    student?.turma || student?.className || student?.class_name || student?.classId || ''
  ).trim();
}

export function studentPaymentPlatform(student, payment) {
  return String(
    payment?.account || student?.preferredPaymentAccount || student?.preferredPaymentMethod || ''
  ).trim() || '—';
}
