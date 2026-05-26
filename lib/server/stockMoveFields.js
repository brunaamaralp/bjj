/**
 * Payload enriquecido de STOCK_MOVES + gravação tolerante ao schema Appwrite.
 */
import { ID } from 'node-appwrite';
import { roundMoney, sumPagamentosNet } from './salePayments.js';
import { readAverageCost } from '../../src/lib/weightedAverageCost.js';

/** Atributos novos de rastreabilidade (provision: npm run provision:stock-moves-enrich). */
export const STOCK_MOVE_TRACE_ATTRS = [
  'movement_kind',
  'product_id',
  'sale_id',
  'sale_item_id',
  'lead_id',
  'unit_price',
  'line_total',
  'payment_status_at_move',
  'payment_method',
  'usuario_name',
  'cmv_unit',
  'source',
  'notes',
];

const UNKNOWN_ATTR_RE = /Unknown attribute:\s*"?([^"\s]+)"?/i;

/**
 * @param {Array<{ forma?: string, valor?: number, troco?: number }>} pagamentosNorm
 * @param {number} totalRounded
 * @returns {'paid'|'partial'|'pending'}
 */
export function derivePaymentStatusAtMove(pagamentosNorm, totalRounded) {
  const total = roundMoney(totalRounded);
  if (!Array.isArray(pagamentosNorm) || !pagamentosNorm.length) {
    return 'paid';
  }
  const net = sumPagamentosNet(pagamentosNorm);
  if (net >= total - 0.009) return 'paid';
  if (net > 0.009) return 'partial';
  return 'pending';
}

export function paymentMethodFromPagamentos(pagamentosNorm) {
  const first = (pagamentosNorm || [])[0];
  return first?.forma ? String(first.forma).slice(0, 30) : null;
}

export function cmvUnitFromTotals(cmvLine, quantity, stockDoc) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const cmv = Number(cmvLine);
  if (Number.isFinite(cmv) && cmv >= 0 && qty > 0) {
    return roundMoney(cmv / qty);
  }
  const avg = readAverageCost(stockDoc || {});
  return Number.isFinite(avg) && avg >= 0 ? roundMoney(avg) : null;
}

/**
 * @param {object} opts
 */
export function buildSaleStockMovePayload(opts) {
  const {
    academyId,
    itemEstoqueId,
    quantidade,
    vendaId,
    saleItemId,
    productId,
    leadId,
    unitPrice,
    lineTotal,
    paymentStatusAtMove,
    paymentMethod,
    usuarioId,
    usuarioName,
    cmvUnit,
    notes = null,
  } = opts;

  const payload = {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: 'saida_venda',
    quantidade,
    referencia_id: vendaId,
    motivo: 'venda',
    usuario_id: usuarioId,
    movement_kind: 'sale',
    sale_id: vendaId,
    source: 'pos',
  };

  if (productId) payload.product_id = productId;
  if (saleItemId) payload.sale_item_id = saleItemId;
  if (leadId) payload.lead_id = leadId;
  if (Number.isFinite(unitPrice)) payload.unit_price = roundMoney(unitPrice);
  if (Number.isFinite(lineTotal)) payload.line_total = roundMoney(lineTotal);
  if (paymentStatusAtMove) payload.payment_status_at_move = String(paymentStatusAtMove).slice(0, 20);
  if (paymentMethod) payload.payment_method = String(paymentMethod).slice(0, 30);
  if (usuarioName) payload.usuario_name = String(usuarioName).slice(0, 80);
  if (cmvUnit != null && Number.isFinite(cmvUnit)) payload.cmv_unit = roundMoney(cmvUnit);
  if (notes) payload.notes = String(notes).slice(0, 512);

  return payload;
}

export function buildReturnStockMovePayload(opts) {
  const {
    academyId,
    itemEstoqueId,
    quantidade,
    vendaId,
    leadId,
    usuarioId,
    usuarioName,
    motivo,
    notes,
    productId,
    saleItemId,
    unitPrice,
    lineTotal,
  } = opts;

  const payload = {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: 'reversao_venda',
    quantidade,
    referencia_id: vendaId,
    motivo: motivo || 'cancelamento_venda',
    usuario_id: usuarioId,
    movement_kind: 'return',
    sale_id: vendaId,
    source: 'pos',
  };

  if (productId) payload.product_id = productId;
  if (saleItemId) payload.sale_item_id = saleItemId;
  if (leadId) payload.lead_id = leadId;
  if (usuarioName) payload.usuario_name = String(usuarioName).slice(0, 80);
  if (notes) payload.notes = String(notes).slice(0, 512);
  if (Number.isFinite(unitPrice)) payload.unit_price = roundMoney(unitPrice);
  if (Number.isFinite(lineTotal)) payload.line_total = roundMoney(lineTotal);

  return payload;
}

function stripUnknownStockMoveKeys(payload, unknownKey) {
  const key = String(unknownKey || '').trim();
  if (!key) return payload;
  const next = { ...payload };
  delete next[key];
  return next;
}

/**
 * @returns {Promise<import('node-appwrite').Models.Document>}
 */
export async function createStockMoveDocument(databases, { dbId, stockMovesCol, payload }) {
  let doc = { ...payload };
  for (let attempt = 0; attempt < STOCK_MOVE_TRACE_ATTRS.length + 3; attempt++) {
    try {
      return await databases.createDocument(dbId, stockMovesCol, ID.unique(), doc);
    } catch (e) {
      const msg = String(e?.message || '');
      const m = msg.match(UNKNOWN_ATTR_RE);
      if (!m) throw e;
      doc = stripUnknownStockMoveKeys(doc, m[1]);
      if (Object.keys(doc).length < 4) throw e;
    }
  }
  return databases.createDocument(dbId, stockMovesCol, ID.unique(), {
    item_estoque_id: payload.item_estoque_id,
    tipo: payload.tipo,
    quantidade: payload.quantidade,
    referencia_id: payload.referencia_id,
    motivo: payload.motivo,
    usuario_id: payload.usuario_id,
    academy_id: payload.academy_id,
  });
}
