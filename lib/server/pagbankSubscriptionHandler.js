/**
 * Fluxo PWA onboarding:
 * 1. POST pagbank-encrypt       → { encrypted_card }
 * 2. POST pagbank-subscriber    → { subscriber_id, card_last4, card_brand }
 * 3. POST pagbank-subscription  → { subscription_id, status, next_billing_date }
 *
 * A partir daqui o PagBank cobra automaticamente e notifica via:
 * POST /api/pagbank-webhook → pagbankWebhookHandler
 *
 * API PagBank: POST /subscriptions (docs developer.pagbank.com.br/reference/criar-assinatura)
 * Payload usa `customer.id` (CUST_...) — não `subscriber`.
 * Próxima cobrança: campo `next_invoice_at` na resposta.
 */
import { ID, Query } from 'node-appwrite';
import { getPagbankCredentials } from './getPagbankCredentials.js';
import { databases, DB_ID } from './academyAccess.js';
import { resolvePagbankRequestAuth } from './pagbankRequestAuth.js';

const SUBSCRIPTIONS_COL =
  process.env.PAGBANK_SUBSCRIPTIONS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  process.env.APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  'pagbank_subscriptions';

const PLANS_COL =
  process.env.PAGBANK_PLANS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_PLANS_COLLECTION_ID ||
  'pagbank_plans';

const PAGBANK_API_URL = String(
  process.env.PAGBANK_SUBSCRIPTIONS_API_URL ||
    process.env.PAGBANK_API_URL ||
    'https://sandbox.api.assinaturas.pagseguro.com'
).replace(/\/$/, '');

export const STATUS_MAP = {
  ACTIVE: 'active',
  TRIAL: 'active',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
  CANCELED: 'canceled',
  CANCELLED: 'canceled',
  OVERDUE: 'overdue',
};

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

export function validateSubscriptionBody(body) {
  const missing = [];
  const subscriber_id = String(body?.subscriber_id ?? '').trim();
  const plan_internal_key = String(body?.plan_internal_key ?? '').trim();
  const student_id = String(body?.student_id ?? '').trim();
  const reference_id = String(body?.reference_id ?? '').trim();

  if (!subscriber_id) missing.push('subscriber_id');
  if (!plan_internal_key) missing.push('plan_internal_key');
  if (!student_id) missing.push('student_id');
  if (!reference_id) missing.push('reference_id');

  if (missing.length) {
    return { error: 'missing_fields', fields: missing };
  }

  const trialRaw = body?.trial_days;
  let trial_days = null;
  if (trialRaw !== undefined && trialRaw !== null && trialRaw !== '') {
    trial_days = Number.parseInt(String(trialRaw), 10);
    if (!Number.isFinite(trial_days) || trial_days < 0) {
      return { error: 'missing_fields', fields: ['trial_days'] };
    }
  }

  const coupon_id = body?.coupon_id ? String(body.coupon_id).trim() : '';

  return {
    subscriber_id,
    plan_internal_key,
    student_id,
    reference_id,
    trial_days,
    coupon_id,
  };
}

/** PagBank espera `customer.id`, não `subscriber`. */
export function buildPagbankSubscriptionPayload(data) {
  const payload = {
    reference_id: data.reference_id,
    plan: { id: data.pagbank_plan_id },
    customer: { id: data.subscriber_id },
  };

  if (data.trial_days != null && data.trial_days > 0) {
    payload.trial = { days: data.trial_days };
  }
  if (data.coupon_id) {
    payload.coupon = { id: data.coupon_id };
  }

  return payload;
}

export function mapPagbankStatus(status) {
  const key = String(status || '').trim().toUpperCase();
  return STATUS_MAP[key] || 'pending';
}

export function buildSubscriptionIdempotencyKey(academyId, studentId, planInternalKey) {
  return `${academyId}-${studentId}-${planInternalKey}`.slice(0, 200);
}

async function findActiveSubscription(studentId, academyId) {
  const res = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COL, [
    Query.equal('student_id', studentId),
    Query.equal('academy_id', academyId),
    Query.notEqual('status', 'canceled'),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function findPlan(planInternalKey, academyId) {
  const res = await databases.listDocuments(DB_ID, PLANS_COL, [
    Query.equal('internal_key', planInternalKey),
    Query.equal('academy_id', academyId),
    Query.equal('active', true),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function findSubscriptionByPagbankId(subscriptionId) {
  const res = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COL, [
    Query.equal('subscription_id', subscriptionId),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function resolvePagbankCredentials(academyId, res) {
  try {
    return await getPagbankCredentials(academyId);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === 'pagbank_not_enabled') {
      res.status(403).json({ error: 'pagbank_not_enabled' });
      return null;
    }
    if (msg === 'pagbank_token_missing') {
      res.status(503).json({ error: 'pagbank_not_configured' });
      return null;
    }
    console.error('[pagbankSubscriptionHandler] credentials_error academy:', academyId, msg);
    res.status(500).json({ error: 'credentials_error' });
    return null;
  }
}

function normalizeNextBillingDate(pagbankData) {
  const raw =
    pagbankData?.next_invoice_at ||
    pagbankData?.next_billing_date ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString();
}

export default async function pagbankSubscriptionHandler(req, res) {
  let academyId = '';

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (!SUBSCRIPTIONS_COL || !PLANS_COL || !DB_ID) {
      return res.status(503).json({ error: 'server_misconfigured' });
    }

    const auth = await resolvePagbankRequestAuth(req, res);
    if (!auth) return;
    academyId = auth.academyId;
    const { studentContext } = auth;

    const parsed = parseJsonBody(req);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const mergedBody = { ...(parsed.body || {}) };
    if (studentContext) {
      mergedBody.plan_internal_key =
        mergedBody.plan_internal_key || studentContext.plan_internal_key || '';
      mergedBody.student_id = mergedBody.student_id || studentContext.student_id || '';
      mergedBody.reference_id =
        mergedBody.reference_id ||
        `NAVE_${academyId}_${mergedBody.student_id || studentContext.student_id || ''}`;
    }

    const validated = validateSubscriptionBody(mergedBody);
    if (validated.error === 'missing_fields') {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }

    const existing = await findActiveSubscription(validated.student_id, academyId);
    if (existing) {
      return res.status(200).json({
        ok: true,
        subscription_id: existing.subscription_id,
        existing: true,
        status: existing.status,
        next_billing_date: existing.next_billing_date || null,
        plan: existing.plan_id,
      });
    }

    const planDoc = await findPlan(validated.plan_internal_key, academyId);
    if (!planDoc) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const pagbankPlanId = String(planDoc.plan_id || '').trim();
    if (!pagbankPlanId) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const creds = await resolvePagbankCredentials(academyId, res);
    if (!creds) return;

    const pagbankPayload = buildPagbankSubscriptionPayload({
      ...validated,
      pagbank_plan_id: pagbankPlanId,
    });

    const idempotencyKey = buildSubscriptionIdempotencyKey(
      academyId,
      validated.student_id,
      validated.plan_internal_key
    );

    const response = await fetch(`${PAGBANK_API_URL}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(pagbankPayload),
    });

    const responseText = await response.text();
    let errBody = null;
    let pagbankData = null;
    try {
      const parsedResponse = responseText ? JSON.parse(responseText) : null;
      if (response.ok) {
        pagbankData = parsedResponse;
      } else {
        errBody = parsedResponse;
      }
    } catch {
      if (!response.ok) errBody = { raw: responseText };
    }

    if (!response.ok) {
      console.error(
        `[pagbankSubscriptionHandler] PagBank error ${response.status} academy: ${academyId}`
      );
      if (response.status === 422) {
        return res.status(422).json({ error: 'pagbank_validation_error', detail: errBody });
      }
      if (response.status === 404) {
        return res.status(404).json({ error: 'pagbank_plan_or_subscriber_not_found' });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(503).json({ error: 'pagbank_auth_error' });
      }
      return res.status(502).json({ error: 'pagbank_unavailable' });
    }

    const subscription_id = String(pagbankData?.id || '').trim();
    if (!subscription_id) {
      return res.status(502).json({ error: 'pagbank_invalid_response' });
    }

    const internalStatus = mapPagbankStatus(pagbankData?.status);
    const next_billing_date = normalizeNextBillingDate(pagbankData);

    try {
      await databases.createDocument(DB_ID, SUBSCRIPTIONS_COL, ID.unique(), {
        subscription_id,
        subscriber_id: validated.subscriber_id,
        plan_id: validated.plan_internal_key,
        student_id: validated.student_id,
        academy_id: academyId,
        status: internalStatus,
        next_billing_date,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      if (e?.code === 409 || String(e?.message || '').toLowerCase().includes('already')) {
        const dup =
          (await findSubscriptionByPagbankId(subscription_id)) ||
          (await findActiveSubscription(validated.student_id, academyId));
        if (dup) {
          return res.status(201).json({
            ok: true,
            subscription_id: dup.subscription_id,
            status: dup.status || internalStatus,
            next_billing_date: dup.next_billing_date || next_billing_date,
            plan: dup.plan_id || validated.plan_internal_key,
          });
        }
      }
      console.error(
        '[pagbankSubscriptionHandler] appwrite_create_failed academy:',
        academyId,
        e?.message || e
      );
      return res.status(500).json({ error: 'persist_failed' });
    }

    return res.status(201).json({
      ok: true,
      subscription_id,
      status: internalStatus,
      next_billing_date,
      plan: validated.plan_internal_key,
    });
  } catch (e) {
    console.error(
      '[pagbankSubscriptionHandler] unhandled:',
      e?.message || e,
      'academy:',
      academyId
    );
    return res.status(500).json({ error: 'internal_error' });
  }
}
