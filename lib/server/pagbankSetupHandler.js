/**
 * Setup administrativo PagBank — conecta token da academia, cria planos na API e espelha em pagbank_plans.
 *
 * pagbank_public_key não é salvo aqui: o encrypt busca a chave pública via endpoint PagBank quando necessário.
 *
 * Após setup, configurar no painel PagBank:
 * - webhook_url (retornado na resposta)
 * - webhook_secret (retornado na resposta)
 *
 * API PagBank: POST /plans, GET /plans?limit=1 (validação de token)
 * Docs: developer.pagbank.com.br/reference/criar-plano
 */
import crypto from 'node:crypto';
import { ID, Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  invalidateAcademyAccessCache,
  databases,
  DB_ID,
  ACADEMIES_COL,
} from './academyAccess.js';

const PLANS_COL =
  process.env.PAGBANK_PLANS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_PLANS_COLLECTION_ID ||
  'pagbank_plans';

const PAGBANK_API_URL = String(
  process.env.PAGBANK_SUBSCRIPTIONS_API_URL ||
    process.env.PAGBANK_API_URL ||
    'https://sandbox.api.assinaturas.pagseguro.com'
).replace(/\/$/, '');

export const FREQ_MAP = {
  monthly: { unit: 'MONTH', length: 1 },
  quarterly: { unit: 'MONTH', length: 3 },
  semiannual: { unit: 'MONTH', length: 6 },
  annual: { unit: 'YEAR', length: 1 },
};

const MODALITIES = new Set(['adulto', 'kids', 'familia', 'outro']);
const FREQUENCIES = new Set(Object.keys(FREQ_MAP));
const MAX_PLANS = 20;

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_json' };
  }
  return { body };
}

export function validateSetupBody(body) {
  const pagbank_token = String(body?.pagbank_token ?? '').trim();
  if (!pagbank_token) {
    return { error: 'invalid_payload', detail: 'pagbank_token is required' };
  }

  const plans = body?.plans;
  if (!Array.isArray(plans) || plans.length === 0) {
    return { error: 'invalid_payload', detail: 'plans must be a non-empty array' };
  }
  if (plans.length > MAX_PLANS) {
    return { error: 'invalid_payload', detail: `plans exceeds maximum of ${MAX_PLANS}` };
  }

  const seenKeys = new Set();
  const normalizedPlans = [];

  for (let i = 0; i < plans.length; i++) {
    const raw = plans[i];
    if (!raw || typeof raw !== 'object') {
      return { error: 'invalid_payload', detail: `plans[${i}] must be an object` };
    }

    const internal_key = String(raw.internal_key ?? '').trim();
    const name = String(raw.name ?? '').trim();
    const amount = Number.parseInt(String(raw.amount ?? ''), 10);
    const frequency = String(raw.frequency ?? '').trim();
    const modalityRaw = String(raw.modality ?? 'outro').trim();

    if (!internal_key || !name) {
      return { error: 'invalid_payload', detail: `plans[${i}] missing internal_key or name` };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'invalid_payload', detail: `plans[${i}] amount must be a positive integer` };
    }
    if (!FREQUENCIES.has(frequency)) {
      return { error: 'invalid_payload', detail: `plans[${i}] invalid frequency` };
    }
    if (seenKeys.has(internal_key)) {
      return { error: 'invalid_payload', detail: `duplicate internal_key: ${internal_key}` };
    }
    seenKeys.add(internal_key);

    normalizedPlans.push({
      internal_key,
      name,
      amount,
      frequency,
      modality: MODALITIES.has(modalityRaw) ? modalityRaw : 'outro',
    });
  }

  const pagbank_webhook_secret = body?.pagbank_webhook_secret
    ? String(body.pagbank_webhook_secret).trim()
    : '';

  return {
    pagbank_token,
    pagbank_webhook_secret,
    plans: normalizedPlans,
  };
}

export function buildPagbankPlanPayload(plan) {
  return {
    reference_id: plan.internal_key,
    name: plan.name,
    description: plan.name,
    amount: { value: plan.amount, currency: 'BRL' },
    interval: FREQ_MAP[plan.frequency],
    trial: null,
    payment_method: { type: 'CREDIT_CARD' },
  };
}

export function buildSetupIdempotencyKey(academyId, internalKey) {
  return `setup-${academyId}-${internalKey}`.slice(0, 200);
}

async function parseFetchJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function validatePagbankToken(pagbankToken) {
  const response = await fetch(`${PAGBANK_API_URL}/plans?limit=1`, {
    headers: { Authorization: `Bearer ${pagbankToken}` },
  });

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'invalid_pagbank_token' };
  }
  if (response.ok || response.status === 404) {
    return { ok: true };
  }
  return { ok: false, error: 'pagbank_unavailable' };
}

export async function findPagbankPlanByReference(pagbankToken, referenceId) {
  const url = `${PAGBANK_API_URL}/plans?reference_id=${encodeURIComponent(referenceId)}&limit=1`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${pagbankToken}` },
  });
  if (!response.ok) return null;
  const data = await parseFetchJson(response);
  const plan = data?.plans?.[0] || data?.results?.[0] || (Array.isArray(data) ? data[0] : null);
  const planId = String(plan?.id || '').trim();
  return planId || null;
}

export async function createPagbankPlan(pagbankToken, academyId, plan) {
  const response = await fetch(`${PAGBANK_API_URL}/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pagbankToken}`,
      'Content-Type': 'application/json',
      'x-idempotency-key': buildSetupIdempotencyKey(academyId, plan.internal_key),
    },
    body: JSON.stringify(buildPagbankPlanPayload(plan)),
  });

  const data = await parseFetchJson(response);

  if (response.ok) {
    const plan_id = String(data?.id || '').trim();
    if (!plan_id) {
      return { internal_key: plan.internal_key, status: 'failed', error: 'missing_plan_id' };
    }
    return { internal_key: plan.internal_key, status: 'created', plan_id };
  }

  if (response.status === 409) {
    let plan_id = String(data?.id || data?.plan?.id || '').trim();
    if (!plan_id) {
      plan_id = (await findPagbankPlanByReference(pagbankToken, plan.internal_key)) || '';
    }
    if (plan_id) {
      return { internal_key: plan.internal_key, status: 'existing', plan_id };
    }
    return { internal_key: plan.internal_key, status: 'existing', error: 'plan_id_not_found' };
  }

  return {
    internal_key: plan.internal_key,
    status: 'failed',
    error: String(response.status),
  };
}

async function findLocalPlan(internalKey, academyId) {
  const res = await databases.listDocuments(DB_ID, PLANS_COL, [
    Query.equal('internal_key', internalKey),
    Query.equal('academy_id', academyId),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function upsertLocalPlan(academyId, plan, planId) {
  const payload = {
    plan_id: planId,
    internal_key: plan.internal_key,
    name: plan.name,
    modality: plan.modality || 'outro',
    frequency: plan.frequency,
    amount: plan.amount,
    active: true,
    academy_id: academyId,
    created_at: new Date().toISOString(),
  };

  const existing = await findLocalPlan(plan.internal_key, academyId);
  if (existing) {
    await databases.updateDocument(DB_ID, PLANS_COL, existing.$id, {
      plan_id: planId,
      name: plan.name,
      modality: payload.modality,
      frequency: plan.frequency,
      amount: plan.amount,
      active: true,
    });
    return existing.$id;
  }

  await databases.createDocument(DB_ID, PLANS_COL, ID.unique(), payload);
  return null;
}

export default async function pagbankSetupHandler(req, res) {
  let academyId = '';

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (!PLANS_COL || !ACADEMIES_COL || !DB_ID) {
      return res.status(503).json({ error: 'server_misconfigured' });
    }

    const me = await ensureAuth(req, res);
    if (!me) return;

    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;

    const { doc: academyDoc } = access;
    academyId = access.academyId;

    const isAdmin = await isAcademyOwnerOrAdminUser(academyDoc, me);
    if (!isAdmin) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const parsed = parseJsonBody(req);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const validated = validateSetupBody(parsed.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error, detail: validated.detail });
    }

    const tokenCheck = await validatePagbankToken(validated.pagbank_token);
    if (!tokenCheck.ok) {
      if (tokenCheck.error === 'invalid_pagbank_token') {
        console.error('[pagbankSetupHandler] invalid token academy:', academyId, 'status: 401/403');
        return res.status(422).json({ error: 'invalid_pagbank_token' });
      }
      console.error('[pagbankSetupHandler] token validation failed academy:', academyId);
      return res.status(502).json({ error: 'pagbank_unavailable' });
    }

    const results = [];
    for (const plan of validated.plans) {
      const result = await createPagbankPlan(validated.pagbank_token, academyId, plan);
      results.push(result);

      if ((result.status === 'created' || result.status === 'existing') && result.plan_id) {
        try {
          await upsertLocalPlan(academyId, plan, result.plan_id);
        } catch (e) {
          console.error(
            '[pagbankSetupHandler] appwrite_plan_upsert_failed academy:',
            academyId,
            plan.internal_key,
            e?.message || e
          );
        }
      }
    }

    const webhookSecret =
      validated.pagbank_webhook_secret || crypto.randomUUID();

    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyDoc.$id, {
      pagbank_token: validated.pagbank_token,
      pagbank_webhook_secret: webhookSecret,
      pagbank_enabled: true,
    });
    invalidateAcademyAccessCache(academyId);

    const webhookBase = String(process.env.VITE_APP_URL || process.env.VERCEL_URL || '').replace(/\/$/, '');
    const webhook_url = webhookBase ? `${webhookBase}/api/pagbank-webhook` : '/api/pagbank-webhook';

    return res.status(200).json({
      ok: true,
      pagbank_enabled: true,
      webhook_secret: webhookSecret,
      webhook_url,
      plans: results,
      summary: {
        total: validated.plans.length,
        created: results.filter((r) => r.status === 'created').length,
        existing: results.filter((r) => r.status === 'existing').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
    });
  } catch (e) {
    console.error('[pagbankSetupHandler] unhandled:', e?.message || e, 'academy:', academyId);
    return res.status(500).json({ error: 'internal_error' });
  }
}
