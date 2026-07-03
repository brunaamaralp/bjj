/**
 * Reconciliação saldo de estoque vs soma de stock_moves (auditoria offline).
 */
import {
  legacyAvailable,
  resolveCurrentQuantity,
  resolveSignedStockMoveQuantity,
  itemDisplayName,
  variantInventoryLabel,
} from './stockInventory.js';
import { hasDualPoolFields, rentalOut, totalPhysicalQuantity } from './dualStockPools.js';

export const STOCK_DELTA_CAUSES = {
  OK: 'ok',
  OK_EMPTY: 'ok_empty',
  LEGACY_OR_DIRECT_BALANCE: 'legacy_or_direct_balance',
  BALANCE_HIGHER_THAN_MOVES: 'balance_higher_than_moves',
  BALANCE_LOWER_THAN_MOVES: 'balance_lower_than_moves',
  LEGACY_FIELDS_DIVERGE: 'legacy_fields_diverge',
};

export const STOCK_DELTA_CAUSE_LABELS = {
  ok: 'OK — histórico fecha com o saldo',
  ok_empty: 'OK — sem saldo e sem movimentos',
  legacy_or_direct_balance: 'Saldo sem movimentos (cadastro/migração direta)',
  balance_higher_than_moves: 'Saldo maior que a soma dos movimentos',
  balance_lower_than_moves: 'Saldo menor que a soma dos movimentos',
  legacy_fields_diverge: 'Campos legados divergem de current_quantity',
};

/** @param {object} doc stock_moves document */
export function stockMoveDelta(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  if (tipo === 'avulso') return 0;
  return resolveSignedStockMoveQuantity(doc);
}

/** @param {object[]} moves */
export function sumStockMoveDeltas(moves) {
  let total = 0;
  for (const move of moves || []) {
    total += stockMoveDelta(move);
  }
  return Math.trunc(total);
}

function hasLegacyStockFields(item) {
  return (
    item?.quantidade_total != null ||
    item?.quantidade_vendida != null ||
    item?.quantidade_alugada != null
  );
}

/** @param {number} delta @param {number} moveCount @param {number} currentQty */
export function classifyStockDelta(delta, moveCount, currentQty) {
  const d = Math.trunc(Number(delta) || 0);
  const moves = Math.max(0, Math.trunc(Number(moveCount) || 0));
  const qty = Math.trunc(Number(currentQty) || 0);

  if (moves === 0 && qty === 0) return STOCK_DELTA_CAUSES.OK_EMPTY;
  if (moves === 0 && qty > 0) return STOCK_DELTA_CAUSES.LEGACY_OR_DIRECT_BALANCE;
  if (d === 0) return STOCK_DELTA_CAUSES.OK;
  if (d > 0) return STOCK_DELTA_CAUSES.BALANCE_HIGHER_THAN_MOVES;
  return STOCK_DELTA_CAUSES.BALANCE_LOWER_THAN_MOVES;
}

/** @param {object} item documento variante/estoque */
export function buildStockItemLabel(item, parentName = '') {
  const base = String(parentName || '').trim() || itemDisplayName(item);
  const vl = variantInventoryLabel({
    size: item?.size,
    color: item?.color,
    Tamanho: item?.Tamanho ?? item?.tamanho,
  });
  if (!vl || vl === 'Único') return base;
  return `${base} · ${vl}`;
}

/**
 * @param {object} item
 * @param {object[]} moves stock_moves for item
 * @param {object} [ctx]
 */
export function buildStockBalanceAuditRow(item, moves, ctx = {}) {
  const itemId = String(item?.$id || item?.id || '').trim();
  const currentQty = resolveCurrentQuantity(item);
  const calculatedQty = sumStockMoveDeltas(moves);
  const delta = currentQty - calculatedQty;
  const moveCount = (moves || []).length;

  let probableCause = classifyStockDelta(delta, moveCount, currentQty);

  const legacyQty = hasLegacyStockFields(item) ? legacyAvailable(item) : null;
  const legacyDelta =
    legacyQty != null && legacyQty !== currentQty ? currentQty - legacyQty : 0;
  if (legacyDelta !== 0 && probableCause === STOCK_DELTA_CAUSES.OK) {
    probableCause = STOCK_DELTA_CAUSES.LEGACY_FIELDS_DIVERGE;
  }

  const sorted = [...(moves || [])].sort(
    (a, b) => new Date(a.$createdAt || 0).getTime() - new Date(b.$createdAt || 0).getTime()
  );
  const firstMoveAt = sorted[0]?.$createdAt || '';
  const lastMoveAt = sorted[sorted.length - 1]?.$createdAt || '';

  const dual = hasDualPoolFields(item);
  const rentalOutQty = dual ? rentalOut(item) : 0;
  const physicalQty = dual ? totalPhysicalQuantity(item) : null;

  const openingBalanceSuggestion =
    delta > 0 && moveCount > 0 ? delta : delta > 0 && moveCount === 0 ? currentQty : 0;

  return {
    academy_id: String(ctx.academy_id || item?.academy_id || '').trim(),
    item_id: itemId,
    item_label: buildStockItemLabel(item, ctx.parent_name || ''),
    product_id: String(item?.product_id || '').trim(),
    current_quantity: currentQty,
    calculated_quantity: calculatedQty,
    delta,
    move_count: moveCount,
    first_move_at: firstMoveAt,
    last_move_at: lastMoveAt,
    probable_cause: probableCause,
    probable_cause_label: STOCK_DELTA_CAUSE_LABELS[probableCause] || probableCause,
    legacy_quantity: legacyQty,
    legacy_delta: legacyDelta,
    dual_pool: dual,
    rental_out: rentalOutQty,
    physical_quantity: physicalQty,
    sales_without_move_count: Number(ctx.sales_without_move_count) || 0,
    opening_balance_suggestion: openingBalanceSuggestion,
  };
}

/** @param {object[]} rows */
export function summarizeStockBalanceAudit(rows) {
  const list = rows || [];
  const divergent = list.filter((r) => r.delta !== 0 || r.probable_cause !== STOCK_DELTA_CAUSES.OK);
  const noMovesWithBalance = list.filter(
    (r) => r.move_count === 0 && r.current_quantity > 0
  );
  const salesGapItems = list.filter((r) => r.sales_without_move_count > 0);

  return {
    total: list.length,
    ok: list.filter((r) => r.probable_cause === STOCK_DELTA_CAUSES.OK).length,
    ok_empty: list.filter((r) => r.probable_cause === STOCK_DELTA_CAUSES.OK_EMPTY).length,
    divergent: divergent.length,
    no_moves_with_balance: noMovesWithBalance.length,
    sales_without_move_items: salesGapItems.length,
    sum_positive_delta: divergent.filter((r) => r.delta > 0).reduce((n, r) => n + r.delta, 0),
    sum_negative_delta: divergent.filter((r) => r.delta < 0).reduce((n, r) => n + r.delta, 0),
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} rows */
export function formatStockBalanceAuditCsv(rows) {
  const headers = [
    'academy_id',
    'item_id',
    'item_label',
    'current_quantity',
    'calculated_quantity',
    'delta',
    'move_count',
    'probable_cause',
    'probable_cause_label',
    'first_move_at',
    'last_move_at',
    'legacy_quantity',
    'legacy_delta',
    'dual_pool',
    'rental_out',
    'physical_quantity',
    'sales_without_move_count',
    'opening_balance_suggestion',
  ];
  const lines = [headers.join(',')];
  for (const row of rows || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Extrato cronológico com saldo acumulado (modo --item).
 * @param {object[]} moves
 */
export function buildStockMoveLedger(moves) {
  const sorted = [...(moves || [])].sort(
    (a, b) => new Date(a.$createdAt || 0).getTime() - new Date(b.$createdAt || 0).getTime()
  );
  let running = 0;
  return sorted.map((doc) => {
    const delta = stockMoveDelta(doc);
    running += delta;
    return {
      move_id: doc.$id,
      created_at: doc.$createdAt || '',
      tipo: String(doc.tipo || ''),
      quantidade: doc.quantidade,
      delta,
      running_balance: running,
      motivo: String(doc.motivo || '').trim(),
      sale_id: String(doc.sale_id || doc.referencia_id || '').trim(),
      usuario_id: String(doc.usuario_id || '').trim(),
    };
  });
}

/**
 * Vendas concluídas cujo item não tem stock_move correspondente.
 * @param {object[]} saleItems
 * @param {Map<string, Set<string>>} moveKeysBySaleId saleId -> Set of "stockId|saleItemId"
 */
export function findSaleItemsMissingStockMove(saleItems, moveKeysBySaleId, movesByItemId) {
  const missing = [];
  for (const it of saleItems || []) {
    const stockId = String(it.item_estoque_id || it.product_variant_id || '').trim();
    const saleId = String(it.venda_id || '').trim();
    const saleItemId = String(it.$id || '').trim();
    if (!stockId || !saleId) continue;

    const keys = moveKeysBySaleId.get(saleId) || new Set();
    const hasBySale =
      keys.has(`${stockId}|${saleItemId}`) ||
      keys.has(`${stockId}|`) ||
      keys.has(`|${saleItemId}`);

    const itemMoves = movesByItemId.get(stockId) || [];
    const hasOutbound = itemMoves.some((m) => {
      const tipo = String(m.tipo || '').toLowerCase();
      const ref = String(m.sale_id || m.referencia_id || '').trim();
      return (tipo === 'saida_venda' || tipo === 'saida_aluguel' || tipo === 'saida') && ref === saleId;
    });

    if (!hasBySale && !hasOutbound) {
      missing.push({
        sale_id: saleId,
        sale_item_id: saleItemId,
        item_estoque_id: stockId,
        quantidade: Math.trunc(Number(it.quantidade) || 0),
        line_kind: String(it.line_kind || 'sale'),
      });
    }
  }
  return missing;
}

/** @param {object[]} moves */
export function indexStockMovesByItemId(moves) {
  const map = new Map();
  for (const doc of moves || []) {
    const id = String(doc.item_estoque_id || '').trim();
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(doc);
  }
  return map;
}

/** @param {object[]} moves */
export function indexStockMoveKeysBySaleId(moves) {
  const map = new Map();
  for (const doc of moves || []) {
    const saleId = String(doc.sale_id || doc.referencia_id || '').trim();
    if (!saleId) continue;
    const stockId = String(doc.item_estoque_id || '').trim();
    const saleItemId = String(doc.sale_item_id || '').trim();
    if (!map.has(saleId)) map.set(saleId, new Set());
    map.get(saleId).add(`${stockId}|${saleItemId}`);
    if (stockId) map.get(saleId).add(`${stockId}|`);
    if (saleItemId) map.get(saleId).add(`|${saleItemId}`);
  }
  return map;
}

/** @param {object[]} missingSaleItems */
export function countMissingMovesByStockId(missingSaleItems) {
  const counts = new Map();
  for (const row of missingSaleItems || []) {
    const id = String(row.item_estoque_id || '').trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}
