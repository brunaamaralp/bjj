/**
 * Campos e normalização de FINANCIAL_TX (Caixa).
 * Mensalidade paga → entrada automática no Caixa; mensalidade pendente não gera lançamento pendente.
 */

export const FINANCIAL_TX_MIN = 0.01;
export const FINANCIAL_TX_MAX = 5_000_000;

export const VALID_TX_TYPES = new Set(['plan', 'product', 'expense', 'other', 'enrollment', 'refund']);

export function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export function isExpenseType(type) {
  return String(type || '').toLowerCase() === 'expense';
}

/** Saída = despesa; demais tipos = entrada na UI. */
export function txDirection(doc) {
  if (String(doc?.direction || '').toLowerCase() === 'out') return 'out';
  if (isExpenseType(doc?.type)) return 'out';
  return 'in';
}

export function normalizeTxAmounts({ type, gross, fee, net }) {
  const isExpense = isExpenseType(type);
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
  const n = Math.max(0, g - f);
  return { gross: g, fee: f, net: n, direction: 'in' };
}

export function mapFinanceTxDoc(doc) {
  if (!doc) return null;
  const direction = txDirection(doc);
  const gross = Math.abs(Number(doc.gross) || 0);
  const netRaw = Number(doc.net);
  const net = Number.isFinite(netRaw) ? Math.abs(netRaw) : gross;
  return {
    id: doc.$id,
    saleId: doc.saleId || '',
    lead_id: doc.lead_id || '',
    method: doc.method || '',
    installments: Number(doc.installments || 1),
    type: doc.type || '',
    planName: doc.planName || '',
    gross,
    fee: Number(doc.fee) || 0,
    net,
    direction,
    status: doc.status || 'pending',
    createdAt: doc.$createdAt || null,
    settledAt: doc.settledAt || '',
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
  const { gross, fee, net, direction } = normalizeTxAmounts({
    type: input.type,
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
    type: String(input.type || 'other'),
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
  } else {
    payload.settledAt = '';
  }

  return payload;
}
