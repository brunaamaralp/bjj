import { Client, Databases } from 'node-appwrite';
import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
  updateSubscriptionByStoreId,
} from './billingAppwriteStore.js';
import { updateAsaasSubscription } from './asaasClient.js';
import { resolvePlan } from './plans.js';
import { isPlanDowngrade, isPlanUpgrade } from './planOrder.js';
import { getPlanConfig } from '../../src/lib/planConfig.js';

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

async function syncAcademyPlan(storeId, planKey) {
  if (!DB_ID || !ACADEMIES_COL || !PROJECT_ID || !API_KEY) return;
  const cfg = getPlanConfig(planKey);
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  await databases.updateDocument(DB_ID, ACADEMIES_COL, storeId, {
    plan: planKey,
    ai_threads_limit: cfg.threads,
    plan_updated_at: new Date().toISOString(),
  });
}

/**
 * @param {{ storeId: string, planSlug: string, when?: 'now' | 'next_cycle' }} input
 */
export async function changePlan(input) {
  if (!isBillingStoreConfigured()) {
    const err = new Error('Billing não configurado.');
    err.code = 'BILLING_CONFIG';
    throw err;
  }
  const databases = getBillingDatabases();
  if (!databases) {
    const err = new Error('Billing DB indisponível.');
    err.code = 'BILLING_CONFIG';
    throw err;
  }

  const storeId = String(input.storeId || '').trim();
  const targetPlan = resolvePlan(input.planSlug);
  if (!targetPlan) {
    const err = new Error('Plano inválido.');
    err.code = 'VALIDATION';
    throw err;
  }

  const sub = await findSubscriptionByStoreId(databases, storeId);
  if (!sub) {
    const err = new Error('Assinatura não encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (sub.status === 'past_due') {
    const err = new Error('Regularize o pagamento antes de mudar de plano.');
    err.code = 'PAST_DUE';
    throw err;
  }

  const currentSlug = sub.planSlug || 'starter';
  if (currentSlug === targetPlan.slug) {
    return { changed: false, planSlug: targetPlan.slug, message: 'Plano já é o atual.' };
  }

  const when = input.when === 'next_cycle' ? 'next_cycle' : 'now';
  const downgrading = isPlanDowngrade(currentSlug, targetPlan.slug);
  const upgrading = isPlanUpgrade(currentSlug, targetPlan.slug);

  if (downgrading && when === 'now') {
    const err = new Error('Downgrade só pode ser agendado para o próximo ciclo.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (upgrading && when === 'next_cycle') {
    const err = new Error('Upgrade é aplicado imediatamente.');
    err.code = 'VALIDATION';
    throw err;
  }

  if (when === 'next_cycle') {
    await updateSubscriptionByStoreId(databases, storeId, { pendingPlanSlug: targetPlan.slug });
    return { changed: true, planSlug: targetPlan.slug, when: 'next_cycle', pending: true };
  }

  if (!sub.asaasSubscriptionId) {
    const err = new Error('Assinatura Asaas não encontrada. Use o checkout para assinar.');
    err.code = 'NO_SUBSCRIPTION';
    throw err;
  }

  await updateAsaasSubscription(sub.asaasSubscriptionId, {
    value: targetPlan.value,
    description: targetPlan.label,
    externalReference: `nave:${storeId}:${targetPlan.slug}`,
  });

  await updateSubscriptionByStoreId(databases, storeId, {
    planSlug: targetPlan.slug,
    pendingPlanSlug: null,
  });
  await syncAcademyPlan(storeId, targetPlan.slug);

  return { changed: true, planSlug: targetPlan.slug, when: 'now' };
}

/**
 * Aplica pendingPlanSlug após pagamento confirmado.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} storeId
 */
export async function applyPendingPlanIfNeeded(databases, storeId) {
  const sub = await findSubscriptionByStoreId(databases, storeId);
  if (!sub?.pendingPlanSlug) return null;
  const plan = resolvePlan(sub.pendingPlanSlug);
  if (!plan) return null;

  if (sub.asaasSubscriptionId) {
    try {
      await updateAsaasSubscription(sub.asaasSubscriptionId, {
        value: plan.value,
        description: plan.label,
        externalReference: `nave:${storeId}:${plan.slug}`,
      });
    } catch (e) {
      console.error('[changePlan] apply pending Asaas failed:', e?.message);
    }
  }

  await updateSubscriptionByStoreId(databases, storeId, {
    planSlug: plan.slug,
    pendingPlanSlug: null,
  });
  await syncAcademyPlan(storeId, plan.slug);
  return plan.slug;
}
