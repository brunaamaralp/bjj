/**
 * GET /api/finance?route=collection-queue
 * Fila de cobrança acumulada (multi-mês).
 */
import { ensureAuth, ensureAcademyAccess, ACADEMIES_COL, DB_ID, databases } from './academyAccess.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { buildCollectionQueue, COLLECTION_QUEUE_LOOKBACK_MONTHS } from '../../src/lib/collectionQueue.js';
import { shiftMonthYm } from '../../src/lib/financeiroOverview.js';
import { listAcademyStudentsMappedCached } from './academyStudentsCache.js';
import { listGridPaymentsForAcademy } from './financeReceivablesData.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function currentMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function collectionQueueHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  try {
    let financeConfig = { bankAccounts: [], plans: [] };
    if (ACADEMIES_COL && academyDoc) {
      financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc);
    } else if (ACADEMIES_COL) {
      try {
        const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        financeConfig = mergeFinanceConfigFromAcademyDoc(academy);
      } catch {
        /* defaults */
      }
    }

    const currentMonth = currentMonthYm();
    const minReferenceMonth = shiftMonthYm(
      currentMonth,
      -(COLLECTION_QUEUE_LOOKBACK_MONTHS - 1)
    );

    const [students, paymentsResult] = await Promise.all([
      listAcademyStudentsMappedCached(academyId),
      listGridPaymentsForAcademy(academyId, { minReferenceMonth }),
    ]);

    const { summary, rows, collectionRules } = buildCollectionQueue({
      students,
      payments: paymentsResult.rows,
      financeConfig,
    });

    return json(res, 200, {
      ok: true,
      summary,
      rows,
      currentMonth,
      collectionRules,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'finance_collection_queue_error',
        academyId,
        error: e?.message || String(e),
      })
    );
    return json(res, 500, { ok: false, error: 'collection_queue_failed' });
  }
}
