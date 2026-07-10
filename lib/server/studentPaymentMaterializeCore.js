/**
 * Materializa uma cobrança mensal para um aluno (create / backfill / frozen sync).
 */
import { ID } from 'node-appwrite';
import { findStudentPaymentForMonth } from './studentPaymentLookup.js';
import { fetchActiveFreezesForStudent } from './planFreezeLookup.js';
import { buildFrozenPaymentFields } from '../planFreezeProjection.js';
import {
  backfillPatchForExistingPayment,
  buildPendingPaymentFields,
  computeDueDateForMaterialization,
  computeExpectedAmountForMaterialization,
  resolveMaterializationStatus,
  shouldMaterializeStudentForMonth,
  isSettledPaymentStatus,
} from '../studentPaymentMaterialization.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

/**
 * @returns {Promise<{ action: string, reason?: string, paymentId?: string }>}
 */
export async function materializeStudentPaymentForMonth({
  databases,
  dbId,
  student,
  academyId,
  financeConfig = null,
  referenceMonth,
  freezes = null,
  issuedAt = null,
}) {
  if (!PAYMENTS_COL) return { action: 'skipped', reason: 'payments_not_configured' };

  const leadId = String(student?.id || student?.$id || student?.lead_id || '').trim();
  const aid = String(academyId || student?.academyId || student?.academy_id || '').trim();
  const ym = String(referenceMonth || '').trim();
  if (!leadId || !aid || !/^\d{4}-\d{2}$/.test(ym)) {
    return { action: 'skipped', reason: 'invalid_input' };
  }

  const eligibility = shouldMaterializeStudentForMonth({
    student,
    referenceMonth: ym,
    financeConfig,
  });
  if (eligibility.skip) return { action: 'skipped', reason: eligibility.reason };

  const freezeDocs =
    freezes != null
      ? freezes
      : await fetchActiveFreezesForStudent(databases, dbId, { studentId: leadId, academyId: aid });

  const targetStatus = resolveMaterializationStatus(freezeDocs, ym);
  const planName = String(student?.plan || '').trim();
  const expectedAmount = computeExpectedAmountForMaterialization(student, financeConfig);
  const dueDate = computeDueDateForMaterialization(student, ym);
  const issued = issuedAt || new Date().toISOString();

  const existing = await findStudentPaymentForMonth(databases, dbId, {
    studentId: leadId,
    academyId: aid,
    referenceMonth: ym,
  });

  const pendingFields = buildPendingPaymentFields({
    leadId,
    academyId: aid,
    referenceMonth: ym,
    planName,
    expectedAmount,
    dueDate,
    existing,
    issuedAt: issued,
  });

  const frozenFields = buildFrozenPaymentFields({
    leadId,
    academyId: aid,
    referenceMonth: ym,
    planName,
    existing,
    issuedAt: issued,
  });

  const targetFields = targetStatus === 'frozen' ? frozenFields : pendingFields;

  if (existing?.$id) {
    const existingStatus = String(existing.status || '').toLowerCase();

    if (targetStatus === 'frozen' && existingStatus === 'pending') {
      try {
        await databases.updateDocument(dbId, PAYMENTS_COL, existing.$id, frozenFields);
        return { action: 'upgraded_to_frozen', paymentId: existing.$id };
      } catch (e) {
        console.warn(
          JSON.stringify({
            event: 'student_payment_materialize_upgrade_frozen_failed',
            lead_id: leadId,
            reference_month: ym,
            error: e?.message || String(e),
          })
        );
        return { action: 'error', reason: 'upgrade_frozen_failed' };
      }
    }

    if (isSettledPaymentStatus(existingStatus)) {
      const patch = backfillPatchForExistingPayment(existing, targetFields);
      if (patch) {
        try {
          await databases.updateDocument(dbId, PAYMENTS_COL, existing.$id, patch);
          return { action: 'backfilled_settled', paymentId: existing.$id };
        } catch (e) {
          console.warn(
            JSON.stringify({
              event: 'student_payment_materialize_backfill_failed',
              lead_id: leadId,
              reference_month: ym,
              error: e?.message || String(e),
            })
          );
          return { action: 'error', reason: 'backfill_failed' };
        }
      }
      return { action: 'skipped', reason: `existing_${existingStatus}` };
    }

    const patch = backfillPatchForExistingPayment(existing, targetFields);
    if (patch) {
      try {
        await databases.updateDocument(dbId, PAYMENTS_COL, existing.$id, patch);
        return { action: 'backfilled_pending', paymentId: existing.$id };
      } catch (e) {
        console.warn(
          JSON.stringify({
            event: 'student_payment_materialize_backfill_pending_failed',
            lead_id: leadId,
            reference_month: ym,
            error: e?.message || String(e),
          })
        );
        return { action: 'error', reason: 'backfill_pending_failed' };
      }
    }
    return { action: 'skipped', reason: 'existing_complete' };
  }

  const createPayload = targetStatus === 'frozen' ? frozenFields : pendingFields;
  try {
    const created = await databases.createDocument(dbId, PAYMENTS_COL, ID.unique(), createPayload);
    return {
      action: targetStatus === 'frozen' ? 'created_frozen' : 'created_pending',
      paymentId: created.$id,
    };
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (msg.includes('already exists') || Number(e?.code) === 409) {
      return { action: 'skipped', reason: 'race_conflict' };
    }
    console.warn(
      JSON.stringify({
        event: 'student_payment_materialize_create_failed',
        lead_id: leadId,
        reference_month: ym,
        error: e?.message || String(e),
      })
    );
    return { action: 'error', reason: 'create_failed' };
  }
}
