/**
 * Cron: mensalidades paid/partial sem espelho válido no Caixa.
 * Agendado em vercel.json: GET /api/cron/reset-usage?action=student-payment-reconcile (45 7 * * * UTC).
 * Requer CRON_SECRET (Authorization: Bearer, x-cron-secret ou ?secret=).
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { reconcileStudentPaymentMirrorsForAcademy } from './studentPaymentReconcileCore.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

export async function runStudentPaymentReconcileCron() {
  if (!ACADEMIES_COL || !DB_ID) {
    return { repaired: 0, failed: 0, skipped: 'not_configured' };
  }

  let checked = 0;
  let repaired = 0;
  let failed = 0;

  const academies = await databases.listDocuments(DB_ID, ACADEMIES_COL, [Query.limit(100)]);
  for (const academy of academies.documents || []) {
    const out = await reconcileStudentPaymentMirrorsForAcademy(academy.$id, academy, {
      notifyOnFailure: true,
    });
    checked += out.checked || 0;
    repaired += out.repaired || 0;
    failed += out.failed || 0;
  }

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'student_payment_reconcile_cron',
      checked,
      repaired,
      failed,
    })
  );
  return { checked, repaired, failed };
}
