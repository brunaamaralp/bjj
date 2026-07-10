/**
 * Espelha cobranças PagBank Recorrente em student_payments (grade Mensalidades).
 * Liquidação não-destrutiva: updates parciais preservam expected_amount, reference_month, billing_reference_id.
 */
import { ID } from 'node-appwrite';
import { PAYMENT_CATEGORY } from '../../src/lib/paymentCategories.js';
import { dueDateInMonth, studentDueDay } from '../../src/lib/collectionOverdue.js';
import { syncStudentOverdueAfterPayment } from './studentOverdueSync.js';
import { scheduleControlIdOverdueReconcile } from './controlidOverdueAccess.js';
import {
  findStudentPaymentByGatewayPaymentId,
  findStudentPaymentForMonth,
} from './studentPaymentLookup.js';
import { buildStudentBillingReferenceId } from './studentPaymentBillingReference.js';
import { recordFinancialAudit } from './financialAuditLog.js';

const GATEWAY_PROVIDER_PAGBANK = 'pagbank';
const SETTLED_STUDENT_PAYMENT_STATUSES = new Set(['paid', 'covered', 'frozen', 'partial']);

function studentPaymentsCol() {
  return (
    process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
    process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
    ''
  );
}

function studentsCol() {
  return (
    process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
    process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
    ''
  );
}

export function centsToReais(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

export function parseAcademyFinanceConfig(academyDoc) {
  try {
    const raw = academyDoc?.financeConfig ?? academyDoc?.finance_config;
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export function resolveDueDateForReferenceMonth(studentDoc, referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const day = studentDueDay(studentDoc);
  if (!day) return null;
  const d = dueDateInMonth(ym, day);
  return d ? d.toISOString().slice(0, 10) : null;
}

function isUniqueConflict(err) {
  const code = Number(err?.code || err?.response?.code || 0);
  const msg = String(err?.message || err || '').toLowerCase();
  return code === 409 || msg.includes('already exists') || msg.includes('duplicate');
}

function buildStudentPaymentPayload({
  studentId,
  academyId,
  referenceMonth,
  amountReais,
  financialTxId,
  paidAt,
  status,
  studentDoc,
  planName,
  gatewayPaymentId,
  gatewayProvider,
  billingReferenceId,
  issuedAt,
}) {
  const st = String(status || 'pending').toLowerCase();
  const issued = issuedAt || new Date().toISOString();
  const billingRef =
    String(billingReferenceId || '').trim() ||
    buildStudentBillingReferenceId(academyId, studentId, referenceMonth);

  const payload = {
    lead_id: studentId,
    academy_id: academyId,
    amount: amountReais,
    expected_amount: amountReais,
    method: 'pagbank',
    account: 'pagbank',
    plan_name: String(planName || studentDoc?.plan || studentDoc?.plan_name || '').trim(),
    status: st,
    reference_month: referenceMonth,
    payment_category: PAYMENT_CATEGORY.PLAN,
    registered_by: 'pagbank',
    registered_by_name: 'PagBank',
    note: 'Cobrança PagBank Recorrente',
    gateway_provider: gatewayProvider || GATEWAY_PROVIDER_PAGBANK,
    issued_at: issued,
  };

  if (billingRef) payload.billing_reference_id = billingRef;
  const gwId = String(gatewayPaymentId || '').trim();
  if (gwId) payload.gateway_payment_id = gwId.slice(0, 64);

  if (st === 'paid') {
    payload.paid_amount = amountReais;
    payload.paid_at = paidAt || new Date().toISOString();
    payload.due_date = null;
    if (financialTxId) payload.financial_tx_id = financialTxId;
  } else if (st === 'pending') {
    payload.paid_at = null;
    payload.due_date = resolveDueDateForReferenceMonth(studentDoc, referenceMonth);
  }

  return payload;
}

function buildLiquidationPatch({
  amountReais,
  paidAt,
  financialTxId,
  gatewayPaymentId,
  gatewayProvider,
}) {
  const patch = {
    status: 'paid',
    paid_amount: amountReais,
    paid_at: paidAt || new Date().toISOString(),
    method: 'pagbank',
    account: 'pagbank',
    gateway_provider: gatewayProvider || GATEWAY_PROVIDER_PAGBANK,
  };
  const gwId = String(gatewayPaymentId || '').trim();
  if (gwId) patch.gateway_payment_id = gwId.slice(0, 64);
  if (financialTxId) patch.financial_tx_id = financialTxId;
  return patch;
}

async function writeStudentPaymentCreate(databases, dbId, payload) {
  const col = studentPaymentsCol();
  if (!col) throw new Error('student_payments_not_configured');
  return databases.createDocument(dbId, col, ID.unique(), payload);
}

async function writeStudentPaymentPatch(databases, dbId, docId, patch) {
  const col = studentPaymentsCol();
  if (!col) throw new Error('student_payments_not_configured');
  return databases.updateDocument(dbId, col, docId, patch);
}

async function auditLiquidation({
  existing,
  paidAmount,
  academyId,
  studentId,
  resolutionMethod,
  gatewayPaymentId,
}) {
  const expected = Number(existing?.expected_amount);
  const meta = {
    resolution_method: resolutionMethod || '',
    gateway_payment_id: String(gatewayPaymentId || '').trim(),
  };
  if (Number.isFinite(expected) && Math.abs(expected - paidAmount) > 0.009) {
    meta.changes = { paid_vs_expected: { from: expected, to: paidAmount } };
  }
  await recordFinancialAudit({
    action: 'payment_update',
    payment_id: existing?.$id,
    student_id: studentId,
    academy_id: academyId,
    user_id: 'pagbank',
    amount: paidAmount,
    previous_status: String(existing?.status || ''),
    new_status: 'paid',
    meta,
  });
}

async function auditGatewayConflict({
  existing,
  incomingGatewayId,
  academyId,
  studentId,
  resolutionMethod,
}) {
  await recordFinancialAudit({
    action: 'gateway_payment_conflict',
    payment_id: existing?.$id,
    student_id: studentId,
    academy_id: academyId,
    user_id: 'pagbank',
    amount: Number(existing?.paid_amount ?? existing?.amount) || null,
    previous_status: String(existing?.status || ''),
    new_status: String(existing?.status || ''),
    meta: {
      severity: 'warning',
      resolution_method: resolutionMethod || '',
      existing_gateway_payment_id: String(existing?.gateway_payment_id || '').trim(),
      incoming_gateway_payment_id: String(incomingGatewayId || '').trim(),
    },
  });
}

/**
 * @param {object} p
 * @param {number} p.amount — centavos PagBank
 */
export async function upsertStudentPaymentFromPagbank({
  databases,
  dbId,
  academyId,
  studentId,
  referenceMonth,
  amount,
  financialTxId,
  paidAt,
  status,
  studentDoc = null,
  planName = '',
  gatewayPaymentId = '',
  gatewayProvider = GATEWAY_PROVIDER_PAGBANK,
  billingReferenceId = '',
  existingDoc = null,
  resolutionMethod = '',
  issuedAt = null,
}) {
  if (!studentPaymentsCol() || !dbId || !studentId || !academyId || !referenceMonth) {
    return { skipped: true, reason: 'not_configured' };
  }

  const amountReais = centsToReais(amount);
  const st = String(status || 'pending').toLowerCase();
  const gwId = String(gatewayPaymentId || '').trim();
  const docForDue = studentDoc || {};

  if (gwId) {
    const replayDoc = await findStudentPaymentByGatewayPaymentId(databases, dbId, gwId);
    if (replayDoc) {
      console.info(
        JSON.stringify({
          event: 'pagbank_student_payment_gateway_replay',
          gateway_payment_id: gwId,
          student_payment_id: replayDoc.$id,
        })
      );
      return { skipped: true, reason: 'gateway_replay', doc: replayDoc };
    }
  }

  let existing = existingDoc || null;
  if (!existing) {
    existing = await findStudentPaymentForMonth(databases, dbId, {
      studentId,
      academyId,
      referenceMonth,
    });
  }

  const billingRef =
    String(billingReferenceId || '').trim() ||
    buildStudentBillingReferenceId(academyId, studentId, referenceMonth);

  if (st === 'pending' && existing) {
    const current = String(existing.status || '').toLowerCase();
    if (SETTLED_STUDENT_PAYMENT_STATUSES.has(current)) {
      return { skipped: true, reason: 'already_settled', doc: existing };
    }
    const metaPatch = {};
    if (gwId && !String(existing.gateway_payment_id || '').trim()) {
      metaPatch.gateway_payment_id = gwId.slice(0, 64);
    }
    if (!String(existing.gateway_provider || '').trim()) {
      metaPatch.gateway_provider = gatewayProvider || GATEWAY_PROVIDER_PAGBANK;
    }
    if (Object.keys(metaPatch).length === 0) {
      return { skipped: false, created: false, doc: existing };
    }
    const doc = await writeStudentPaymentPatch(databases, dbId, existing.$id, metaPatch);
    return { skipped: false, created: false, doc, metadata_only: true };
  }

  if (!existing) {
    const payload = buildStudentPaymentPayload({
      studentId,
      academyId,
      referenceMonth,
      amountReais,
      financialTxId,
      paidAt,
      status: st,
      studentDoc: docForDue,
      planName,
      gatewayPaymentId: gwId,
      gatewayProvider,
      billingReferenceId: billingRef,
      issuedAt,
    });
    try {
      const doc = await writeStudentPaymentCreate(databases, dbId, payload);
      return { skipped: false, created: true, doc };
    } catch (e) {
      if (gwId && isUniqueConflict(e)) {
        const replayDoc = await findStudentPaymentByGatewayPaymentId(databases, dbId, gwId);
        if (replayDoc) {
          console.info(
            JSON.stringify({
              event: 'pagbank_student_payment_unique_race_replay',
              gateway_payment_id: gwId,
              student_payment_id: replayDoc.$id,
            })
          );
          return { skipped: true, reason: 'gateway_replay', doc: replayDoc };
        }
      }
      throw e;
    }
  }

  const current = String(existing.status || '').toLowerCase();

  if (st === 'paid') {
    if (SETTLED_STUDENT_PAYMENT_STATUSES.has(current)) {
      const existingGw = String(existing.gateway_payment_id || '').trim();
      if (gwId && existingGw && gwId === existingGw) {
        console.info(
          JSON.stringify({
            event: 'pagbank_student_payment_gateway_replay',
            gateway_payment_id: gwId,
            student_payment_id: existing.$id,
          })
        );
        return { skipped: true, reason: 'gateway_replay', doc: existing };
      }
      if (gwId && (!existingGw || gwId !== existingGw)) {
        await auditGatewayConflict({
          existing,
          incomingGatewayId: gwId,
          academyId,
          studentId,
          resolutionMethod,
        });
        return { skipped: true, reason: 'settled_conflict', doc: existing };
      }
      return { skipped: true, reason: 'already_settled', doc: existing };
    }

    if (current === 'pending' || current === 'partial' || current === 'awaiting') {
      const patch = buildLiquidationPatch({
        amountReais,
        paidAt,
        financialTxId,
        gatewayPaymentId: gwId,
        gatewayProvider,
      });
      await auditLiquidation({
        existing,
        paidAmount: amountReais,
        academyId,
        studentId,
        resolutionMethod,
        gatewayPaymentId: gwId,
      });
      const doc = await writeStudentPaymentPatch(databases, dbId, existing.$id, patch);
      return { skipped: false, created: false, doc, liquidated: true };
    }
  }

  return { skipped: true, reason: 'no_op', doc: existing };
}

export async function loadStudentDocForPagbank(databases, dbId, studentId) {
  const col = studentsCol();
  if (!col || !studentId) return { $id: studentId };
  try {
    return await databases.getDocument(dbId, col, studentId);
  } catch {
    return { $id: studentId };
  }
}

/** Replica maybeSyncOverdueAfterSettlement do studentPaymentsHandler (liquidação). */
export async function syncOverdueAfterPagbankPaid({
  databases,
  dbId,
  studentDoc,
  academyId,
  studentId,
  financeConfig,
  academyDoc,
}) {
  if (!studentsCol()) return { updated: false, reason: 'not_configured' };
  try {
    const result = await syncStudentOverdueAfterPayment(databases, dbId, studentDoc, {
      academyId,
      leadId: studentId,
      financeConfig,
      peopleCol: studentsCol(),
    });
    if (result?.updated && academyDoc) {
      scheduleControlIdOverdueReconcile({ academyId, academyDoc, studentId });
    }
    return result;
  } catch (e) {
    console.error('[upsertStudentPaymentFromPagbank] overdue sync failed', studentId, e?.message || e);
    return { updated: false, error: e?.message || 'sync_failed' };
  }
}
