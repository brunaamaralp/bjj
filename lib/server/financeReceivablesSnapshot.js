/**
 * Snapshot de contas a receber + resumo de cobrança (cache servidor).
 */
import { buildReceivablesSnapshot } from '../../src/lib/receivablesAggregate.js';
import {
  buildCollectionQueue,
  COLLECTION_QUEUE_LOOKBACK_MONTHS,
} from '../../src/lib/collectionQueue.js';
import { shiftMonthYm } from '../../src/lib/financeiroOverview.js';
import { cacheKey, getCached, setCached } from './reportsLightCache.js';
import { loadReceivablesInputs, listGridPaymentsForAcademy } from './financeReceivablesData.js';

export const RECEIVABLES_SNAPSHOT_CACHE_MS = Number(process.env.RECEIVABLES_CACHE_MS || 45_000);
export const RECEIVABLES_DEFAULT_PAGE_SIZE = 80;
export const RECEIVABLES_MAX_PAGE_SIZE = 200;

function currentMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseReceivablesPagination(query = {}) {
  const rawLimit = Number.parseInt(String(query.limit ?? ''), 10);
  const rawOffset = Number.parseInt(String(query.offset ?? ''), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(RECEIVABLES_MAX_PAGE_SIZE, Math.max(1, rawLimit))
    : RECEIVABLES_DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
  return { limit, offset };
}

/**
 * @param {object} params
 * @param {string} params.academyId
 * @param {string} params.referenceMonth
 * @param {object} params.financeConfig
 * @param {boolean} [params.bypassCache]
 * @param {boolean} [params.includeCobranca]
 */
export async function loadReceivablesSnapshotBundle({
  academyId,
  referenceMonth,
  financeConfig,
  bypassCache = false,
  includeCobranca = false,
}) {
  const key = cacheKey([
    'receivables-bundle',
    'v2',
    academyId,
    referenceMonth,
    includeCobranca ? 'cobranca' : '',
  ]);

  if (!bypassCache) {
    const hit = getCached(key);
    if (hit) return hit;
  }

  const cobrancaPaymentsPromise = includeCobranca
    ? (() => {
        const currentMonth = currentMonthYm();
        const minReferenceMonth = shiftMonthYm(
          currentMonth,
          -(COLLECTION_QUEUE_LOOKBACK_MONTHS - 1)
        );
        return listGridPaymentsForAcademy(academyId, { minReferenceMonth });
      })()
    : Promise.resolve(null);

  const [inputs, cobrancaPaymentsResult] = await Promise.all([
    loadReceivablesInputs(academyId, referenceMonth),
    cobrancaPaymentsPromise,
  ]);

  const cobrancaPayments = cobrancaPaymentsResult?.rows || null;
  const cobrancaPaymentsTruncated = Boolean(cobrancaPaymentsResult?.truncated);

  const snapshot = buildReceivablesSnapshot({
    students: inputs.students,
    payments: inputs.payments,
    financeConfig,
    referenceMonth,
    pendingTransactions: inputs.pendingTransactions,
    deferredSales: inputs.deferredSales,
  });

  let cobrancaSummary = null;
  if (includeCobranca && cobrancaPayments) {
    const { summary } = buildCollectionQueue({
      students: inputs.students,
      payments: cobrancaPayments,
      financeConfig,
    });
    cobrancaSummary = summary;
  }

  const dataWarnings = {
    ...(inputs.dataWarnings || {}),
    cobrancaPaymentsTruncated: includeCobranca ? cobrancaPaymentsTruncated : false,
  };

  const bundle = { snapshot, cobrancaSummary, dataWarnings };
  setCached(key, bundle, RECEIVABLES_SNAPSHOT_CACHE_MS);
  return bundle;
}
