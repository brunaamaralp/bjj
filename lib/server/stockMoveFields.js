/**
 * Payload enriquecido de STOCK_MOVES + gravação tolerante ao schema Appwrite.
 */
import { ID } from 'node-appwrite';
import { roundMoney, sumPagamentosNet } from './salePayments.js';
import { readAverageCost } from '../../src/lib/weightedAverageCost.js';
import { createDocumentResilient } from './appwriteSchemaResilient.js';

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
    lineKind = 'sale',
  } = opts;

  const isRental = String(lineKind || 'sale').toLowerCase() === 'rental';
  const payload = {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: isRental ? 'saida_aluguel' : 'saida_venda',
    quantidade,
    referencia_id: vendaId,
    motivo: isRental ? 'aluguel' : 'venda',
    usuario_id: usuarioId,
    movement_kind: isRental ? 'rental' : 'sale',
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
    lineKind = 'sale',
  } = opts;

  const isRental = String(lineKind || 'sale').toLowerCase() === 'rental';
  const payload = {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: isRental ? 'devolucao' : 'reversao_venda',
    quantidade,
    referencia_id: vendaId,
    motivo: motivo || (isRental ? 'cancelamento_aluguel' : 'cancelamento_venda'),
    usuario_id: usuarioId,
    movement_kind: isRental ? 'rental' : 'return',
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

/**
 * @returns {Promise<import('node-appwrite').Models.Document|null>}
 */
export async function createStockMoveDocument(databases, { dbId, stockMovesCol, payload }) {
  if (!stockMovesCol || !dbId) return null;
  try {
    return await createDocumentResilient(databases, dbId, stockMovesCol, ID.unique(), payload);
  } catch (e) {
    console.warn('[stockMove] create skipped', e?.message || e);
    return null;
  }
}
