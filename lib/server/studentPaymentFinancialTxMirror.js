/**
 * Espelha student_payments (paid/partial) em FINANCIAL_TX — usado pelo API handler.
 */
import { ID, Permission, Role } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import {
  financeTxDocumentWithOptionals,
  stripUnknownFinanceTxAttrs,
} from './financeTxFields.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import {
  expectedAmountWithCardFee,
  mirrorGrossForPayment,
  shouldMirrorPaymentToCaixa,
} from '../../src/lib/paymentStatus.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

const TX_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
];

function studentView(studentDoc) {
  return {
    plan: studentDoc?.plan,
    dueDay: studentDoc?.due_day ?? studentDoc?.dueDay,
  };
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
    note: payload.note ?? paymentDoc.note,
    account: payload.account ?? paymentDoc.account,
    registered_by: payload.registered_by ?? paymentDoc.registered_by,
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
  if (!FINANCIAL_TX_COL || !paymentDoc?.$id) {
    return { mirrorId: null };
  }

  const data = mergeMirrorData(paymentDoc, payload);
  const status = String(data.status || '').toLowerCase();
  const txId = String(existingTxId || paymentDoc.financial_tx_id || '').trim();

  if (!shouldMirrorPaymentToCaixa(status)) {
    if (txId) {
      try {
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, { status: 'cancelled' });
      } catch (e) {
        console.error('[studentPaymentFinancialTxMirror] cancel tx:', e?.message || e);
      }
    }
    return { mirrorId: null };
  }

  const expected = Number(data.expected_amount);
  const paidAmt = Number(data.paid_amount ?? data.amount);
  let gross = mirrorGrossForPayment(status, paidAmt, expected);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { mirrorId: txId || null };
  }

  let fee = 0;
  const student = studentView(studentDoc);
  const withFee = expectedAmountWithCardFee(
    student,
    financeConfig,
    data.method,
    data.installments,
    data
  );
  const base = mirrorGrossForPayment(status, paidAmt, expected);
  if (Number.isFinite(withFee) && withFee > base) {
    fee = Math.round((withFee - base) * 100) / 100;
  }

  const net = Math.max(0, gross - fee);
  const refMonth = data.reference_month ? String(data.reference_month) : '';
  const competenceMonth = /^\d{4}-\d{2}$/.test(refMonth) ? refMonth : '';
  const note =
    String(data.note || '').trim() ||
    (refMonth ? `Mensalidade ${refMonth}` : 'Pagamento');
  const paymentId = String(paymentDoc.$id);
  const now = new Date().toISOString();

  const mirrorPayload = {
    academyId: String(data.academy_id),
    saleId: '',
    lead_id: String(data.lead_id),
    method: data.method || 'pix',
    installments: Math.min(12, Math.max(1, Number(data.installments) || 1)),
    type: FINANCE_CATEGORIES.MENSALIDADE.type,
    category: FINANCE_CATEGORIES.MENSALIDADE.label,
    competence_month: competenceMonth,
    planName: data.plan_name || note,
    gross,
    fee,
    net,
    direction: 'in',
    status: 'settled',
    settledAt: data.paid_at || now,
    note,
    origin_type: 'student_payment',
    origin_id: paymentId,
    created_by: String(data.registered_by || '').trim() || 'system',
    updated_by: String(data.registered_by || '').trim() || 'system',
    updated_at: now,
    bank_account: String(data.account || '').trim().slice(0, 128),
  };

  try {
    let mirrorId = txId;
    if (txId) {
      const updated = await writeFinancialTx(
        (doc) => databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, doc),
        mirrorPayload
      );
      mirrorId = updated.$id;
    } else {
      const created = await writeFinancialTx(
        (doc) =>
          databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), doc, TX_PERMISSIONS),
        mirrorPayload
      );
      mirrorId = created.$id;
    }

    void applyAccountingSideEffectsAutoServer(
      {
        ...mirrorPayload,
        id: mirrorId,
        type: FINANCE_CATEGORIES.MENSALIDADE.type,
        category: FINANCE_CATEGORIES.MENSALIDADE.label,
      },
      String(data.academy_id)
    );

    await attachFinancialTxId(paymentId, mirrorId);
    return { mirrorId };
  } catch (e) {
    console.error('[studentPaymentFinancialTxMirror] mirror failed:', paymentId, e?.message || e);
    return { mirrorId: txId || null, warning: e?.message || 'mirror_failed' };
  }
}
