/**
 * Backfill de quantity_before em stock_moves (cronológico por item).
 */
import { resolveSignedStockMoveQuantity } from './stockInventory.js';

function hasQuantityBefore(move) {
  const raw = move?.quantity_before;
  return raw != null && raw !== '' && Number.isFinite(Number(raw));
}

function moveTimestamp(move) {
  const t = new Date(move?.$createdAt || move?.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** @param {object[]} moves */
export function sortMovesChronological(moves) {
  return [...(moves || [])].sort((a, b) => {
    const diff = moveTimestamp(a) - moveTimestamp(b);
    if (diff !== 0) return diff;
    return String(a.$id || '').localeCompare(String(b.$id || ''));
  });
}

/**
 * Calcula quantity_before ausente percorrendo movimentos do mais antigo ao mais novo.
 * Usa movimentos já gravados como âncora quando existirem.
 *
 * @param {object[]} moves movimentos de um único item_estoque_id
 * @returns {{ move_id: string, item_estoque_id: string, quantity_before: number }[]}
 */
export function buildQuantityBeforeBackfillPlan(moves) {
  const sorted = sortMovesChronological(moves);
  /** @type {{ move_id: string, item_estoque_id: string, quantity_before: number }[]} */
  const plan = [];
  let running = null;

  for (const move of sorted) {
    const signedQty = resolveSignedStockMoveQuantity(move);
    const moveId = String(move.$id || '').trim();
    const itemId = String(move.item_estoque_id || '').trim();
    if (!moveId || !itemId) continue;

    if (hasQuantityBefore(move)) {
      running = Math.trunc(Number(move.quantity_before)) + signedQty;
      continue;
    }

    const before = running != null ? running : 0;
    plan.push({
      move_id: moveId,
      item_estoque_id: itemId,
      quantity_before: before,
    });
    running = before + signedQty;
  }

  return plan;
}

/**
 * @param {Map<string, object[]>} movesByItem
 */
export function buildQuantityBeforeBackfillPlanForAcademy(movesByItem) {
  const plan = [];
  for (const moves of movesByItem.values()) {
    plan.push(...buildQuantityBeforeBackfillPlan(moves));
  }
  return plan;
}

export function quantityBeforeBackfillPayload(row) {
  return {
    quantity_before: Math.trunc(Number(row.quantity_before) || 0),
  };
}
