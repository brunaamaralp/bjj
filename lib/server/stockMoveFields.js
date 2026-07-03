/**
 * Payload enriquecido de STOCK_MOVES + gravação tolerante ao schema Appwrite.
 */
import { ID } from 'node-appwrite';
import { roundMoney, sumPagamentosNet } from './salePayments.js';
import { readAverageCost, resolveCmvUnitCost } from '../../src/lib/weightedAverageCost.js';
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
  const avg = resolveCmvUnitCost(stockDoc || {});
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

/** Schema legado Appwrite: enum tipo = entrada | saida | ajuste */
export function stockMoveTipoForSchemaWrite(granularTipo) {
  const t = String(granularTipo || '').toLowerCase();
  if (t === 'saida_venda' || t === 'saida_aluguel') return 'saida';
  if (t === 'reversao_venda' || t === 'devolucao') return 'entrada';
  return t;
}

export function buildCadastroInicialStockMovePayload(opts) {
  const {
    academyId,
    itemEstoqueId,
    quantidade,
    usuarioId,
    quantityBefore = 0,
  } = opts;
  const qty = Math.trunc(Math.max(0, Number(quantidade) || 0));
  return {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: 'entrada',
    quantidade: qty,
    motivo: 'cadastro_inicial',
    referencia_id: `cadastro:${String(itemEstoqueId || '').trim()}`,
    usuario_id: usuarioId || '',
    quantity_before: Math.trunc(Math.max(0, Number(quantityBefore) || 0)),
    source: 'catalog',
    movement_kind: 'initial',
  };
}

/**
 * Grava entrada de cadastro inicial sem alterar current_quantity (saldo já definido na variante).
 * @returns {Promise<{ ok: boolean, movimento_id?: string, skipped?: boolean, error?: string }>}
 */
export async function recordCadastroInicialStockMove(databases, opts) {
  const { dbId, stockMovesCol, academyId, itemEstoqueId, quantidade, usuarioId, quantityBefore } = opts;
  const qty = Math.trunc(Math.max(0, Number(quantidade) || 0));
  if (!stockMovesCol || !dbId || qty <= 0) {
    return { ok: false, skipped: true };
  }
  const payload = buildCadastroInicialStockMovePayload({
    academyId,
    itemEstoqueId,
    quantidade: qty,
    usuarioId,
    quantityBefore,
  });
  const doc = await createStockMoveDocument(databases, { dbId, stockMovesCol, payload });
  if (!doc) {
    return { ok: false, error: 'stock_move_create_failed' };
  }
  return { ok: true, movimento_id: doc.$id };
}

/**
 * @returns {Promise<import('node-appwrite').Models.Document|null>}
 */
export async function createStockMoveDocument(databases, { dbId, stockMovesCol, payload }) {
  if (!stockMovesCol || !dbId) return null;
  const normalized = {
    ...payload,
    tipo: stockMoveTipoForSchemaWrite(payload.tipo),
  };
  try {
    return await createDocumentResilient(databases, dbId, stockMovesCol, ID.unique(), normalized);
  } catch (e) {
    console.warn('[stockMove] create skipped', e?.message || e);
    return null;
  }
}
