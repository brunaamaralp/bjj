/**
 * Gestão PagBank Recorrente (staff) — estorno de pagamento confirmado.
 * Futuro: suspender/cancelar assinatura via action adicional.
 *
 * API PagBank: POST /payments/{payment_id}/refunds
 * Docs: developer.pagbank.com.br/reference/criar-estorno-de-pagamento
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, databases, DB_ID } from './academyAccess.js';
import { getPagbankCredentials } from './getPagbankCredentials.js';
import { reverseSettledFinanceTx } from './financeTxReverse.js';

const PAYMENTS_COL =
  process.env.APPWRITE_PAGBANK_PAYMENTS_COLLECTION_ID || 'pagbank_payments';

const FINANCIAL_TX_COL =
  process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.FINANCIAL_TX_COL ||
  '';

const PAGBANK_API_URL = String(
  process.env.PAGBANK_SUBSCRIPTIONS_API_URL ||
    process.env.PAGBANK_API_URL ||
    'https://sandbox.api.assinaturas.pagseguro.com'
).replace(/\/$/, '');

const SUPPORTED_ACTIONS = new Set(['refund']);

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

export function validateManageBody(body) {
  const action = String(body?.action ?? '').trim().toLowerCase();
  if (!action) {
    return { error: 'missing_fields', fields: ['action', 'payment_id'] };
  }
  if (!SUPPORTED_ACTIONS.has(action)) {
    return { error: 'unsupported_action' };
  }

  const payment_id = String(body?.payment_id ?? '').trim();
  if (!payment_id) {
    return { error: 'missing_fields', fields: ['payment_id'] };
  }

  return { action, payment_id };
}

export function paymentRefundEligibilityError(paymentDoc) {
  const status = String(paymentDoc?.status || '').toLowerCase();
  if (status !== 'paid') {
    return { error: 'payment_not_refundable', current_status: paymentDoc?.status || status };
  }
  if (paymentDoc?.refunded_at) {
    return { error: 'already_refunded' };
  }
  return null;
}

async function findPagbankPayment(paymentId, academyId) {
  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('payment_id', paymentId),
    Query.equal('academy_id', academyId),
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
    console.error('[pagbankManageHandler] credentials_error academy:', academyId, msg);
    res.status(500).json({ error: 'credentials_error' });
    return null;
  }
}

export async function createPagbankRefund(token, paymentId, amountCents) {
  const url = `${PAGBANK_API_URL}/payments/${encodeURIComponent(paymentId)}/refunds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-idempotency-key': `refund-${paymentId}`.slice(0, 200),
    },
    body: JSON.stringify({
      amount: {
        value: Number(amountCents) || 0,
        currency: 'BRL',
      },
    }),
  });

  let errBody = {};
  if (!res.ok) {
    try {
      errBody = await res.json();
    } catch {
      errBody = {};
    }
  }

  return { ok: res.ok, status: res.status, errBody };
}

async function reverseFinancialEntryIfNeeded(paymentDoc, academyId, me) {
  const txId = String(paymentDoc?.financial_entry_id || '').trim();
  if (!txId || !FINANCIAL_TX_COL) return null;

  let txDoc;
  try {
    txDoc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, txId);
  } catch (e) {
    console.error(
      '[pagbankManageHandler] financial_entry_not_found',
      txId,
      e?.message || e
    );
    return null;
  }

  try {
    return await reverseSettledFinanceTx({
      prevDoc: txDoc,
      academyId,
      me,
      reason: `Estorno PagBank · ${String(paymentDoc.payment_id || '').slice(-8)}`,
    });
  } catch (e) {
    console.error(
      '[pagbankManageHandler] financial_reverse_failed',
      txId,
      e?.message || e
    );
    return null;
  }
}

export async function processRefundAction({ payment_id, academyId, me, token }) {
  const paymentDoc = await findPagbankPayment(payment_id, academyId);
  if (!paymentDoc) {
    return { status: 404, body: { error: 'payment_not_found' } };
  }

  const eligibility = paymentRefundEligibilityError(paymentDoc);
  if (eligibility) {
    const status = eligibility.error === 'already_refunded' ? 409 : 400;
    return { status, body: eligibility };
  }

  const refund = await createPagbankRefund(token, payment_id, paymentDoc.amount);

  if (!refund.ok) {
    console.error(
      '[pagbankManageHandler] refund failed',
      refund.status,
      'academy:',
      academyId,
      'payment:',
      payment_id
    );
    if (refund.status === 422) {
      return { status: 422, body: { error: 'refund_rejected', detail: refund.errBody } };
    }
    return { status: 502, body: { error: 'pagbank_unavailable' } };
  }

  const refundedAt = new Date().toISOString();
  await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentDoc.$id, {
    status: 'refunded',
    refunded_at: refundedAt,
  });

  await reverseFinancialEntryIfNeeded(paymentDoc, academyId, me);

  return {
    status: 200,
    body: { ok: true, payment_id, status: 'refunded' },
  };
}

export default async function pagbankManageHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!PAYMENTS_COL || !DB_ID) {
    return res.status(503).json({ error: 'server_misconfigured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const { academyId } = access;

  const parsed = parseJsonBody(req);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const validated = validateManageBody(parsed.body);
  if (validated.error === 'unsupported_action') {
    return res.status(400).json({ error: 'unsupported_action' });
  }
  if (validated.error === 'missing_fields') {
    return res.status(400).json({ error: validated.error, fields: validated.fields });
  }

  if (validated.action !== 'refund') {
    return res.status(400).json({ error: 'unsupported_action' });
  }

  const creds = await resolvePagbankCredentials(academyId, res);
  if (!creds) return;

  try {
    const out = await processRefundAction({
      payment_id: validated.payment_id,
      academyId,
      me,
      token: creds.token,
    });
    return res.status(out.status).json(out.body);
  } catch (e) {
    console.error('[pagbankManageHandler] unexpected error academy:', academyId, e?.message || e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
