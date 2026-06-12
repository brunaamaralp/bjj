/**
 * Reconciliação periódica Appwrite ↔ Asaas para assinatura da academia (Nave).
 * Não aplica a mensalidades de alunos (student_payments).
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import {
  isBillingStoreConfigured,
  getBillingDatabases,
  findSubscriptionByStoreId,
  updateSubscriptionByStoreId,
} from '../billing/billingAppwriteStore.js';
import { getAsaasSubscription } from '../billing/asaasClient.js';
import { finalizeScheduledCancellation } from '../billing/cancelSubscription.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const ACADEMIES_PER_MINUTE = Math.min(
  40,
  Math.max(1, Number(process.env.BILLING_RECONCILE_ACADEMIES_PER_MIN) || 20)
);

export async function runBillingSubscriptionReconcile() {
  const billingDb = getBillingDatabases();
  if (!isBillingStoreConfigured() || !ACADEMIES_COL || !billingDb) {
    return { ok: false, error: 'billing_not_configured' };
  }

  let checked = 0;
  let mismatches = 0;
  const PAGE = ACADEMIES_PER_MINUTE;

  const page = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
    Query.limit(PAGE),
    Query.orderAsc('$id'),
  ]);

  for (const academy of page.documents || []) {
    const academyId = academy.$id;
    try {
      const sub = await findSubscriptionByStoreId(billingDb, academyId);
      if (!sub) continue;

      if (sub.cancelAtPeriodEnd) {
        try {
          await finalizeScheduledCancellation(billingDb, sub);
        } catch (e) {
          console.error('[billing-reconcile] finalize cancel:', academyId, e?.message);
        }
      }

      if (!sub?.asaasSubscriptionId) continue;

      checked += 1;
      const remote = await getAsaasSubscription(sub.asaasSubscriptionId);
      const remoteStatus = String(remote?.status || '').toLowerCase();
      const localStatus = String(sub.status || '').toLowerCase();
      if (remoteStatus === 'active' && localStatus === 'past_due') {
        await updateSubscriptionByStoreId(billingDb, academyId, { status: 'active' });
      } else if (remoteStatus && remoteStatus !== localStatus && remoteStatus !== 'active') {
        mismatches += 1;
        console.warn(
          JSON.stringify({
            event: 'billing_reconcile_mismatch',
            academy_id: academyId,
            local: localStatus,
            asaas: remoteStatus,
            subscription_id: sub.asaasSubscriptionId,
          })
        );
      }
    } catch (e) {
      console.error('[billing-reconcile]', academyId, e?.message || e);
    }
  }

  return { ok: true, checked, mismatches, rateLimitPerRun: PAGE };
}
