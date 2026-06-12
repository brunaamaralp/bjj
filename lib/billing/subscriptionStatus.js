import { Client, Databases } from 'node-appwrite';
import { evaluateBillingAccess } from './gate.js';
import { getBillingDatabases, findSubscriptionByStoreId } from './billingAppwriteStore.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function trialDaysRemaining(isoEnd) {
  if (!isoEnd) return null;
  const end = new Date(isoEnd);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 86400000);
}

/**
 * @param {string} storeId
 */
export async function buildSubscriptionStatus(storeId) {
  const access = await evaluateBillingAccess(storeId);
  const billingDb = getBillingDatabases();
  const sub = billingDb ? await findSubscriptionByStoreId(billingDb, storeId) : null;

  let plan = null;
  let aiThreadsUsed = 0;
  let aiThreadsLimit = 300;
  try {
    if (DB_ID && ACADEMIES_COL && PROJECT_ID && API_KEY) {
      const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
      const databases = new Databases(client);
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, storeId);
      plan = String(doc?.plan || 'starter').trim().toLowerCase() || 'starter';
      aiThreadsUsed = Number(doc?.ai_threads_used) || 0;
      aiThreadsLimit = Number(doc?.ai_threads_limit) || 300;
    }
  } catch {
    void 0;
  }

  return {
    sucesso: true,
    plan,
    ...access,
    planSlug: sub?.planSlug || plan,
    pendingPlanSlug: sub?.pendingPlanSlug || null,
    cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
    asaasSubscriptionId: sub?.asaasSubscriptionId || null,
    asaasCustomerId: sub?.asaasCustomerId || null,
    billingType: sub?.billingType || null,
    trialDaysRemaining: access.status === 'trial' ? trialDaysRemaining(access.currentPeriodEnd) : null,
    aiThreadsUsed,
    aiThreadsLimit,
  };
}
