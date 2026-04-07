import { Client, Databases } from 'node-appwrite';
import { isBillingApiLive } from '../../lib/server/billingApiEnabled.js';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from '../../lib/server/authAppwrite.js';
import { evaluateBillingAccess } from '../../lib/billing/gate.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

function json(res, status, obj) {
  res.status(status).json(obj);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
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

  const storeId = String(req.query?.storeId || '').trim();
  if (!storeId) {
    return json(res, 400, { sucesso: false, erro: 'storeId obrigatório' });
  }

  try {
    const me = await getAppwriteUserFromJwt(jwt);
    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);
    await assertAcademyOwnedByOwner(databases, storeId, me.$id);

    if (!isBillingApiLive()) {
      return json(res, 200, {
        sucesso: true,
        accessLevel: 'full',
        status: 'preview',
        needsPlan: false,
        currentPeriodEnd: null,
      });
    }

    const access = await evaluateBillingAccess(storeId);
    return json(res, 200, { sucesso: true, ...access });
  } catch (e) {
    if (e?.code === 'FORBIDDEN' || /forbidden/i.test(String(e?.message))) {
      return json(res, 403, { sucesso: false, erro: 'Sem permissão para esta academia.' });
    }
    console.error('[billing/status]', e);
    return json(res, 500, { sucesso: false, erro: e.message || 'Erro interno' });
  }
}
