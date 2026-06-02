/**
 * Estorno de FINANCIAL_TX já liquidado: cancela o original e cria lançamento espelho liquidado.
 */
import { Query, ID } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
  financeBankAccountFromDoc,
  financeCategoryLabelFromDoc,
  financeUserNoteFromStored,
  financeNoteForStorage,
  mapFinanceTxDoc,
  stripUnknownFinanceTxAttrs,
  txDirection,
} from './financeTxFields.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

export function reverseEligibilityError(doc) {
  const st = String(doc?.status || '').toLowerCase();
  if (st === 'cancelled') return 'already_cancelled';
  if (st !== 'settled') return 'only_settled_can_reverse';
  if (doc?.is_recurrence_template === true) return 'cannot_reverse_recurrence_template';
  if (String(doc?.origin_type || doc?.originType || '').toLowerCase() === 'reversal') {
    return 'cannot_reverse_reversal';
  }
  const note = String(doc?.note || '');
  if (/@reversed:/i.test(note) || /Estornado · ref/i.test(note)) return 'already_reversed';
  return '';
}

async function reversalAlreadyExists(academyId, originalTxId) {
  if (!FINANCIAL_TX_COL || !originalTxId) return false;
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('origin_id', String(originalTxId)),
      Query.limit(5),
    ]);
    return (res.documents || []).some(
      (d) => String(d.origin_type || '').toLowerCase() === 'reversal'
    );
  } catch {
    return false;
  }
}

function buildMirrorInput(prevDoc, prevMapped, { academyId, reason }) {
  const origDir = txDirection(prevDoc);
  const settledAt = new Date().toISOString();
  const shortRef = String(prevMapped.id || '').slice(-6);
  const userReason = String(reason || '').trim().slice(0, 200);
  const estornoNote = userReason || `Estorno · ref …${shortRef}`;

  const bank = financeBankAccountFromDoc(prevDoc);
  const base = {
    academyId,
    saleId: prevMapped.saleId,
    lead_id: prevMapped.lead_id,
    method: prevMapped.method || 'pix',
    installments: prevMapped.installments || 1,
    gross: prevMapped.gross,
    fee: 0,
    status: 'settled',
    settledAt,
    competence_month: prevMapped.competence_month || competenceMonthFromIso(settledAt),
    planName: prevMapped.planName || estornoNote,
    note: estornoNote,
    bank_account: bank,
    origin_type: 'reversal',
    origin_id: prevMapped.id,
  };

  if (origDir === 'out') {
    return {
      ...base,
      type: FINANCE_CATEGORIES.OUTROS_RECEITA.type,
      category: FINANCE_CATEGORIES.OUTROS_RECEITA.label,
      direction: 'in',
    };
  }

  return {
    ...base,
    type: FINANCE_CATEGORIES.CANCELAMENTO.type,
    category: FINANCE_CATEGORIES.CANCELAMENTO.label,
    direction: 'out',
  };
}

async function createMirrorDocument(mirrorInput, me) {
  const payload = buildFinanceTxPayload(mirrorInput, {
    created_by: me.$id,
    updated_by: me.$id,
    origin_type: 'reversal',
    origin_id: mirrorInput.origin_id,
  });
  const direction = String(mirrorInput.direction || '').toLowerCase();
  if (direction === 'in' || direction === 'out') {
    payload.direction = direction;
  }

  const forDb = financeTxDocumentWithOptionals(payload);
  try {
    return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), forDb, []);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    return databases.createDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      stripUnknownFinanceTxAttrs(payload),
      []
    );
  }
}

function buildCancelledNote(prevDoc, mirrorId) {
  const bank = financeBankAccountFromDoc(prevDoc);
  const prevUser = financeUserNoteFromStored(prevDoc?.note);
  const stamp = `Estornado · ref ${mirrorId}`;
  const body = prevUser ? `${prevUser}\n${stamp}` : stamp;
  return financeNoteForStorage(financeCategoryLabelFromDoc(prevDoc), body, bank);
}

/**
 * @returns {{ original: object, reversal: object }}
 */
export async function reverseSettledFinanceTx({ prevDoc, academyId, me, reason = '' }) {
  if (!FINANCIAL_TX_COL || !DB_ID) throw new Error('financial_tx_not_configured');

  const err = reverseEligibilityError(prevDoc);
  if (err) throw new Error(err);

  const prevMapped = mapFinanceTxDoc(prevDoc);
  if (!prevMapped?.id) throw new Error('invalid_tx');

  if (await reversalAlreadyExists(academyId, prevMapped.id)) {
    throw new Error('already_reversed');
  }

  const mirrorInput = buildMirrorInput(prevDoc, prevMapped, { academyId, reason });
  const mirrorDoc = await createMirrorDocument(mirrorInput, me);
  const reversal = mapFinanceTxDoc(mirrorDoc);
  if (reversal) void applyAccountingSideEffectsAutoServer(reversal, academyId);

  const cancelledNote = buildCancelledNote(prevDoc, reversal?.id || mirrorDoc.$id);
  const cancelPatch = financeTxDocumentForAppwrite({
    status: 'cancelled',
    settledAt: '',
    note: cancelledNote,
    category: financeCategoryLabelFromDoc(prevDoc),
  });

  let originalDoc;
  try {
    originalDoc = await databases.updateDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      prevMapped.id,
      cancelPatch
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    originalDoc = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, prevMapped.id, {
      status: 'cancelled',
      settledAt: '',
      note: cancelledNote,
    });
  }

  const original = mapFinanceTxDoc(originalDoc);
  await recordFinancialAudit({
    action: 'tx_reverse',
    payment_id: prevMapped.id,
    academy_id: academyId,
    user_id: me.$id,
    amount: prevMapped.gross,
    previous_status: 'settled',
    new_status: 'cancelled',
    meta: { reversal_id: reversal?.id || mirrorDoc.$id },
  });

  return { original, reversal };
}
