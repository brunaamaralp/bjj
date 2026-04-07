import { Client, Databases } from 'node-appwrite';
import { isBillingApiLive } from '../../lib/server/billingApiEnabled.js';
import { isBillingStoreConfigured } from '../../lib/billing/billingAppwriteStore.js';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from '../../lib/server/authAppwrite.js';
import { validateBillingCustomer } from '../../lib/billing/validation.js';
import { runCheckout } from '../../lib/billing/runCheckout.js';

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
    return json(res, 503, { sucesso: false, erro: 'Cobrança desativada. Defina BILLING_ENABLED=true no servidor.' });
  }
  if (!isBillingStoreConfigured()) {
    return json(res, 503, {
      sucesso: false,
      erro: 'Billing indisponível: configure APPWRITE_BILLING_* (collections no Appwrite).',
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

  try {
    const me = await getAppwriteUserFromJwt(jwt);
    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);

    const body = req.body || {};
    const storeId = String(body.storeId || '').trim();
    await assertAcademyOwnedByOwner(databases, storeId, me.$id);

    const v = validateBillingCustomer(body.customer || {});
    if (!v.ok) {
      return json(res, 400, { sucesso: false, erro: v.error });
    }

    if (!process.env.ASAAS_API_KEY) {
      return json(res, 503, { sucesso: false, erro: 'ASAAS_API_KEY não configurada.' });
    }

    const result = await runCheckout({
      storeId,
      planSlug: body.planSlug,
      billingType: body.billingType,
      customer: v.customer,
    });

    return json(res, 200, {
      sucesso: true,
      paymentUrl: result.paymentUrl,
      reused: result.reused,
      idempotencyKey: result.idempotencyKey,
      subscriptionId: result.subscriptionId,
    });
  } catch (e) {
    const code = e?.code || e?.message;
    if (code === 'FORBIDDEN' || /forbidden/i.test(String(e?.message))) {
      return json(res, 403, { sucesso: false, erro: 'Sem permissão para esta academia.' });
    }
    if (code === 'TAX_IN_USE' || /CPF\/CNPJ já está vinculado/i.test(String(e?.message))) {
      return json(res, 409, { sucesso: false, erro: e.message });
    }
    if (code === 'BILLING_CONFIG') {
      return json(res, 503, { sucesso: false, erro: e.message });
    }
    if (code === 'VALIDATION') {
      return json(res, 400, { sucesso: false, erro: e.message });
    }
    if (e?.status === 400 || /asaas/i.test(String(e?.message))) {
      return json(res, 400, { sucesso: false, erro: e.message || 'Erro Asaas' });
    }
    console.error('[billing/checkout]', e);
    return json(res, 500, { sucesso: false, erro: e.message || 'Erro interno' });
  }
}
