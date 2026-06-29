/**
 * Espelha student_payments (paid/partial) em FINANCIAL_TX — usado pelo API handler.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import {
  financeTxDocumentWithOptionals,
  stripUnknownFinanceTxAttrs,
} from './financeTxFields.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { mirrorGrossForPayment, shouldMirrorPaymentToCaixa, expectedAmountForStudent } from '../../src/lib/paymentStatus.js';
import { buildMirrorPlanName } from '../../src/lib/financeReconTxLabel.js';
import { mirrorAmountsForPaymentWithAccount } from '../../src/lib/resolveAcquirerFees.js';
import { resolveFinancialTxSettlement } from '../../src/lib/paymentSettlement.js';
import { resolveBankAccountForCaptureMethod } from '../../src/lib/captureMethods.js';
import { resolveMirrorFinanceCategory } from '../../src/lib/studentPaymentMirrorCategory.js';
import { cancelFinancialTxMirrorsForPayment } from './studentPaymentMirrorCancel.js';

const FINANCIAL_TX_COLLECTION_ENV_NAMES = [
  'APPWRITE_FINANCIAL_TX_COLLECTION_ID',
  'VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID',
  'FINANCIAL_TX_COL',
];
let hasWarnedMissingFinancialTxCollection = false;
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

const TX_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
];

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function studentView(studentDoc) {
  return {
    plan: studentDoc?.plan,
    dueDay: studentDoc?.due_day ?? studentDoc?.dueDay,
  };
}

function resolveFinancialTxCollectionId(paymentId = '') {
  const collectionId =
    process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
    process.env.FINANCIAL_TX_COL ||
    '';

  if (!collectionId && !hasWarnedMissingFinancialTxCollection) {
    hasWarnedMissingFinancialTxCollection = true;
    console.warn('[studentPaymentFinancialTxMirror] missing financial_tx collection env', {
      paymentId: String(paymentId || '').trim(),
      tried: FINANCIAL_TX_COLLECTION_ENV_NAMES,
    });
  }

  return collectionId;
}

function mergeMirrorData(paymentDoc, payload = {}) {
  return {
    lead_id: paymentDoc.lead_id,
    academy_id: paymentDoc.academy_id,
    status: payload.status ?? paymentDoc.status,
    expected_amount: payload.expected_amount ?? paymentDoc.expected_amount,
    paid_amount: payload.paid_amount ?? paymentDoc.paid_amount,
    amount: payload.amount ?? paymentDoc.amount,
    method: payload.method ?? paymentDoc.method,
    installments: payload.installments ?? paymentDoc.installments,
    reference_month: payload.reference_month ?? paymentDoc.reference_month,
    plan_name: payload.plan_name ?? paymentDoc.plan_name,
    paid_at: payload.paid_at ?? paymentDoc.paid_at,
    due_date: payload.due_date ?? paymentDoc.due_date,
    note: payload.note ?? paymentDoc.note,
    account: payload.account ?? paymentDoc.account,
    capture_method_id: payload.capture_method_id ?? paymentDoc.capture_method_id,
    capture_method_name: payload.capture_method_name ?? paymentDoc.capture_method_name,
    fee_receiver_id: payload.fee_receiver_id ?? paymentDoc.fee_receiver_id,
    card_brand: payload.card_brand ?? paymentDoc.card_brand,
    registered_by: payload.registered_by ?? paymentDoc.registered_by,
    payment_category: payload.payment_category ?? paymentDoc.payment_category,
  };
}

async function writeFinancialTx(writeFn, payload) {
  try {
    return await writeFn(financeTxDocumentWithOptionals(payload));
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    return writeFn(stripUnknownFinanceTxAttrs(payload));
  }
}

async function attachFinancialTxId(paymentId, mirrorId) {
  if (!paymentId || !mirrorId || !PAYMENTS_COL) return;
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, {
      financial_tx_id: mirrorId,
    });
  } catch (e) {
    console.error('[studentPaymentFinancialTxMirror] financial_tx_id update failed:', e?.message || e);
  }
}

async function findTrocoTxForPayment(paymentId) {
  const financialTxCol = resolveFinancialTxCollectionId(paymentId);
  if (!financialTxCol || !paymentId) return null;
  try {
    const res = await databases.listDocuments(DB_ID, financialTxCol, [
      Query.equal('origin_id', paymentId),
      Query.equal('origin_type', 'student_payment_troco'),
      Query.limit(1),
    ]);
    return res.documents?.[0] || null;
  } catch {
    return null;
  }
}

function compareFinancialTxDeterministic(a, b) {
  const aCancelled = String(a?.status || '').toLowerCase() === 'cancelled';
  const bCancelled = String(b?.status || '').toLowerCase() === 'cancelled';
  if (aCancelled !== bCancelled) return aCancelled ? 1 : -1;

  const aCreated = String(a?.$createdAt || '').trim();
  const bCreated = String(b?.$createdAt || '').trim();
  if (aCreated && bCreated && aCreated !== bCreated) {
    return aCreated.localeCompare(bCreated);
  }

  return String(a?.$id || '').localeCompare(String(b?.$id || ''));
}

function pickMainTxDoc(docs, explicitTxId = '') {
  const list = Array.isArray(docs) ? docs.filter(Boolean) : [];
  const explicit = String(explicitTxId || '').trim();
  if (explicit) {
    const exact = list.find((doc) => String(doc?.$id || '').trim() === explicit);
    if (exact) return exact;
  }
  if (!list.length) return null;
  return [...list].sort(compareFinancialTxDeterministic)[0] || null;
}

async function findMainTxForPayment(paymentId, explicitTxId = '') {
  const financialTxCol = resolveFinancialTxCollectionId(paymentId);
  if (!financialTxCol || !paymentId) return null;
  try {
    const res = await databases.listDocuments(DB_ID, financialTxCol, [
      Query.equal('origin_id', paymentId),
      Query.equal('origin_type', 'student_payment'),
      Query.limit(10),
    ]);
    return pickMainTxDoc(res.documents, explicitTxId);
  } catch {
    return null;
  }
}

async function mirrorStudentPaymentTroco({ paymentDoc, data }) {
  const paymentId = String(paymentDoc?.$id || '').trim();
  const financialTxCol = resolveFinancialTxCollectionId(paymentId);
  const troco = roundMoney(Number(data.troco ?? paymentDoc?.troco ?? 0));
  if (!financialTxCol || !paymentId) return { warning: null };

  const existing = await findTrocoTxForPayment(paymentId);
  if (troco <= 0) {
    if (existing?.$id) {
      try {
        await databases.updateDocument(DB_ID, financialTxCol, existing.$id, { status: 'cancelled' });
      } catch (e) {
        console.error('[studentPaymentFinancialTxMirror] cancel troco tx:', e?.message || e);
      }
    }
    return { warning: null };
  }

  const formaTroco = String(data.forma_troco ?? paymentDoc?.forma_troco ?? 'pix').trim() || 'pix';
  const refMonth = data.reference_month ? String(data.reference_month) : '';
  const competenceMonth = /^\d{4}-\d{2}$/.test(refMonth) ? refMonth : '';
  const shortId = paymentId.slice(0, 8);
  const note = `Troco — mensalidade #${shortId}`;
  const now = new Date().toISOString();

  const trocoPayload = {
    academyId: String(data.academy_id),
    saleId: '',
    lead_id: String(data.lead_id),
    method: formaTroco,
    installments: 1,
    type: FINANCE_CATEGORIES.OUTRAS_DESPESAS.type,
    category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
    competence_month: competenceMonth,
    planName: note,
    gross: troco,
    fee: 0,
    net: troco,
    direction: 'out',
    status: 'settled',
    settledAt: data.paid_at || now,
    note,
    origin_type: 'student_payment_troco',
    origin_id: paymentId,
    created_by: String(data.registered_by || '').trim() || 'system',
    updated_by: String(data.registered_by || '').trim() || 'system',
    updated_at: now,
    bank_account: String(
      data.troco_account ?? paymentDoc?.troco_account ?? data.account ?? paymentDoc?.account ?? ''
    )
      .trim()
      .slice(0, 128),
  };

  try {
    if (existing?.$id) {
      await writeFinancialTx(
        (doc) => databases.updateDocument(DB_ID, financialTxCol, existing.$id, doc),
        trocoPayload
      );
    } else {
      const created = await writeFinancialTx(
        (doc) => databases.createDocument(DB_ID, financialTxCol, ID.unique(), doc, TX_PERMISSIONS),
        trocoPayload
      );
      void applyAccountingSideEffectsAutoServer(
        {
          ...trocoPayload,
          id: created.$id,
          type: FINANCE_CATEGORIES.OUTRAS_DESPESAS.type,
          category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
        },
        String(data.academy_id)
      );
    }
    return { warning: null };
  } catch (e) {
    console.error('[studentPaymentFinancialTxMirror] troco mirror failed:', paymentId, e?.message || e);
    return { warning: `Troco (${formaTroco}) não registrado no caixa — confira manualmente.` };
  }
}

/**
 * @returns {Promise<{ mirrorId: string|null, warning?: string }>}
 */
export async function mirrorStudentPaymentToFinancialTx({
  paymentDoc,
  payload,
  financeConfig,
  studentDoc,
  existingTxId,
}) {
  const paymentId = String(paymentDoc?.$id || '').trim();
  const financialTxCol = resolveFinancialTxCollectionId(paymentId);
  if (!financialTxCol || !paymentId) {
    return { mirrorId: null };
  }

  const data = mergeMirrorData(paymentDoc, payload);
  const status = String(data.status || '').toLowerCase();
  const resolvedMainTx = await findMainTxForPayment(
    paymentId,
    String(existingTxId || paymentDoc.financial_tx_id || '').trim()
  );
  const txId = String(resolvedMainTx?.$id || existingTxId || paymentDoc.financial_tx_id || '').trim();

  if (!shouldMirrorPaymentToCaixa(status)) {
    await cancelFinancialTxMirrorsForPayment(paymentId, {
      explicitTxId: txId || paymentDoc.financial_tx_id,
    });
    return { mirrorId: null };
  }

  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount ?? data.amount);
  let gross = mirrorGrossForPayment(status, paidAmt, expected);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { mirrorId: txId || null };
  }

  const installments = Math.min(12, Math.max(1, Number(data.installments) || 1));
  const planBase = expectedAmountForStudent(studentDoc, financeConfig, data);
  const captureMethodId = String(data.capture_method_id || '').trim();
  const explicitBankAccount = String(data.account || '').trim().slice(0, 128);
  const captureBankAccount = resolveBankAccountForCaptureMethod(financeConfig, captureMethodId);
  const bankAccount = String(captureBankAccount || explicitBankAccount).trim().slice(0, 128);
  const { fee, net } = mirrorAmountsForPaymentWithAccount({
    gross,
    planBase,
    policy: financeConfig?.acquirerFeePolicy,
    method: data.method,
    installments,
    financeConfig,
    bankAccount,
    captureMethodId,
    feeReceiverId: String(data.fee_receiver_id || '').trim(),
    cardBrand: String(data.card_brand || '').trim(),
  });
  const refMonth = data.reference_month ? String(data.reference_month) : '';
  const competenceMonth = /^\d{4}-\d{2}$/.test(refMonth) ? refMonth : '';
  const note =
    String(data.note || '').trim() ||
    (refMonth ? `Mensalidade ${refMonth}` : 'Pagamento');
  const now = new Date().toISOString();
  const paymentStatus = String(data.status || '').toLowerCase();
  let settlement;
  if (paymentStatus === 'pending' || paymentStatus === 'awaiting') {
    const dueYmd = String(data.due_date || '').slice(0, 10);
    settlement = {
      status: 'pending',
      settledAt: null,
      expected_settlement_at: /^\d{4}-\d{2}-\d{2}$/.test(dueYmd) ? `${dueYmd}T23:59:59.999Z` : null,
    };
  } else {
    settlement = resolveFinancialTxSettlement({
      financeConfig,
      method: data.method || 'pix',
      paidAt: data.paid_at || now,
      dueDate: data.due_date,
      captureMethodId,
      installments,
    });
  }

  const financeCat = resolveMirrorFinanceCategory(data.payment_category);

  const mirrorPayload = {
    academyId: String(data.academy_id),
    saleId: '',
    lead_id: String(data.lead_id),
    method: data.method || 'pix',
    installments,
    type: financeCat.type,
    category: financeCat.label,
    competence_month: competenceMonth,
    planName: buildMirrorPlanName({
      studentName: studentDoc?.name,
      planName: data.plan_name,
      refMonth,
    }),
    gross,
    fee,
    net,
    direction: 'in',
    status: settlement.status,
    settledAt: settlement.settledAt,
    expected_settlement_at: settlement.expected_settlement_at,
    note,
    origin_type: 'student_payment',
    origin_id: paymentId,
    created_by: String(data.registered_by || '').trim() || 'system',
    updated_by: String(data.registered_by || '').trim() || 'system',
    updated_at: now,
    bank_account: bankAccount,
    ...(captureMethodId ? { capture_method_id: captureMethodId } : {}),
  };

  try {
    let mirrorId = txId;
    if (txId) {
      const updated = await writeFinancialTx(
        (doc) => databases.updateDocument(DB_ID, financialTxCol, txId, doc),
        mirrorPayload
      );
      mirrorId = updated.$id;
    } else {
      const created = await writeFinancialTx(
        (doc) => databases.createDocument(DB_ID, financialTxCol, ID.unique(), doc, TX_PERMISSIONS),
        mirrorPayload
      );
      mirrorId = created.$id;
    }

    if (settlement.status === 'settled') {
      void applyAccountingSideEffectsAutoServer(
        {
          ...mirrorPayload,
          id: mirrorId,
          type: financeCat.type,
          category: financeCat.label,
        },
        String(data.academy_id)
      );
    }

    await attachFinancialTxId(paymentId, mirrorId);
    const trocoResult = await mirrorStudentPaymentTroco({ paymentDoc, data });
    return {
      mirrorId,
      warning: trocoResult?.warning || null,
    };
  } catch (e) {
    console.error('[studentPaymentFinancialTxMirror] mirror failed:', paymentId, e?.message || e);
    return { mirrorId: txId || null, warning: e?.message || 'mirror_failed' };
  }
}
