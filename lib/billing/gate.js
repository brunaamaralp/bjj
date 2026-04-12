import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
  updateSubscriptionDocument,
} from './billingAppwriteStore.js';
import { validateCpfCnpj } from './validation.js';

function companyTaxOkFromRow(row) {
  if (!row?.taxDocumentDigits) return false;
  return validateCpfCnpj(String(row.taxDocumentDigits)).ok;
}

/**
 * @typedef {'full' | 'limited' | 'none'} AccessLevel
 */

/**
 * @param {string} storeId
 * @returns {Promise<{ accessLevel: AccessLevel, status: string, needsPlan: boolean, currentPeriodEnd: string | null, companyTaxOk: boolean }>}
 */
export async function evaluateBillingAccess(storeId) {
  const sid = String(storeId || '').trim();
  if (!sid) {
    return { accessLevel: 'none', status: 'none', needsPlan: true, currentPeriodEnd: null, companyTaxOk: true };
  }
  if (!isBillingStoreConfigured()) {
    return { accessLevel: 'full', status: 'skipped', needsPlan: false, currentPeriodEnd: null, companyTaxOk: true };
  }
  const databases = getBillingDatabases();
  if (!databases) {
    return { accessLevel: 'full', status: 'skipped', needsPlan: false, currentPeriodEnd: null, companyTaxOk: true };
  }

  let row = await findSubscriptionByStoreId(databases, sid);
  if (!row) {
    return { accessLevel: 'none', status: 'none', needsPlan: true, currentPeriodEnd: null, companyTaxOk: true };
  }

  const now = new Date();

  if (row.status === 'trial' && row.currentPeriodEnd && row.currentPeriodEnd < now) {
    row = await updateSubscriptionDocument(databases, row.$id, { status: 'inactive' });
  }

  if (row.status === 'inactive' || row.status === 'canceled') {
    return {
      accessLevel: 'none',
      status: row.status,
      needsPlan: true,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      companyTaxOk: true,
    };
  }

  if (row.status === 'past_due') {
    return {
      accessLevel: 'limited',
      status: 'past_due',
      needsPlan: false,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      companyTaxOk: companyTaxOkFromRow(row),
    };
  }

  if (row.status === 'trial' && row.currentPeriodEnd && row.currentPeriodEnd >= now) {
    return {
      accessLevel: 'full',
      status: 'trial',
      needsPlan: false,
      currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      companyTaxOk: companyTaxOkFromRow(row),
    };
  }

  if (row.status === 'active') {
    if (row.currentPeriodEnd && row.currentPeriodEnd < now && !row.cancelAtPeriodEnd) {
      return {
        accessLevel: 'limited',
        status: 'active',
        needsPlan: false,
        currentPeriodEnd: row.currentPeriodEnd.toISOString(),
        companyTaxOk: companyTaxOkFromRow(row),
      };
    }
    return {
      accessLevel: 'full',
      status: 'active',
      needsPlan: false,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      companyTaxOk: companyTaxOkFromRow(row),
    };
  }

  return {
    accessLevel: 'none',
    status: row.status,
    needsPlan: true,
    currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
    companyTaxOk: companyTaxOkFromRow(row),
  };
}

/**
 * Gate simples para recursos do app (ex.: módulos premium).
 * @param {string} storeId
 */
export async function canUseFeature(storeId) {
  const a = await evaluateBillingAccess(storeId);
  return a.accessLevel !== 'none';
}
