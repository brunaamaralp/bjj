/**
 * Execução de empréstimo/devolução de kimono — estoque dual + registro.
 */
import { Query } from 'node-appwrite';
import { executeInventoryMove } from './inventoryMoveHandler.js';
import {
  listCatalog,
  resolveStockDocument,
  PRODUCT_VARIANTS_COL,
} from './productCatalogDb.js';
import { createDocumentResilient, updateDocumentResilient } from './appwriteSchemaResilient.js';
import { availableQuantityForLineKind, LINE_KINDS } from '../../src/lib/saleLineKind.js';
import { itemDisplayName, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import { readKimonoLoanSettings, mergeKimonoLoanIntoSettings } from '../../src/lib/kimonoLoanSettings.js';
import {
  isRentalEligibleParent,
  KIMONO_BORROWER_TYPES,
  KIMONO_LOAN_STATUS,
  mapKimonoLoanDoc,
  variantRentalAvailable,
} from '../kimonoLoanCore.js';
import { addLeadEventServer } from './leadEvents.js';
import {
  reconcileOrphanRentalMoves,
  recordKimonoLoanAfterRentalExit,
} from './kimonoLoanRecords.js';

const KIMONO_LOANS_COL =
  process.env.KIMONO_LOANS_COL ||
  process.env.VITE_APPWRITE_KIMONO_LOANS_COLLECTION_ID ||
  'kimono_loans';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function buildItemLabel(parent, variant) {
  const parentName = parent?.name || parent?.nome || itemDisplayName(variant);
  const vl = variantInventoryLabel({
    size: variant?.size,
    color: variant?.color,
    Tamanho: variant?.Tamanho ?? variant?.tamanho,
  });
  return vl === 'Único' ? parentName : `${parentName} · ${vl}`;
}

export async function listKimonoRentalInventory(databases, dbId, stockItemsCol, academyId) {
  const catalog = await listCatalog(databases, dbId, stockItemsCol, academyId);
  const parentById = new Map((catalog.products || catalog.parents || []).map((p) => [p.id, p]));
  const out = [];
  for (const v of catalog.variants || []) {
    const parent = parentById.get(v.product_id) || null;
    if (!isRentalEligibleParent(parent)) continue;
    const avail = variantRentalAvailable(v, parent);
    const rentalOut = Number(v.rental_out ?? 0) || 0;
    if (avail < 1 && rentalOut < 1) continue;
    out.push({
      id: v.id,
      product_id: v.product_id,
      label: buildItemLabel(parent, v),
      size: String(v.size || v.Tamanho || '').trim(),
      rental_available: avail,
      rental_out: rentalOut,
    });
  }
  out.sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));
  return out;
}

export async function listKimonoRentalVariants(databases, dbId, stockItemsCol, academyId) {
  const inventory = await listKimonoRentalInventory(databases, dbId, stockItemsCol, academyId);
  return inventory.filter((v) => v.rental_available >= 1);
}

async function listActiveKimonoLoans(databases, dbId, academyId) {
  if (!KIMONO_LOANS_COL) return [];
  try {
    const res = await databases.listDocuments(dbId, KIMONO_LOANS_COL, [
      Query.equal('academy_id', [academyId]),
      Query.equal('status', [KIMONO_LOAN_STATUS.OUT]),
      Query.orderDesc('lent_at'),
      Query.limit(100),
    ]);
    return res.documents || [];
  } catch (e) {
    if (/collection.*not found|could not be found/i.test(String(e?.message || ''))) {
      const err = new Error('kimono_loans_collection_missing');
      err.code = 'kimono_loans_collection_missing';
      throw err;
    }
    throw e;
  }
}

export async function getKimonoLoanBoard(databases, dbId, stockItemsCol, academyDoc, academyId) {
  const settings = parseAcademySettings(academyDoc?.settings);
  const loanCfg = readKimonoLoanSettings(settings);
  const now = new Date();
  await reconcileOrphanRentalMoves(databases, dbId, stockItemsCol, academyId);
  const [inventory, variants, rawLoans] = await Promise.all([
    listKimonoRentalInventory(databases, dbId, stockItemsCol, academyId),
    listKimonoRentalVariants(databases, dbId, stockItemsCol, academyId),
    listActiveKimonoLoans(databases, dbId, academyId),
  ]);
  const loans = rawLoans.map((d) => mapKimonoLoanDoc(d, { overdueHours: loanCfg.overdueHours, now }));
  const overdueCount = loans.filter((l) => l.overdue).length;
  const totals = inventory.reduce(
    (acc, item) => {
      acc.available += item.rental_available;
      acc.out += item.rental_out;
      return acc;
    },
    { available: 0, out: 0 }
  );
  return {
    settings: loanCfg,
    inventory,
    variants,
    loans,
    overdueCount,
    totals,
  };
}

export async function lendKimono(databases, ctx) {
  const {
    dbId,
    stockItemsCol,
    academyId,
    academyDoc,
    me,
    variantId,
    borrowerType,
    borrowerId,
    borrowerName,
    notes,
  } = ctx;

  const vId = String(variantId || '').trim();
  const bType = String(borrowerType || '').trim().toLowerCase();
  const bId = String(borrowerId || '').trim();
  const bName = String(borrowerName || '').trim();

  if (!vId) return { ok: false, status: 400, error: 'variant_required' };
  if (!bId || !bName) return { ok: false, status: 400, error: 'borrower_required' };
  if (bType !== KIMONO_BORROWER_TYPES.LEAD && bType !== KIMONO_BORROWER_TYPES.STUDENT) {
    return { ok: false, status: 400, error: 'invalid_borrower_type' };
  }
  if (!STOCK_MOVES_COL) return { ok: false, status: 503, error: 'stock_moves_not_configured' };

  const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, vId);
  if (!resolved?.doc) return { ok: false, status: 404, error: 'variant_not_found' };
  if (resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
    return { ok: false, status: 403, error: 'academy_mismatch' };
  }

  const parentType = resolved.parent?.type || resolved.doc.type || 'sale';
  const avail = availableQuantityForLineKind(resolved.doc, LINE_KINDS.RENTAL, parentType);
  if (avail < 1) return { ok: false, status: 409, error: 'no_rental_stock', disponivel: avail };

  const itemLabel = buildItemLabel(resolved.parent, resolved.doc);
  const sizeLabel = String(resolved.doc.size || resolved.doc.Tamanho || '').trim() || '—';
  const lentAt = new Date().toISOString();

  const moveOut = await executeInventoryMove(databases, {
    dbId,
    stockItemsCol: resolved.collection || stockItemsCol,
    stockMovesCol: STOCK_MOVES_COL,
    itemEstoqueId: vId,
    tipo: 'saida_aluguel',
    quantidade: 1,
    motivo: 'emprestimo_recepcao',
    referencia_id: bId,
    usuario_id: me?.$id || '',
    academy_id: academyId,
    academyDoc,
    kimonoLoan: false,
  });
  if (!moveOut.ok) {
    return { ok: false, status: moveOut.status || 400, error: moveOut.error || 'stock_move_failed' };
  }

  let loanDoc;
  try {
    const recorded = await recordKimonoLoanAfterRentalExit(databases, {
      dbId,
      stockItemsCol: resolved.collection || stockItemsCol,
      academyId,
      variantId: vId,
      resolved,
      quantity: 1,
      stockMoveOutId: moveOut.movimento_id || '',
      lentAt,
      borrower: {
        borrower_type: bType,
        borrower_id: bId,
        borrower_name: bName,
      },
      lentByUserId: me?.$id || '',
      notes,
      source: 'reception',
    });
    loanDoc = recorded.created?.[0];
    if (!loanDoc) {
      return { ok: false, status: 503, error: 'kimono_loan_record_failed' };
    }
  } catch (e) {
    await executeInventoryMove(databases, {
      dbId,
      stockItemsCol: resolved.collection || stockItemsCol,
      stockMovesCol: STOCK_MOVES_COL,
      itemEstoqueId: vId,
      tipo: 'devolucao',
      quantidade: 1,
      motivo: 'rollback_emprestimo',
      referencia_id: bId,
      usuario_id: me?.$id || '',
      academy_id: academyId,
      academyDoc,
      kimonoLoan: false,
    }).catch(() => {});
    if (/collection.*not found|could not be found/i.test(String(e?.message || ''))) {
      return { ok: false, status: 503, error: 'kimono_loans_collection_missing' };
    }
    throw e;
  }

  if (bType === KIMONO_BORROWER_TYPES.LEAD) {
    await addLeadEventServer({
      academyId,
      leadId: bId,
      type: 'kimono_emprestado',
      text: `Kimono emprestado: ${itemLabel} (${sizeLabel}).`,
      createdBy: me?.name || me?.email || 'recepcao',
      payloadJson: { loan_id: loanDoc.$id, variant_id: vId },
    }).catch(() => {});
  }

  const settings = parseAcademySettings(academyDoc?.settings);
  const loanCfg = readKimonoLoanSettings(settings);
  return {
    ok: true,
    loan: mapKimonoLoanDoc(loanDoc, { overdueHours: loanCfg.overdueHours }),
    movimento_id: moveOut.movimento_id,
  };
}

export async function returnKimono(databases, ctx) {
  const { dbId, stockItemsCol, academyId, academyDoc, me, loanId } = ctx;
  const id = String(loanId || '').trim();
  if (!id) return { ok: false, status: 400, error: 'loan_id_required' };
  if (!STOCK_MOVES_COL) return { ok: false, status: 503, error: 'stock_moves_not_configured' };

  let loan;
  try {
    loan = await databases.getDocument(dbId, KIMONO_LOANS_COL, id);
  } catch {
    return { ok: false, status: 404, error: 'loan_not_found' };
  }
  if (String(loan.academy_id) !== academyId) return { ok: false, status: 403, error: 'forbidden' };
  if (loan.status === KIMONO_LOAN_STATUS.RETURNED) {
    return { ok: false, status: 409, error: 'already_returned' };
  }

  const vId = String(loan.variant_id || '').trim();
  const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, vId);
  if (!resolved?.doc) return { ok: false, status: 404, error: 'variant_not_found' };

  const moveIn = await executeInventoryMove(databases, {
    dbId,
    stockItemsCol: resolved.collection || stockItemsCol,
    stockMovesCol: STOCK_MOVES_COL,
    itemEstoqueId: vId,
    tipo: 'devolucao',
    quantidade: 1,
    motivo: 'devolucao_recepcao',
    referencia_id: id,
    usuario_id: me?.$id || '',
    academy_id: academyId,
    academyDoc,
  });
  if (!moveIn.ok) {
    return { ok: false, status: moveIn.status || 400, error: moveIn.error || 'stock_move_failed' };
  }

  const returnedAt = new Date().toISOString();
  const updated = await updateDocumentResilient(databases, dbId, KIMONO_LOANS_COL, id, {
    status: KIMONO_LOAN_STATUS.RETURNED,
    returned_at: returnedAt,
    stock_move_in_id: moveIn.movimento_id || '',
    returned_by_user_id: me?.$id || '',
  });

  if (String(loan.borrower_type) === KIMONO_BORROWER_TYPES.LEAD && loan.borrower_id) {
    await addLeadEventServer({
      academyId,
      leadId: String(loan.borrower_id),
      type: 'kimono_devolvido',
      text: `Kimono devolvido: ${loan.item_label || '—'}.`,
      createdBy: me?.name || me?.email || 'recepcao',
      payloadJson: { loan_id: id, variant_id: vId },
    }).catch(() => {});
  }

  const settings = parseAcademySettings(academyDoc?.settings);
  const loanCfg = readKimonoLoanSettings(settings);
  return {
    ok: true,
    loan: mapKimonoLoanDoc(updated, { overdueHours: loanCfg.overdueHours }),
    movimento_id: moveIn.movimento_id,
  };
}

export async function saveKimonoLoanSettings(databases, dbId, academyId, academyDoc, overdueHours) {
  if (!ACADEMIES_COL) return { ok: false, status: 503, error: 'academies_not_configured' };
  const settings = parseAcademySettings(academyDoc?.settings);
  const merged = mergeKimonoLoanIntoSettings(settings, { overdueHours });
  await databases.updateDocument(dbId, ACADEMIES_COL, academyId, {
    settings: JSON.stringify(merged),
  });
  return { ok: true, settings: readKimonoLoanSettings(merged) };
}
