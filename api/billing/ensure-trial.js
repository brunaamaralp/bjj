import { Client, Databases } from 'node-appwrite';
import { isBillingApiLive } from '../../lib/server/billingApiEnabled.js';
import { isBillingStoreConfigured } from '../../lib/billing/billingAppwriteStore.js';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from '../../lib/server/authAppwrite.js';
import { ensureTrialSubscription } from '../../lib/billing/ensureTrial.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

function json(res, status, obj) {
  res.status(status).json(obj);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
  }
  if (!isBillingApiLive()) {
    return json(res, 503, { sucesso: false, erro: 'Cobrança desativada (BILLING_ENABLED).' });
  }
  if (!isBillingStoreConfigured()) {
    return json(res, 503, {
      sucesso: false,
      erro: 'Billing indisponível: configure APPWRITE_BILLING_* no Appwrite.',
    });
  }
  if (!PROJECT_ID || !API_KEY || !DB_ID) {
    return json(res, 500, { sucesso: false, erro: 'Configuração Appwrite incompleta.' });
  }

  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json(res, 401, { sucesso: false, erro: 'JWT ausente' });
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) return json(res, 401, { sucesso: false, erro: 'JWT inválido' });

  const body = req.body || {};
  const storeId = String(body.storeId || '').trim();
  if (!storeId) {
    return json(res, 400, { sucesso: false, erro: 'storeId obrigatório' });
  }

  try {
    const me = await getAppwriteUserFromJwt(jwt);
    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);
    await assertAcademyOwnedByOwner(databases, storeId, me.$id);
    const row = await ensureTrialSubscription(storeId);
    return json(res, 200, { sucesso: true, storeId, status: row?.status || null });
  } catch (e) {
    if (e?.code === 'FORBIDDEN' || /forbidden/i.test(String(e?.message))) {
      return json(res, 403, { sucesso: false, erro: 'Sem permissão para esta academia.' });
    }
    console.error('[billing/ensure-trial]', e);
    return json(res, 500, { sucesso: false, erro: e.message || 'Erro interno' });
  }
}
