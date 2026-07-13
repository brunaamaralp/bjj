/**
 * Registro unificado de empréstimo/aluguel de kimono — qualquer saída do pool rental.
 */
import { ID, Query } from 'node-appwrite';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';
import { resolveStockDocument } from './productCatalogDb.js';
import { itemDisplayName, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import {
  isRentalEligibleParent,
  KIMONO_BORROWER_TYPES,
  KIMONO_LOAN_STATUS,
} from '../kimonoLoanCore.js';
import {
  isRentalStockOutMove,
  resolveBorrowerFromStockMove,
} from '../../src/lib/kimonoLoanBorrower.js';

export { resolveBorrowerFromSale, resolveBorrowerFromStockMove, isRentalStockOutMove } from '../../src/lib/kimonoLoanBorrower.js';

const KIMONO_LOANS_COL =
  process.env.KIMONO_LOANS_COL ||
  process.env.VITE_APPWRITE_KIMONO_LOANS_COLLECTION_ID ||
  'kimono_loans';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';

function buildItemLabel(parent, variant) {
  const parentName = parent?.name || parent?.nome || itemDisplayName(variant);
  const vl = variantInventoryLabel({
    size: variant?.size,
    color: variant?.color,
    Tamanho: variant?.Tamanho ?? variant?.tamanho,
  });
  return vl === 'Único' ? parentName : `${parentName} · ${vl}`;
}

async function loanExistsForMove(databases, dbId, stockMoveOutId) {
  if (!stockMoveOutId) return false;
  try {
    const res = await databases.listDocuments(dbId, KIMONO_LOANS_COL, [
      Query.equal('stock_move_out_id', [String(stockMoveOutId)]),
      Query.limit(1),
    ]);
    return (res.documents || []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Cria 1 registro kimono_loans por unidade emprestada/alugada.
 */
export async function createKimonoLoanRecords(databases, ctx) {
  const {
    dbId,
    academyId,
    variantId,
    parent,
    variant,
    quantity = 1,
    stockMoveOutId,
    lentAt,
    borrowerType,
    borrowerId,
    borrowerName,
    lentByUserId,
    notes,
    source,
  } = ctx;

  if (!KIMONO_LOANS_COL) {
    const err = new Error('kimono_loans_collection_missing');
    err.code = 'kimono_loans_collection_missing';
    throw err;
  }
  if (!isRentalEligibleParent(parent)) return { created: [], skipped: true };

  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  const itemLabel = buildItemLabel(parent, variant);
  const sizeLabel = String(variant?.size || variant?.Tamanho || '').trim() || '—';
  const lentAtIso = lentAt || new Date().toISOString();
  const noteParts = [notes, source ? `origem:${source}` : ''].filter(Boolean);
  const notesStr = noteParts.join(' · ').slice(0, 500);

  const created = [];
  for (let i = 0; i < qty; i += 1) {
    const moveId = i === 0 ? stockMoveOutId : '';
    if (moveId && (await loanExistsForMove(databases, dbId, moveId))) {
      continue;
    }
    const doc = await createDocumentResilient(databases, dbId, KIMONO_LOANS_COL, ID.unique(), {
      academy_id: academyId,
      variant_id: variantId,
      product_id: parent?.$id || parent?.id || variant?.product_id || '',
      borrower_type: borrowerType,
      borrower_id: String(borrowerId || '').slice(0, 64),
      borrower_name: String(borrowerName || '—').slice(0, 120),
      size_label: sizeLabel.slice(0, 32),
      item_label: itemLabel.slice(0, 160),
      status: KIMONO_LOAN_STATUS.OUT,
      lent_at: lentAtIso,
      stock_move_out_id: moveId ? String(moveId).slice(0, 64) : '',
      notes: notesStr,
      lent_by_user_id: String(lentByUserId || '').slice(0, 64),
    });
    created.push(doc);
  }
  return { created, skipped: false };
}

export async function recordKimonoLoanAfterRentalExit(databases, opts) {
  const {
    dbId,
    stockItemsCol,
    academyId,
    variantId,
    resolved,
    quantity = 1,
    stockMoveOutId,
    lentAt,
    borrower,
    lentByUserId,
    notes,
    source,
    move,
  } = opts;

  let parent = resolved?.parent || null;
  let variant = resolved?.doc || null;
  if (!variant && variantId) {
    const r = await resolveStockDocument(databases, dbId, stockItemsCol, variantId);
    parent = r?.parent || parent;
    variant = r?.doc || variant;
  }
  if (!variant || !isRentalEligibleParent(parent)) return { created: [], skipped: true };

  const b =
    borrower ||
    (move ? resolveBorrowerFromStockMove(move) : {
      borrower_type: KIMONO_BORROWER_TYPES.CLIENT,
      borrower_id: stockMoveOutId || '',
      borrower_name: 'Uso interno',
    });
  return createKimonoLoanRecords(databases, {
    dbId,
    academyId,
    variantId: String(variantId || variant.$id || variant.id),
    parent,
    variant,
    quantity,
    stockMoveOutId,
    lentAt,
    borrowerType: b.borrower_type || KIMONO_BORROWER_TYPES.CLIENT,
    borrowerId: b.borrower_id || stockMoveOutId || '',
    borrowerName: b.borrower_name || '—',
    lentByUserId,
    notes,
    source,
  });
}

/** Fecha empréstimos ligados a movimentos de uma venda (cancelamento). */
export async function closeKimonoLoansForSale(databases, dbId, { academyId, saleId, returnedByUserId }) {
  if (!KIMONO_LOANS_COL || !STOCK_MOVES_COL || !saleId) return { closed: 0 };

  const movesRes = await databases.listDocuments(dbId, STOCK_MOVES_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('sale_id', [String(saleId)]),
    Query.equal('movement_kind', ['rental']),
    Query.limit(100),
  ]);
  const moveIds = (movesRes.documents || [])
    .filter(isRentalStockOutMove)
    .map((d) => d.$id)
    .filter(Boolean);
  if (!moveIds.length) return { closed: 0 };

  let closed = 0;
  const returnedAt = new Date().toISOString();
  for (const moveId of moveIds) {
    const loansRes = await databases.listDocuments(dbId, KIMONO_LOANS_COL, [
      Query.equal('academy_id', [academyId]),
      Query.equal('stock_move_out_id', [moveId]),
      Query.equal('status', [KIMONO_LOAN_STATUS.OUT]),
      Query.limit(20),
    ]);
    for (const loan of loansRes.documents || []) {
      await updateDocumentResilient(databases, dbId, KIMONO_LOANS_COL, loan.$id, {
        status: KIMONO_LOAN_STATUS.RETURNED,
        returned_at: returnedAt,
        returned_by_user_id: String(returnedByUserId || '').slice(0, 64),
      });
      closed += 1;
    }
  }
  return { closed };
}

/** Backfill: movimentos saida_aluguel sem registro em kimono_loans. */
export async function reconcileOrphanRentalMoves(databases, dbId, stockItemsCol, academyId) {
  if (!KIMONO_LOANS_COL || !STOCK_MOVES_COL) return { created: 0 };

  let created = 0;
  try {
    const seen = new Set();
    const moves = [];

    const pushMoves = (docs) => {
      for (const doc of docs || []) {
        if (!doc?.$id || seen.has(doc.$id)) continue;
        if (!isRentalStockOutMove(doc)) continue;
        seen.add(doc.$id);
        moves.push(doc);
      }
    };

    try {
      const rentalTipoRes = await databases.listDocuments(dbId, STOCK_MOVES_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('tipo', ['saida_aluguel']),
        Query.orderDesc('$createdAt'),
        Query.limit(40),
      ]);
      pushMoves(rentalTipoRes.documents);
    } catch (e) {
      console.warn('[kimono-loans] reconcile tipo query:', e?.message || e);
    }

    try {
      const rentalKindRes = await databases.listDocuments(dbId, STOCK_MOVES_COL, [
        Query.equal('academy_id', [academyId]),
        Query.equal('movement_kind', ['rental']),
        Query.orderDesc('$createdAt'),
        Query.limit(80),
      ]);
      pushMoves(rentalKindRes.documents);
    } catch (e) {
      console.warn('[kimono-loans] reconcile movement_kind query:', e?.message || e);
    }

    for (const move of moves) {
      if (await loanExistsForMove(databases, dbId, move.$id)) continue;

      const variantId = String(move.item_estoque_id || '').trim();
      if (!variantId) continue;

      const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, variantId);
      if (!resolved?.doc || !isRentalEligibleParent(resolved.parent)) continue;

      const borrower = resolveBorrowerFromStockMove(move);
      const qty = Math.max(1, Math.abs(Math.trunc(Number(move.quantidade) || 1)));
      const out = await createKimonoLoanRecords(databases, {
        dbId,
        academyId,
        variantId,
        parent: resolved.parent,
        variant: resolved.doc,
        quantity: qty,
        stockMoveOutId: move.$id,
        lentAt: move.$createdAt || new Date().toISOString(),
        borrowerType: borrower.borrower_type,
        borrowerId: borrower.borrower_id,
        borrowerName: borrower.borrower_name,
        lentByUserId: move.usuario_id || '',
        notes: String(move.notes || move.motivo || '').slice(0, 200),
        source: String(move.source || 'reconcile'),
      });
      created += out.created?.length || 0;
    }
  } catch (e) {
    if (
      /collection.*not found|could not be found|attribute.*not found|unknown attribute|index.*not found|missing index/i.test(
        String(e?.message || '')
      )
    ) {
      const err = new Error('kimono_loans_collection_missing');
      err.code = 'kimono_loans_collection_missing';
      throw err;
    }
    console.warn('[kimono-loans] reconcile:', e?.message || e);
  }
  return { created };
}
