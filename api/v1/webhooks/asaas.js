import { timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { isBillingApiLive } from '../../../lib/server/billingApiEnabled.js';
import { processAsaasWebhookPayload } from '../../../lib/billing/webhookHandlers.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const expected = String(process.env.ASAAS_WEBHOOK_SECRET || '').trim();
  if (!expected) {
    console.error('[asaas webhook] ASAAS_WEBHOOK_SECRET não configurado');
    return res.status(500).json({ ok: false, error: 'webhook_not_configured' });
  }

  const headerToken =
    String(req.headers['asaas-access-token'] || req.headers['x-asaas-access-token'] || '').trim();
  const qToken = String(req.query?.token || '').trim();
  const provided = headerToken || qToken;

  if (!safeCompare(provided, expected)) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'body_required' });
  }

  if (!isBillingApiLive()) {
    return res.status(200).json({ ok: true, received: true, billing_disabled: true });
  }

  waitUntil(
    (async () => {
      try {
        await processAsaasWebhookPayload(body);
      } catch (e) {
        console.error('[asaas webhook] process', e);
      }
    })()
  );

  return res.status(200).json({ ok: true, received: true });
}
