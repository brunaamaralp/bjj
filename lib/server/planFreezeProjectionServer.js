/**
 * Materialização e reversão de projeção frozen em student_payments (servidor).
 */
import { ID } from 'node-appwrite';
import { computeDurationDays, referenceMonthsInRange } from '../planFreezeCore.js';
import {
  buildFrozenPaymentFields,
  monthsToRevertOnUnfreeze,
} from '../planFreezeProjection.js';
import { fetchActiveFreezesForStudent } from './planFreezeLookup.js';
import { recordFinancialAudit } from './financialAuditLog.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

function freezeIsoFromYmd(ymd) {
  return `${String(ymd).slice(0, 10)}T12:00:00.000Z`;
}

async function listLeadPayments(databases, dbId, leadId) {
  if (!PAYMENTS_COL) return [];
  const { Query } = await import('node-appwrite');
  const res = await databases.listDocuments(dbId, PAYMENTS_COL, [
    Query.equal('lead_id', String(leadId)),
    Query.limit(120),
  ]);
  return res.documents || [];
}

/**
 * Encurta end_date do registro plan_freezes que coincide com freezeStartYmd.
 */
export async function shortenPlanFreezeEndDate({
  databases,
  dbId,
  planFreezesCol,
  studentId,
  academyId,
  freezeStartYmd,
  newEndYmd,
}) {
  const col = String(planFreezesCol || '').trim();
  const start = String(freezeStartYmd || '').trim().slice(0, 10);
  const end = String(newEndYmd || '').trim().slice(0, 10);
  if (!col || !start || !end) return { updated: false, reason: 'not_configured' };

  const freezes = await fetchActiveFreezesForStudent(databases, dbId, {
    studentId,
    academyId,
  });
  const match = freezes.find((fr) => {
    const frStart = String(fr.start_date || fr.startDate || '').trim().slice(0, 10);
    return frStart === start;
  });
  if (!match?.$id) return { updated: false, reason: 'freeze_record_not_found' };

  const days = computeDurationDays(start, end);
  await databases.updateDocument(dbId, col, match.$id, {
    end_date: freezeIsoFromYmd(end),
    indefinite: false,
    days,
  });
  return { updated: true, freezeId: match.$id };
}

/**
 * Reverte projeção frozen → pending nos meses posteriores ao mês do destrancamento.
 * O mês do destrancamento permanece frozen.
 */
export async function revertFrozenProjection({
  databases,
  dbId,
  planFreezesCol = '',
  leadId,
  academyId,
  unfreezeYmd,
  freezeStartYmd,
  freezeEndYmd,
  userId = 'system',
}) {
  if (!PAYMENTS_COL) return { reverted: 0, skipped: true, reason: 'payments_not_configured' };

  const monthsToRevert = new Set(
    monthsToRevertOnUnfreeze(unfreezeYmd, freezeStartYmd, freezeEndYmd)
  );
  if (!monthsToRevert.size) {
    return { reverted: 0 };
  }

  const payments = await listLeadPayments(databases, dbId, leadId);
  let reverted = 0;

  for (const p of payments) {
    const ym = String(p.reference_month || '');
    if (!monthsToRevert.has(ym)) continue;
    if (String(p.status || '').toLowerCase() !== 'frozen') continue;

    const patch = {
      status: 'pending',
      covered_reason: null,
    };
    const note = String(p.note || '').replace(/^Trancamento — /, '').trim();
    if (note) patch.note = note;
    else patch.note = '';

    try {
      await databases.updateDocument(dbId, PAYMENTS_COL, p.$id, patch);
      reverted += 1;
      await recordFinancialAudit({
        action: 'payment_update',
        payment_id: p.$id,
        student_id: leadId,
        academy_id: academyId,
        user_id: userId,
        amount: Number(p.amount) || null,
        previous_status: 'frozen',
        new_status: 'pending',
        meta: {
          changes: { status: { from: 'frozen', to: 'pending' } },
          unfreeze_ymd: String(unfreezeYmd || '').slice(0, 10),
          reference_month: ym,
        },
      });
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: 'plan_freeze_revert_payment_failed',
          payment_id: p.$id,
          reference_month: ym,
          error: e?.message || String(e),
        })
      );
    }
  }

  if (planFreezesCol) {
    await shortenPlanFreezeEndDate({
      databases,
      dbId,
      planFreezesCol,
      studentId: leadId,
      academyId,
      freezeStartYmd,
      newEndYmd: unfreezeYmd,
    });
  }

  return { reverted };
}

/**
 * Materializa status frozen nos meses do intervalo (cria ou atualiza docs).
 */
export async function materializeFrozenPaymentsInRange({
  databases,
  dbId,
  leadId,
  academyId,
  startYmd,
  endYmd,
  planName = '',
}) {
  if (!PAYMENTS_COL) return { updated: 0, created: 0 };

  const months = referenceMonthsInRange(startYmd, endYmd);
  if (!months.length) return { updated: 0, created: 0 };

  const payments = await listLeadPayments(databases, dbId, leadId);
  let updated = 0;
  let created = 0;
  const issuedAt = new Date().toISOString();

  for (const reference_month of months) {
    const existing = payments.find(
      (p) =>
        String(p.reference_month || '') === reference_month &&
        String(p.payment_category || 'plan').toLowerCase() !== 'bundle'
    );
    const payload = buildFrozenPaymentFields({
      leadId,
      academyId,
      referenceMonth: reference_month,
      planName,
      existing,
      issuedAt,
    });

    try {
      if (existing?.$id) {
        if (String(existing.status || '').toLowerCase() === 'frozen') continue;
        await databases.updateDocument(dbId, PAYMENTS_COL, existing.$id, payload);
        updated += 1;
      } else {
        await databases.createDocument(dbId, PAYMENTS_COL, ID.unique(), payload);
        created += 1;
      }
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: 'plan_freeze_materialize_failed',
          lead_id: leadId,
          reference_month,
          error: e?.message || String(e),
        })
      );
    }
  }

  return { updated, created };
}
