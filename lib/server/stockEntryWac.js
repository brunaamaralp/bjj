/**
 * Rollback conservador de custo médio (WAC) após correção de quantidade de entrada.
 */
import { Query } from 'node-appwrite';
import { readAverageCost } from '../../src/lib/weightedAverageCost.js';
import { resolveStockDocument } from './productCatalogDb.js';

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} move stock_moves document
 * @param {number} quantityAfter saldo após ajuste
 */
export function shouldRevertWacAfterEntryCorrection(move, quantityAfter) {
  const snapQty = move?.quantity_before;
  const snapAvg = move?.average_cost_before;
  if (snapQty == null || snapAvg == null || snapAvg === '') return false;
  const target = Math.trunc(Number(snapQty));
  const after = Math.trunc(Number(quantityAfter));
  if (!Number.isFinite(target) || !Number.isFinite(after)) return false;
  return after === target;
}

/**
 * @param {import('node-appwrite').Databases} databases
 */
export async function hasLaterEntradaAfterMove(
  databases,
  dbId,
  stockMovesCol,
  { itemId, academyId, moveCreatedAt, moveId }
) {
  const id = String(itemId || '').trim();
  if (!id || !stockMovesCol) return false;
  const queries = [
    Query.equal('item_estoque_id', id),
    Query.equal('tipo', 'entrada'),
    Query.orderDesc('$createdAt'),
    Query.limit(25),
  ];
  if (academyId) {
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      void 0;
    }
  }
  let docs = [];
  try {
    const res = await databases.listDocuments(dbId, stockMovesCol, queries);
    docs = res.documents || [];
  } catch {
    return false;
  }
  const pivot = new Date(moveCreatedAt || 0).getTime();
  const selfId = String(moveId || '').trim();
  for (const doc of docs) {
    if (selfId && doc.$id === selfId) continue;
    const t = new Date(doc.$createdAt || 0).getTime();
    if (Number.isFinite(pivot) && Number.isFinite(t) && t > pivot) return true;
  }
  return false;
}

export async function patchStockMoveCorrectedBy(databases, dbId, stockMovesCol, moveId, adjustmentMoveId) {
  if (!moveId || !adjustmentMoveId || !stockMovesCol) return;
  try {
    await databases.updateDocument(dbId, stockMovesCol, moveId, {
      corrected_by_move_id: String(adjustmentMoveId).slice(0, 64),
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (/unknown attribute/i.test(msg)) {
      console.warn(
        JSON.stringify({
          event: 'stock_move_corrected_by_attr_missing',
          move_id: moveId,
          adjustment_move_id: adjustmentMoveId,
        })
      );
      return;
    }
    throw e;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 */
export async function maybeRevertWacAfterEntryCorrection(databases, opts) {
  const {
    dbId,
    stockItemsCol,
    stockMovesCol,
    academyId,
    move,
    quantityAfter,
  } = opts;

  if (!shouldRevertWacAfterEntryCorrection(move, quantityAfter)) {
    return { reverted: false, reason: 'quantity_mismatch' };
  }

  const later = await hasLaterEntradaAfterMove(databases, dbId, stockMovesCol, {
    itemId: move.item_estoque_id,
    academyId,
    moveCreatedAt: move.$createdAt,
    moveId: move.$id,
  });
  if (later) {
    return { reverted: false, reason: 'later_entrada' };
  }

  const snapAvg = Number(move.average_cost_before);
  if (!Number.isFinite(snapAvg) || snapAvg < 0) {
    return { reverted: false, reason: 'no_snapshot' };
  }

  const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, move.item_estoque_id);
  if (!resolved?.doc) return { reverted: false, reason: 'item_not_found' };
  if (academyId && resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
    return { reverted: false, reason: 'academy_mismatch' };
  }

  const stockCol = resolved.collection || stockItemsCol;
  const currentAvg = readAverageCost(resolved.doc);
  if (Math.abs(currentAvg - snapAvg) < 0.0001) {
    return { reverted: false, reason: 'already_matches', average_cost: snapAvg };
  }

  await databases.updateDocument(dbId, stockCol, move.item_estoque_id, {
    average_cost: snapAvg,
    last_updated: nowIso(),
  });

  console.warn(
    JSON.stringify({
      event: 'stock_entry_wac_reverted',
      academy_id: academyId,
      move_id: move.$id,
      item_estoque_id: move.item_estoque_id,
      average_cost_before: snapAvg,
      previous_average_cost: currentAvg,
    })
  );

  return { reverted: true, average_cost: snapAvg };
}
