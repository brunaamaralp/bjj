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

function json(res, status, obj) { res.status(status).json(obj); }

export default async function handler(req, res) {
  const action = req.query.action || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);

  if (action === 'plans') {
    if (req.method !== 'GET') return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
    try { return json(res, 200, { sucesso: true, plans: listPlansForDisplay() }); } catch (e) { return json(res, 500, { sucesso: false, erro: e.message }); }
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID) return json(res, 500, { sucesso: false, erro: 'Configuração Appwrite incompleta.' });
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return json(res, 401, { sucesso: false, erro: 'JWT ausente' });
  const jwt = auth.slice(7).trim();
  if (!jwt) return json(res, 401, { sucesso: false, erro: 'JWT inválido' });

  try {
    const me = await getAppwriteUserFromJwt(jwt);
    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);

    if (action === 'status') {
      const storeId = String(req.query?.storeId || '').trim();
      if (!storeId) return json(res, 400, { sucesso: false, erro: 'storeId obrigatório' });
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      if (!isBillingApiLive()) return json(res, 200, { sucesso: true, accessLevel: 'full', status: 'preview', needsPlan: false });
      return json(res, 200, { sucesso: true, ...(await evaluateBillingAccess(storeId)) });
    }

    if (action === 'checkout') {
      if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
      if (!isBillingApiLive()) return json(res, 503, { sucesso: false, erro: 'Cobrança desativada.' });
      const storeId = String(req.body.storeId || '').trim();
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      const v = validateBillingCustomer(req.body.customer || {});
      if (!v.ok) return json(res, 400, { sucesso: false, erro: v.error });
      return json(res, 200, { sucesso: true, ...(await runCheckout({ storeId, planSlug: req.body.planSlug, billingType: req.body.billingType, customer: v.customer })) });
    }

    if (action === 'ensure-trial') {
      if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
      const storeId = String(req.body.storeId || '').trim();
      if (!storeId) return json(res, 400, { sucesso: false, erro: 'storeId obrigatório' });
      await assertAcademyOwnedByOwner(databases, storeId, me.$id);
      const row = await ensureTrialSubscription(storeId);
      return json(res, 200, { sucesso: true, storeId, status: row?.status || null });
    }
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: e.message });
  }
}
