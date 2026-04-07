/**
 * Planos de uso da IA (threads/mês). Usado apenas no servidor (import a partir de /api).
 */
/* global process */
import { Client, Databases, ID, Permission, Role } from 'node-appwrite';

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
const AI_USAGE_LOGS_COL =
  process.env.APPWRITE_AI_USAGE_LOGS_COLLECTION_ID || process.env.VITE_APPWRITE_AI_USAGE_LOGS_COLLECTION_ID || '';

const PLANS = {
  starter: { threads_limit: 300, overage_cost: 0.8 },
  studio: { threads_limit: 800, overage_cost: 0.7 },
  pro: { threads_limit: 2000, overage_cost: 0.6 },
};

let cachedDb = null;

function getDatabases() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) return null;
  if (!cachedDb) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    cachedDb = new Databases(client);
  }
  return cachedDb;
}

export function getPlanConfig(plan) {
  const p = String(plan || 'starter')
    .trim()
    .toLowerCase();
  return PLANS[p] ? { ...PLANS[p] } : { ...PLANS.starter };
}

function normalizePlan(plan) {
  const p = String(plan || 'starter')
    .trim()
    .toLowerCase();
  return PLANS[p] ? p : 'starter';
}

/**
 * Início do período de faturamento atual (alinhado ao reset no dia billing_cycle_day).
 * Usa data local do servidor (Vercel = UTC).
 */
export function getCurrentBillingCycleId(now = new Date(), billingCycleDay = 1) {
  const bcd = Math.min(Math.max(parseInt(String(billingCycleDay), 10) || 1, 1), 28);
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const dom = now.getUTCDate();
  if (dom >= bcd) {
    return `${y}-${String(mo + 1).padStart(2, '0')}-${String(bcd).padStart(2, '0')}`;
  }
  const prev = new Date(Date.UTC(y, mo - 1, bcd));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(bcd).padStart(2, '0')}`;
}

/**
 * @param {string} academyId
 * @param {'starter'|'studio'|'pro'} plan
 * @param {object} [academyDoc] documento atual (evita GET extra)
 */
export async function setPlan(academyId, plan, academyDoc = null) {
  const databases = getDatabases();
  if (!databases) throw new Error('Appwrite não configurado');
  const id = String(academyId || '').trim();
  const normalized = normalizePlan(plan);
  const cfg = getPlanConfig(normalized);
  if (!academyDoc) {
    await databases.getDocument(DB_ID, ACADEMIES_COL, id);
  }
  await databases.updateDocument(DB_ID, ACADEMIES_COL, id, {
    plan: normalized,
    ai_threads_limit: cfg.threads_limit,
    plan_started_at: new Date().toISOString(),
  });
}

/**
 * @param {Record<string, unknown>} academy documento academia (Appwrite)
 */
export function checkAiQuota(academy) {
  const cfg = getPlanConfig(academy?.plan);
  const limitRaw = academy?.ai_threads_limit;
  const limit = Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0 ? Number(limitRaw) : cfg.threads_limit;
  const used = Number(academy?.ai_threads_used) || 0;
  if (used < limit) {
    return { allowed: true, overage: false };
  }
  const overEnabled = academy?.ai_overage_enabled !== false && academy?.ai_overage_enabled !== 'false';
  if (overEnabled) {
    return { allowed: true, overage: true, overage_cost: cfg.overage_cost };
  }
  return { allowed: false };
}

async function appendUsageLog(databases, { academyId, type, plan, threadsUsed, isOverage }) {
  if (!AI_USAGE_LOGS_COL) return;
  const perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
  await databases.createDocument(
    DB_ID,
    AI_USAGE_LOGS_COL,
    ID.unique(),
    {
      academy_id: String(academyId),
      type: String(type),
      plan: String(plan || 'starter'),
      threads_used: Number(threadsUsed) || 0,
      is_overage: Boolean(isOverage),
      timestamp: new Date().toISOString(),
    },
    perms
  );
}

/**
 * Zera contador e registra monthly_reset (cron).
 * @param {Record<string, unknown>} academyDoc
 */
export async function resetAcademyMonthlyThreadUsage(academyDoc) {
  const databases = getDatabases();
  if (!databases) throw new Error('Appwrite não configurado');
  const id = String(academyDoc?.$id || '').trim();
  if (!id) throw new Error('academy id inválido');
  const p = normalizePlan(academyDoc?.plan);
  await databases.updateDocument(DB_ID, ACADEMIES_COL, id, { ai_threads_used: 0 });
  await appendUsageLog(databases, {
    academyId: id,
    type: 'monthly_reset',
    plan: p,
    threadsUsed: 0,
    isOverage: false,
  });
}

/**
 * @param {string} academyId
 * @param {boolean} isOverage
 * @param {string} plan
 */
export async function incrementAiThreads(academyId, isOverage, plan) {
  const databases = getDatabases();
  if (!databases) throw new Error('Appwrite não configurado');
  const id = String(academyId || '').trim();
  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
  const prev = Number(doc.ai_threads_used) || 0;
  const next = prev + 1;
  await databases.updateDocument(DB_ID, ACADEMIES_COL, id, { ai_threads_used: next });
  const p = normalizePlan(plan || doc.plan);
  await appendUsageLog(databases, {
    academyId: id,
    type: 'thread_started',
    plan: p,
    threadsUsed: next,
    isOverage: Boolean(isOverage),
  });
  if (isOverage) {
    await appendUsageLog(databases, {
      academyId: id,
      type: 'overage',
      plan: p,
      threadsUsed: next,
      isOverage: true,
    });
  }
}

export function isPlanServiceConfigured() {
  return Boolean(getDatabases() && AI_USAGE_LOGS_COL);
}

export { AI_USAGE_LOGS_COL, ACADEMIES_COL, DB_ID };
