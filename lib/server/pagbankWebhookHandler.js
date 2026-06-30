import { timingSafeEqual } from 'crypto';
import { ID, Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { getPagbankWebhookSecret } from './getPagbankCredentials.js';
import { mirrorStudentPaymentToFinancialTx } from './studentPaymentFinancialTxMirror.js';

const PAGBANK_WEBHOOK_LOGS_COL =
  process.env.APPWRITE_PAGBANK_WEBHOOK_LOGS_COLLECTION_ID || 'pagbank_webhook_logs';
const PAGBANK_SUBSCRIPTIONS_COL =
  process.env.APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID || 'pagbank_subscriptions';
const PAGBANK_PAYMENTS_COL = process.env.APPWRITE_PAGBANK_PAYMENTS_COLLECTION_ID || 'pagbank_payments';

function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function parseBody(req) {
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

function referenceMonthFromIso(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : '';
}

function mapOfficialEventType(event, resourceStatus) {
  const ev = String(event || '').trim().toLowerCase();
  const status = String(resourceStatus || '').trim().toUpperCase();
  if (ev === 'subscription.recurrence') {
    if (status === 'PAID' || status === 'ACTIVE') return 'subscription.payment.paid';
    if (status === 'DECLINED' || status === 'OVERDUE' || status === 'FAILED') {
      return 'subscription.payment.declined';
    }
    return 'subscription.recurrence';
  }
  if (ev === 'subscription.suspended') return 'subscription.suspended';
  if (ev === 'subscription.canceled' || ev === 'subscription.cancelled') return 'subscription.canceled';
  return event;
}

function extractWebhookFields(body) {
  if (body?.data?.subscription || body?.data?.payment) {
    const payment = body.data.payment || {};
    const amountRaw = payment.amount?.value ?? payment.amount ?? body.data.amount?.value ?? 0;
    return {
      eventId: String(body.id || '').trim(),
      eventType: String(body.type || body.event || '').trim(),
      subscriptionId: String(body.data.subscription?.id || '').trim(),
      paymentId: String(payment.id || '').trim(),
      amount: Number(amountRaw) || 0,
      paidAt: String(payment.paid_at || payment.paidAt || '').trim(),
      rawStatus: String(payment.status || body.data.status || '').trim(),
      declineReason: String(
        payment.decline_reason || payment.declineReason || payment.reason || ''
      ).trim(),
    };
  }

  const resource = body.resource || {};
  const eventType = mapOfficialEventType(body.event, resource.status);
  return {
    eventId: String(body.id || `${body.event || 'event'}:${resource.id || ''}:${resource.updated_at || ''}`).trim(),
    eventType,
    subscriptionId: String(resource.id || '').trim(),
    paymentId: String(resource.payment?.id || resource.invoice?.id || resource.id || '').trim(),
    amount: Number(resource.amount?.value ?? resource.amount ?? 0) || 0,
    paidAt: String(resource.paid_at || resource.updated_at || resource.created_at || '').trim(),
    rawStatus: String(resource.status || '').trim(),
    declineReason: String(resource.decline_reason || resource.reason || '').trim(),
  };
}

function pagbankWebhookToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return String(req.headers['x-pagbank-signature'] || req.headers['x-authenticity-token'] || '').trim() || bearer;
}

export function pagbankHeaders(academyDoc) {
  return {
    Authorization: `Bearer ${academyDoc.pagbank_token}`,
    'Content-Type': 'application/json',
  };
}

async function findProcessedLog(eventId) {
  if (!eventId) return null;
  try {
    const res = await databases.listDocuments(DB_ID, PAGBANK_WEBHOOK_LOGS_COL, [
      Query.equal('event_id', eventId),
      Query.equal('processed', true),
      Query.limit(1),
    ]);
    return res.documents?.[0] || null;
  } catch (e) {
    console.error('[pagbankWebhookHandler] findProcessedLog:', e?.message || e);
    return null;
  }
}

async function findSubscription(subscriptionId) {
  const res = await databases.listDocuments(DB_ID, PAGBANK_SUBSCRIPTIONS_COL, [
    Query.equal('subscription_id', subscriptionId),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function updateWebhookLog(logDocId, patch) {
  if (!logDocId) return;
  await databases.updateDocument(DB_ID, PAGBANK_WEBHOOK_LOGS_COL, logDocId, patch);
}

function centsToReais(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

export default async function pagbankWebhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const parsed = parseBody(req);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const body = parsed.body;

  const fields = extractWebhookFields(body);
  const { eventId, eventType, subscriptionId, paymentId, amount, paidAt, rawStatus, declineReason } =
    fields;

  if (!subscriptionId) {
    return res.status(200).json({ ok: true, warning: 'subscription_not_found' });
  }

  const subscription = await findSubscription(subscriptionId);
  if (!subscription) {
    return res.status(200).json({ ok: true, warning: 'subscription_not_found' });
  }

  const academyId = String(subscription.academy_id || '').trim();
  const studentId = String(subscription.student_id || '').trim();
  const webhookSecret = await getPagbankWebhookSecret(academyId);
  const provided = pagbankWebhookToken(req);

  if (!webhookSecret || !provided || !safeCompare(provided, webhookSecret)) {
    console.warn(`[pagbankWebhookHandler][unauthorized] academy: ${academyId}`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!eventId) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const processedLog = await findProcessedLog(eventId);
  if (processedLog) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  let logDocId = '';
  try {
    const logDoc = await databases.createDocument(DB_ID, PAGBANK_WEBHOOK_LOGS_COL, ID.unique(), {
      event_id: eventId,
      event_type: eventType || 'unknown',
      academy_id: academyId,
      payload: JSON.stringify(body),
      processed: false,
      received_at: new Date().toISOString(),
    });
    logDocId = logDoc.$id;
  } catch (e) {
    console.error('[pagbankWebhookHandler] create webhook log failed:', e?.message || e);
    return res.status(200).json({ ok: true, error: 'processing_failed' });
  }

  try {
    switch (eventType) {
      case 'subscription.payment.paid': {
        const referenceMonth = referenceMonthFromIso(paidAt);
        const amountReais = centsToReais(amount);
        let paymentDocId = '';

        try {
          const paymentDoc = await databases.createDocument(DB_ID, PAGBANK_PAYMENTS_COL, ID.unique(), {
            payment_id: paymentId || ID.unique(),
            subscription_id: subscriptionId,
            student_id: studentId,
            academy_id: academyId,
            amount,
            status: 'paid',
            reference_month: referenceMonth,
            paid_at: paidAt || new Date().toISOString(),
            webhook_event_id: eventId,
            created_at: new Date().toISOString(),
          });
          paymentDocId = paymentDoc.$id;
        } catch (e) {
          if (e?.code !== 409 && !String(e?.message || '').toLowerCase().includes('already')) {
            throw e;
          }
          const existing = await databases.listDocuments(DB_ID, PAGBANK_PAYMENTS_COL, [
            Query.equal('webhook_event_id', eventId),
            Query.limit(1),
          ]);
          paymentDocId = existing.documents?.[0]?.$id || '';
        }

        await databases.updateDocument(DB_ID, PAGBANK_SUBSCRIPTIONS_COL, subscription.$id, {
          status: 'active',
          last_payment_date: paidAt || new Date().toISOString(),
          last_payment_status: 'paid',
        });

        const mirrorResult = await mirrorStudentPaymentToFinancialTx({
          paymentDoc: {
            $id: paymentId || eventId,
            academy_id: academyId,
            lead_id: studentId,
            amount: amountReais,
            paid_amount: amountReais,
            status: 'paid',
            paid_at: paidAt || new Date().toISOString(),
            reference_month: referenceMonth,
            method: 'cartao_credito',
            payment_category: 'plan',
          },
          payload: {
            academy_id: academyId,
            lead_id: studentId,
            status: 'paid',
            paid_amount: amountReais,
            reference_month: referenceMonth,
            paid_at: paidAt || new Date().toISOString(),
            method: 'cartao_credito',
            payment_category: 'plan',
          },
          financeConfig: null,
          studentDoc: { $id: studentId },
          existingTxId: null,
        });

        if (paymentDocId && mirrorResult?.mirrorId) {
          await databases.updateDocument(DB_ID, PAGBANK_PAYMENTS_COL, paymentDocId, {
            financial_entry_id: mirrorResult.mirrorId,
          });
        }
        break;
      }

      case 'subscription.payment.declined': {
        await databases.createDocument(DB_ID, PAGBANK_PAYMENTS_COL, ID.unique(), {
          payment_id: paymentId || ID.unique(),
          subscription_id: subscriptionId,
          student_id: studentId,
          academy_id: academyId,
          amount,
          status: 'declined',
          reference_month: referenceMonthFromIso(paidAt),
          decline_reason: declineReason || rawStatus || 'declined',
          webhook_event_id: eventId,
          created_at: new Date().toISOString(),
        });

        await databases.updateDocument(DB_ID, PAGBANK_SUBSCRIPTIONS_COL, subscription.$id, {
          status: 'overdue',
          last_payment_status: 'declined',
        });
        break;
      }

      case 'subscription.suspended': {
        await databases.updateDocument(DB_ID, PAGBANK_SUBSCRIPTIONS_COL, subscription.$id, {
          status: 'suspended',
        });
        break;
      }

      case 'subscription.canceled':
      case 'subscription.cancelled': {
        await databases.updateDocument(DB_ID, PAGBANK_SUBSCRIPTIONS_COL, subscription.$id, {
          status: 'canceled',
          canceled_at: new Date().toISOString(),
        });
        break;
      }

      default: {
        console.warn('[pagbankWebhookHandler] unhandled_event_type', {
          eventId,
          eventType,
          rawStatus,
          academyId,
        });
        await updateWebhookLog(logDocId, {
          processed: false,
          error: 'unhandled_event_type',
        });
        return res.status(200).json({ ok: true, warning: 'unhandled_event_type' });
      }
    }

    await updateWebhookLog(logDocId, {
      processed: true,
      processed_at: new Date().toISOString(),
      error: '',
    });
  } catch (error) {
    console.error('[pagbankWebhookHandler]', error?.message || error, { academyId });
    try {
      await updateWebhookLog(logDocId, {
        processed: false,
        error: String(error?.message || error || 'processing_failed').slice(0, 2048),
      });
    } catch (logErr) {
      console.error('[pagbankWebhookHandler] failed to update log after error:', logErr?.message || logErr);
    }
    return res.status(200).json({ ok: true, error: 'processing_failed' });
  }

  return res.status(200).json({ ok: true });
}
