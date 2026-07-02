/**
 * Invalidação de caches servidor do hub Financeiro após mutações.
 */
import { invalidateAcademyStudentsCache } from './academyStudentsCache.js';
import { invalidateCachedKeysForAcademy } from './reportsLightCache.js';
import { invalidateFinanceForecastCache } from './financeForecastHandler.js';

const FINANCE_HUB_CACHE_MARKERS = [
  'receivables-bundle',
  'payables-catalog',
  'finance-overview',
  'finance-summary',
];

export function invalidateFinanceHubServerCache(academyId) {
  const id = String(academyId || '').trim();
  if (!id) return;
  invalidateAcademyStudentsCache(id);
  invalidateCachedKeysForAcademy(id, FINANCE_HUB_CACHE_MARKERS);
}

/** Invalida caches de leitura financeira após escrita (tx, pagamento, etc.). */
export function notifyFinanceHubDataChanged(academyId) {
  invalidateFinanceHubServerCache(academyId);
  invalidateFinanceForecastCache(academyId);
}
