/**
 * Correção guiada de entrada de estoque (estorno Caixa + ajuste de quantidade).
 */
import { Query } from 'node-appwrite';
import { FINANCE_ORIGIN_STOCK_ENTRY } from '../../src/lib/financeOriginTypes.js';
import { reverseEligibilityError, reverseSettledFinanceTx } from './financeTxReverse.js';
import {
  createStockPurchaseFinanceTx,
  executeInventoryAdjustment,
  patchStockMoveFinancialTxId,
} from './inventoryMoveHandler.js';
import { resolveStockDocument } from './productCatalogDb.js';
import { itemDisplayName } from '../../src/lib/stockInventory.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import {
  maybeRevertWacAfterEntryCorrection,
  patchStockMoveCorrectedBy,
} from './stockEntryWac.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const CORRECTION_MODES = new Set(['finance_only', 'quantity_only', 'both']);

function formatMoveRef(iso, moveId) {
  const id = String(moveId || '').trim();
  const short = id.length > 6 ? id.slice(-6) : id;
  if (!iso) return `mov. …${short}`;
  const dt = new Date(iso);
  const date = Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return date ? `entrada de ${date} (mov. …${short})` : `mov. …${short}`;
}

async function loadMove(databases, dbId, stockMovesCol, moveId, academyId) {
  const id = String(moveId || '').trim();
  if (!id) return null;
  try {
    const doc = await databases.getDocument(dbId, stockMovesCol, id);
    if (academyId && doc.academy_id && String(doc.academy_id) !== academyId) return null;
    return doc;
  } catch {
    return null;
  }
}

async function resolveLinkedFinancialTx(databases, dbId, { moveId, financialTxId, academyId }) {
  const txId = String(financialTxId || '').trim();
  if (txId && FINANCIAL_TX_COL) {
    try {
      const doc = await databases.getDocument(dbId, FINANCIAL_TX_COL, txId);
      if (academyId && doc.academyId && String(doc.academyId) !== academyId) return null;
      return doc;
    } catch {
      void 0;
    }
  }
  if (!FINANCIAL_TX_COL || !moveId) return null;
  try {
    const res = await databases.listDocuments(dbId, FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('origin_type', FINANCE_ORIGIN_STOCK_ENTRY),
      Query.equal('origin_id', String(moveId)),
      Query.limit(5),
    ]);
    const docs = (res.documents || []).filter(
      (d) => String(d.origin_type || '').toLowerCase() !== 'reversal'
    );
    return docs[0] || null;
  } catch {
    return null;
  }
}

function entradaQuantityStored(move) {
  return Math.abs(Math.trunc(Number(move?.quantidade) || 0));
}

async function correctFinance({
  databases,
  dbId,
  stockMovesCol,
  stockItemsCol,
  academyId,
  academyDoc,
  move,
  me,
  newPurchasePrice,
  newPaymentMethod,
  note,
}) {
  const moveId = move.$id;
  const linked = await resolveLinkedFinancialTx(databases, dbId, {
    moveId,
    financialTxId: move.financial_tx_id,
    academyId,
  });

  let reversed = false;
  if (linked) {
    const st = String(linked.status || '').toLowerCase();
    if (st === 'settled') {
      const err = reverseEligibilityError(linked);
      if (err === 'already_reversed' || err === 'already_cancelled') {
        // segue para nova despesa se informada
      } else if (err) {
        throw new Error(err);
      } else {
        await reverseSettledFinanceTx({
          prevDoc: linked,
          academyId,
          me,
          reason: note || `Correção de ${formatMoveRef(move.$createdAt, moveId)}`,
        });
        reversed = true;
      }
    } else if (st === 'pending') {
      throw new Error('pending_tx_use_cancel');
    }
  }

  const price = Number(newPurchasePrice);
  let newFinancialTxId = null;
  if (Number.isFinite(price) && price > 0) {
    const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, move.item_estoque_id);
    const itemDoc = resolved?.doc || {};
    const fin = await createStockPurchaseFinanceTx(databases, dbId, academyDoc, {
      academyId,
      purchasePrice: price,
      itemName: itemDisplayName(itemDoc),
      quantity: entradaQuantityStored(move),
      unit: itemDoc.unit,
      paymentMethod: newPaymentMethod,
      stockMoveId: moveId,
    });
    newFinancialTxId = fin?.$id || null;
    if (newFinancialTxId) {
      await patchStockMoveFinancialTxId(databases, dbId, stockMovesCol, moveId, newFinancialTxId);
    }
  }

  await recordFinancialAudit({
    action: 'stock_entry_finance_correct',
    payment_id: newFinancialTxId || linked?.$id || moveId,
    academy_id: academyId,
    user_id: me.$id,
    amount: Number.isFinite(price) ? price : Number(linked?.gross) || 0,
    previous_status: linked?.status || 'none',
    new_status: newFinancialTxId ? 'settled' : reversed ? 'cancelled' : 'unchanged',
  });

  return { reversed, financial_tx_id: newFinancialTxId || '' };
}

async function correctQuantity({
  databases,
  dbId,
  stockItemsCol,
  stockMovesCol,
  academyId,
  move,
  me,
  newQuantity,
  note,
}) {
  const storedQty = entradaQuantityStored(move);
  const correctQty = Math.trunc(Number(newQuantity));
  if (!Number.isFinite(correctQty) || correctQty < 0) {
    throw new Error('invalid_quantity');
  }
  const delta = correctQty - storedQty;
  if (delta === 0) {
    return { adjustment_move_id: null, skipped: true };
  }

  const refLabel = formatMoveRef(move.$createdAt, move.$id);
  const adjustNote = String(note || '').trim() || `Quantidade correta: ${correctQty} (antes ${storedQty})`;
  const out = await executeInventoryAdjustment(databases, {
    dbId,
    stockItemsCol,
    stockMovesCol,
    variantId: move.item_estoque_id,
    quantityChange: delta,
    subtype: 'correcao_entrada',
    note: `${adjustNote} · ${refLabel}`,
    actorUserId: me.$id,
    actorName: String(me.name || me.email || 'Usuário').trim(),
    academy_id: academyId,
  });
  if (!out.ok) throw new Error(out.error || 'adjust_failed');

  if (out.movimento_id) {
    await patchStockMoveCorrectedBy(databases, dbId, stockMovesCol, move.$id, out.movimento_id);
  }

  let wacReverted = false;
  if (out.quantity_after != null) {
    const wac = await maybeRevertWacAfterEntryCorrection(databases, {
      dbId,
      stockItemsCol,
      stockMovesCol,
      academyId,
      move,
      quantityAfter: out.quantity_after,
    });
    wacReverted = Boolean(wac?.reverted);
  }

  return {
    adjustment_move_id: out.movimento_id,
    quantity_after: out.quantity_after,
    wac_reverted: wacReverted,
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 */
export async function executeStockEntryCorrection(databases, opts) {
  const {
    dbId,
    stockMovesCol,
    stockItemsCol,
    moveId,
    correction,
    newPurchasePrice,
    newPaymentMethod,
    newQuantity,
    note,
    academyId,
    academyDoc,
    me,
  } = opts;

  const mode = String(correction || '').trim().toLowerCase();
  if (!CORRECTION_MODES.has(mode)) {
    return { ok: false, status: 400, error: 'invalid_correction' };
  }

  const move = await loadMove(databases, dbId, stockMovesCol, moveId, academyId);
  if (!move) return { ok: false, status: 404, error: 'not_found' };
  if (String(move.tipo || '').toLowerCase() !== 'entrada') {
    return { ok: false, status: 400, error: 'only_entrada' };
  }

  const stepsCompleted = [];
  let financialTxId = String(move.financial_tx_id || '').trim();
  let adjustmentMoveId = null;
  let quantityAfter = null;
  let wacReverted = false;
  let partial = false;

  try {
    if (mode === 'finance_only' || mode === 'both') {
      const priceRaw = newPurchasePrice;
      const hasPrice =
        priceRaw !== undefined &&
        priceRaw !== null &&
        priceRaw !== '' &&
        Number.isFinite(Number(priceRaw)) &&
        Number(priceRaw) > 0;
      const linked = await resolveLinkedFinancialTx(databases, dbId, {
        moveId: move.$id,
        financialTxId: move.financial_tx_id,
        academyId,
      });
      const linkedSettled = linked && String(linked.status || '').toLowerCase() === 'settled';
      const linkedReversible =
        linkedSettled && !reverseEligibilityError(linked);

      if (!hasPrice && !linkedReversible && !linked) {
        return { ok: false, status: 400, error: 'finance_correction_required' };
      }

      const fin = await correctFinance({
        databases,
        dbId,
        stockMovesCol,
        stockItemsCol,
        academyId,
        academyDoc,
        move,
        me,
        newPurchasePrice: hasPrice ? Number(priceRaw) : null,
        newPaymentMethod,
        note,
      });
      if (fin.financial_tx_id) financialTxId = fin.financial_tx_id;
      stepsCompleted.push('finance');
    }

    if (mode === 'quantity_only' || mode === 'both') {
      if (newQuantity === undefined || newQuantity === null || newQuantity === '') {
        return { ok: false, status: 400, error: 'new_quantity_required' };
      }
      const qty = await correctQuantity({
        databases,
        dbId,
        stockItemsCol,
        stockMovesCol,
        academyId,
        move,
        me,
        newQuantity,
        note,
      });
      if (qty.adjustment_move_id) adjustmentMoveId = qty.adjustment_move_id;
      if (qty.quantity_after != null) quantityAfter = qty.quantity_after;
      if (qty.wac_reverted) wacReverted = true;
      stepsCompleted.push('quantity');
    }
  } catch (e) {
    const err = String(e?.message || e || 'correction_failed');
    return {
      ok: false,
      status: 400,
      error: err,
      partial: stepsCompleted.length > 0,
      steps_completed: stepsCompleted,
      financial_tx_id: financialTxId || null,
      adjustment_move_id: adjustmentMoveId,
    };
  }

  return {
    ok: true,
    status: 200,
    move_id: move.$id,
    financial_tx_id: financialTxId || null,
    adjustment_move_id: adjustmentMoveId,
    steps_completed: stepsCompleted,
    partial,
    wac_reverted: wacReverted,
    saldos: quantityAfter != null ? { current_quantity: quantityAfter } : undefined,
  };
}
