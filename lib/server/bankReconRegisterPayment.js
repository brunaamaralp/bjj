/**
 * Registra mensalidade e concilia linha do extrato atomicamente.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { DB_ID, FINANCIAL_TX_COL, STUDENT_PAYMENTS_COL, STUDENTS_COL } from './appwriteCollections.js';
import { databases } from './academyAccess.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import { expectedAmountWithCardFee } from '../../src/lib/paymentStatus.js';
import { PAYMENT_CATEGORY } from '../../src/lib/paymentCategories.js';
import { fetchAndValidateTxForReconciliation } from './bankReconciliationValidation.js';
import {
  buildLearnPayerPayload,
  rememberPayerAliasForStudent,
} from './studentPayerAliasServer.js';
import { loadPayerContextByLeadIds } from './studentPayerContext.js';
import { roundMoney } from '../money.js';

const BANK_STATEMENTS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENTS_COLLECTION_ID || process.env.BANK_STATEMENTS_COL || '';
const BANK_STATEMENT_ITEMS_COL =
  process.env.VITE_APPWRITE_BANK_STATEMENT_ITEMS_COLLECTION_ID ||
  process.env.BANK_STATEMENT_ITEMS_COL ||
  '';

const PAYMENTS_COL = STUDENT_PAYMENTS_COL;

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function amountsClose(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= 0.02;
}

async function writePaymentDocument(writeFn, payload) {
  const optional = [
    'paid_amount',
    'expected_amount',
    'payment_category',
    'installments',
  ];
  let current = { ...payload };
  for (let attempt = 0; attempt < optional.length + 1; attempt += 1) {
    try {
      return await writeFn(current);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const next = { ...current };
      let stripped = false;
      for (const key of optional) {
        if (key in next) {
          delete next[key];
          stripped = true;
          break;
        }
      }
      if (!stripped) throw e;
      current = next;
    }
  }
  return writeFn(current);
}

function buildPaidPaymentPayload(data, financeConfig, studentDoc, me) {
  const method = String(data.method || 'pix');
  const amount = roundMoney(data.amount);
  const student = {
    plan: studentDoc?.plan,
    dueDay: studentDoc?.due_day ?? studentDoc?.dueDay,
  };
  let expected = expectedAmountWithCardFee(student, financeConfig, method, 1, data);
  if (!Number.isFinite(expected) || expected <= 0) expected = amount;

  return {
    lead_id: String(data.lead_id),
    academy_id: String(data.academy_id),
    amount,
    paid_amount: amount,
    expected_amount: expected,
    method,
    account: String(data.account || '').slice(0, 128),
    plan_name: String(studentDoc?.plan || data.plan_name || ''),
    status: 'paid',
    reference_month: String(data.reference_month || '').slice(0, 7) || null,
    paid_at: data.paid_at ? `${String(data.paid_at).slice(0, 10)}T12:00:00.000Z` : new Date().toISOString(),
    registered_by: String(me?.$id || '').slice(0, 64),
    registered_by_name: String(me?.name || me?.email || 'Usuário').slice(0, 128),
    note: String(data.note || '').slice(0, 2000),
    payment_category: PAYMENT_CATEGORY.PLAN,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.academyId
 * @param {object} opts.me
 * @param {object} opts.academyDoc
 * @param {object} opts.body
 * @param {(txId: string, ctx: object) => Promise<void>} opts.markMatched
 */
export async function registerReconPayment({
  academyId,
  me,
  academyDoc,
  body,
  markMatched,
}) {
  const itemId = String(body.item_id || '').trim();
  const leadId = String(body.lead_id || '').trim();
  const paymentId = String(body.payment_id || '').trim();
  const referenceMonth = String(body.reference_month || '').trim().slice(0, 7);
  const amount = roundMoney(body.amount);
  const paidAt = String(body.paid_at || '').slice(0, 10);
  const method = String(body.method || 'pix');
  const account = String(body.bank_account_id || body.account || '').trim().slice(0, 128);
  const rememberPayer = body.remember_payer === true;
  const autoSuggest = body.auto_suggest === true;

  if (!itemId || !leadId || !referenceMonth || !paidAt) {
    return { ok: false, status: 400, error: 'invalid_payload' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'invalid_amount' };
  }
  if (!PAYMENTS_COL || !BANK_STATEMENT_ITEMS_COL || !FINANCIAL_TX_COL) {
    return { ok: false, status: 503, error: 'not_configured' };
  }

  const item = await databases.getDocument(DB_ID, BANK_STATEMENT_ITEMS_COL, itemId);
  const statement = await databases.getDocument(DB_ID, BANK_STATEMENTS_COL, item.statement_id);
  if (String(statement.academy_id || '') !== academyId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const itemStatus = String(item.status || '').toLowerCase();
  if (itemStatus === 'matched') {
    return { ok: false, status: 409, error: 'already_matched' };
  }
  if (itemStatus === 'ignored' || itemStatus === 'duplicate') {
    return { ok: false, status: 400, error: 'item_not_reconcilable' };
  }
  if (String(item.direction || '') !== 'credit') {
    return { ok: false, status: 400, error: 'credit_only' };
  }
  if (!amountsClose(item.amount, amount)) {
    return { ok: false, status: 400, error: 'amount_mismatch' };
  }

  const studentDoc = await assertOrRepairStudentInAcademy(
    databases,
    DB_ID,
    STUDENTS_COL,
    leadId,
    academyId
  );
  const financeConfig = parseFinanceConfig(academyDoc?.financeConfig);

  const paymentData = {
    lead_id: leadId,
    academy_id: academyId,
    amount,
    method,
    account: account || statement.bank_account || statement.bankAccount || '',
    reference_month: referenceMonth,
    paid_at: paidAt,
  };
  const payload = buildPaidPaymentPayload(paymentData, financeConfig, studentDoc, me);

  let paymentDoc;
  if (paymentId) {
    const prev = await databases.getDocument(DB_ID, PAYMENTS_COL, paymentId);
    if (String(prev.academy_id || '') !== academyId) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    if (String(prev.lead_id || '') !== leadId) {
      return { ok: false, status: 400, error: 'lead_mismatch' };
    }
    paymentDoc = await writePaymentDocument(
      (p) => databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, p),
      payload
    );
  } else {
    paymentDoc = await writePaymentDocument(
      (p) =>
        databases.createDocument(DB_ID, PAYMENTS_COL, ID.unique(), p, [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
        ]),
      payload
    );
  }

  const mirrorResult = await mirrorStudentPaymentToFinancialTx({
    paymentDoc,
    payload,
    financeConfig,
    studentDoc,
    existingTxId: paymentDoc.financial_tx_id,
  });

  const txId = String(mirrorResult?.mirrorId || paymentDoc.financial_tx_id || '').trim();
  if (!txId) {
    return { ok: false, status: 500, error: 'mirror_failed', detail: mirrorResult?.warning };
  }

  const bankAccount = String(statement.bank_account || statement.bankAccount || account || '').trim();
  const txCheck = await fetchAndValidateTxForReconciliation(
    databases,
    DB_ID,
    FINANCIAL_TX_COL,
    txId,
    {
      academyId,
      item: {
        amount: item.amount,
        direction: item.direction,
        bank_account: bankAccount,
      },
    }
  );
  if (!txCheck.ok) {
    return { ok: false, status: 400, error: txCheck.error };
  }

  await markMatched(txId, { item, statement, txMapped: txCheck.mapped });

  const payerContextByLeadId = await loadPayerContextByLeadIds(databases, academyId, [leadId]);
  const payerContext = payerContextByLeadId.get(leadId) || null;
  const learn_payer = buildLearnPayerPayload(
    { description: item.description, direction: item.direction },
    { ...txCheck.mapped, lead_name: payerContext?.lead_name || studentDoc?.name },
    payerContext
  );

  if (rememberPayer && learn_payer && !learn_payer.already_known) {
    await rememberPayerAliasForStudent(
      databases,
      academyId,
      learn_payer.lead_id,
      learn_payer.extracted_display,
      'learned',
      { auto_suggest: autoSuggest }
    );
    learn_payer.already_known = true;
  } else if (autoSuggest && learn_payer && learn_payer.already_known) {
    await rememberPayerAliasForStudent(
      databases,
      academyId,
      learn_payer.lead_id,
      learn_payer.extracted_display,
      'learned',
      { auto_suggest: true }
    );
  }

  return {
    ok: true,
    status: 200,
    payment_id: paymentDoc.$id,
    transaction_id: txId,
    item_id: itemId,
    learn_payer: learn_payer || undefined,
    mirror_warning: mirrorResult?.warning || null,
  };
}
