import { Client, Databases } from 'node-appwrite';
import { isBillingApiLive } from '../lib/server/billingApiEnabled.js';
import { isBillingStoreConfigured } from '../lib/billing/billingAppwriteStore.js';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from '../lib/server/authAppwrite.js';
import { validateBillingCustomer } from '../lib/billing/validation.js';
import { runCheckout } from '../lib/billing/runCheckout.js';
import { listPlansForDisplay } from '../lib/billing/plans.js';
import { evaluateBillingAccess } from '../lib/billing/gate.js';
import { ensureTrialSubscription } from '../lib/billing/ensureTrial.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

export const config = {
  runtime: 'edge',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || url.searchParams.get('slug');

  if (action === 'plans') {
    if (req.method !== 'GET') return jsonResponse({ sucesso: false, erro: 'Method Not Allowed' }, 405);
    try { return jsonResponse({ sucesso: true, plans: listPlansForDisplay() }, 200); } catch (e) { return jsonResponse({ sucesso: false, erro: e.message }, 500); }
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID) return jsonResponse({ sucesso: false, erro: 'Configuração Appwrite incompleta.' }, 500);
  const auth = String(req.headers.get('authorization') || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return jsonResponse({ sucesso: false, erro: 'JWT ausente' }, 401);
  const jwt = auth.slice(7).trim();
  if (!jwt) return jsonResponse({ sucesso: false, erro: 'JWT inválido' }, 401);

  try {
    const me = await getAppwriteUserFromJwt(jwt);
    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);

    if (action === 'status') {
      const storeId = String(url.searchParams.get('storeId') || '').trim();
      if (!storeId) return jsonResponse({ sucesso: false, erro: 'storeId obrigatório' }, 400);
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      if (!isBillingApiLive()) return jsonResponse({ sucesso: true, accessLevel: 'full', status: 'preview', needsPlan: false }, 200);
      return jsonResponse({ sucesso: true, ...(await evaluateBillingAccess(storeId)) }, 200);
    }

    if (action === 'checkout') {
      if (req.method !== 'POST') return jsonResponse({ sucesso: false, erro: 'Method Not Allowed' }, 405);
      if (!isBillingApiLive()) return jsonResponse({ sucesso: false, erro: 'Cobrança desativada.' }, 503);
      const body = await req.json().catch(() => ({}));
      const storeId = String(body.storeId || '').trim();
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      const v = validateBillingCustomer(body.customer || {});
      if (!v.ok) return jsonResponse({ sucesso: false, erro: v.error }, 400);
      return jsonResponse({ sucesso: true, ...(await runCheckout({ storeId, planSlug: body.planSlug, billingType: body.billingType, customer: v.customer })) }, 200);
    }

    if (action === 'ensure-trial') {
      if (req.method !== 'POST') return jsonResponse({ sucesso: false, erro: 'Method Not Allowed' }, 405);
      const body = await req.json().catch(() => ({}));
      const storeId = String(body.storeId || '').trim();
      if (!storeId) return jsonResponse({ sucesso: false, erro: 'storeId obrigatório' }, 400);
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      const row = await ensureTrialSubscription(storeId);
      return jsonResponse({ sucesso: true, storeId, status: row?.status || null }, 200);
    }
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: e.message }, 500);
  }
}
