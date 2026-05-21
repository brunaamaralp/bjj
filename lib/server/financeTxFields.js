/**
 * Campos e normalização de FINANCIAL_TX (Caixa).
 * Mensalidade paga → entrada automática no Caixa; mensalidade pendente não gera lançamento pendente.
 */

import { competenceMonthFromIso, parseCompetenceMonth } from '../../src/lib/financeCompetence.js';
import {
  defaultCategoryForTxType,
  normalizeFinanceCategory,
} from '../../src/lib/financeCategories.js';

export const FINANCIAL_TX_MIN = 0.01;
export const FINANCIAL_TX_MAX = 5_000_000;

export const VALID_TX_TYPES = new Set([
  'plan',
  'product',
  'expense',
  'expense_operational',
  'expense_financial',
  'card_fee',
  'stock_purchase',
  'other',
  'enrollment',
  'refund',
]);

export function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export function isExpenseType(type) {
  const t = String(type || '').toLowerCase();
  return (
    t === 'expense' ||
    t === 'stock_purchase' ||
    t === 'expense_operational' ||
    t === 'expense_financial' ||
    t === 'card_fee'
  );
}

export function isOutflowType(type) {
  return isExpenseType(type);
}

/** Saída = despesa / compra estoque; demais tipos = entrada na UI. */
export function txDirection(doc) {
  if (String(doc?.direction || '').toLowerCase() === 'out') return 'out';
  if (isExpenseType(doc?.type)) return 'out';
  if (String(doc?.type || '').toLowerCase() === 'refund') return 'in';
  return 'in';
}

export function normalizeTxAmounts({ type, gross, fee, net }) {
  const t = String(type || '').toLowerCase();
  const isRefund = t === 'refund';
  const isExpense = isExpenseType(t);
  let g = Math.abs(Number(gross) || 0);
  let f = Math.max(0, Number(fee) || 0);
  if (!Number.isFinite(g) || g < FINANCIAL_TX_MIN) {
    throw new Error('valor_invalido');
  }
  if (g > FINANCIAL_TX_MAX) throw new Error('valor_acima_do_limite');
  if (isExpense) {
    const n = -g;
    return { gross: g, fee: 0, net: n, direction: 'out' };
  }
  if (isRefund) {
    return { gross: g, fee: 0, net: -g, direction: 'in' };
  }
  const n = Math.max(0, g - f);
  return { gross: g, fee: f, net: n, direction: 'in' };
}

export function resolveCompetenceMonth(input, settledAt) {
  const explicit = parseCompetenceMonth(input?.competence_month);
  if (explicit) return explicit;
  return competenceMonthFromIso(settledAt || input?.settledAt);
}

export function mapFinanceTxDoc(doc) {
  if (!doc) return null;
  const direction = txDirection(doc);
  const gross = Math.abs(Number(doc.gross) || 0);
  const netRaw = Number(doc.net);
  const typeLc = String(doc.type || '').toLowerCase();
  let net;
  if (typeLc === 'refund') {
    net = Number.isFinite(netRaw) && netRaw < 0 ? netRaw : -gross;
  } else if (direction === 'out') {
    net = Number.isFinite(netRaw) ? netRaw : -gross;
  } else {
    net = Number.isFinite(netRaw) ? Math.abs(netRaw) : gross;
  }
  const type = doc.type || '';
  return {
    id: doc.$id,
    saleId: doc.saleId || '',
    lead_id: doc.lead_id || '',
    method: doc.method || '',
    installments: Number(doc.installments || 1),
    type,
    category: doc.category || defaultCategoryForTxType(type),
    planName: doc.planName || '',
    gross,
    fee: Number(doc.fee) || 0,
    net,
    direction,
    status: doc.status || 'pending',
    createdAt: doc.$createdAt || null,
    settledAt: doc.settledAt || '',
    competence_month: doc.competence_month || '',
    note: doc.note || '',
    origin_type: doc.origin_type || doc.originType || '',
    origin_id: doc.origin_id || doc.originId || '',
    created_by: doc.created_by || doc.createdBy || '',
    updated_by: doc.updated_by || doc.updatedBy || '',
    updated_at: doc.updated_at || doc.updatedAt || doc.$updatedAt || null,
  };
}

export function buildFinanceTxPayload(input, meta = {}) {
  const now = new Date().toISOString();
  const type = String(input.type || 'other').toLowerCase();
  const { gross, fee, net, direction } = normalizeTxAmounts({
    type,
    gross: input.gross,
    fee: input.fee,
    net: input.net,
  });

  const payload = {
    academyId: String(input.academyId || ''),
    saleId: String(input.saleId || ''),
    lead_id: String(input.lead_id || ''),
    method: String(input.method || 'pix'),
    installments: Math.min(12, Math.max(1, Number(input.installments) || 1)),
    type,
    category: normalizeFinanceCategory(input.category || defaultCategoryForTxType(type)),
    planName: String(input.planName || ''),
    gross,
    fee,
    net,
    direction,
    status: String(input.status || 'pending'),
    note: String(input.note || '').slice(0, 2000),
    origin_type: String(input.origin_type || meta.origin_type || 'manual').slice(0, 64),
    origin_id: String(input.origin_id || meta.origin_id || '').slice(0, 64),
    created_by: String(meta.created_by || input.created_by || 'system').slice(0, 64),
    updated_by: String(meta.updated_by || meta.created_by || 'system').slice(0, 64),
    updated_at: now,
  };

  if (payload.status === 'settled') {
    payload.settledAt = input.settledAt || now;
    const cm = resolveCompetenceMonth(input, payload.settledAt);
    if (cm) payload.competence_month = cm;
  } else {
    payload.settledAt = '';
  }

  return payload;
}
