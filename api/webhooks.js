import { timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { isBillingApiLive } from '../lib/server/billingApiEnabled.js';
import { processAsaasWebhookPayload } from '../lib/billing/webhookHandlers.js';
import { processAutentiqueWebhook } from '../lib/contracts/autentiqueWebhookHandler.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function webhookProvider(req) {
  const q = String(req.query?.provider || req.query?.route || '').trim().toLowerCase();
  if (q === 'autentique' || q === 'asaas') return q;
  const url = String(req.url || '').toLowerCase();
  if (url.includes('autentique')) return 'autentique';
  if (url.includes('asaas')) return 'asaas';
  return '';
}

async function handleAsaas(req, res) {
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
  if (!body || typeof body === 'string') {
    try {
      const raw = body || (await readRawBody(req)).toString('utf8');
      body = raw ? JSON.parse(raw) : null;
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

async function handleAutentique(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const secret = String(process.env.AUTENTIQUE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.error('[autentique webhook] AUTENTIQUE_WEBHOOK_SECRET não configurado');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'webhook_not_configured' }));
    return;
  }

  let rawBuffer;
  try {
    rawBuffer = await readRawBody(req);
  } catch (e) {
    console.error('[autentique webhook] read body', e);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'invalid_body' }));
    return;
  }

  const rawBody = rawBuffer.toString('utf8');
  if (!rawBody) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'body_required' }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    return;
  }

  const signatureHeader = req.headers['x-autentique-signature'] || req.headers['X-Autentique-Signature'];

  try {
    const result = await processAutentiqueWebhook(rawBody, parsed, { signatureHeader });

    if (result.error === 'invalid_signature') {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'invalid_signature' }));
      return;
    }
    if (result.error === 'contract_store_not_configured') {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'contract_store_not_configured' }));
      return;
    }
    if (!result.ok) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, received: true, warning: result.error }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, received: true, contractId: result.contractId }));
  } catch (e) {
    console.error('[autentique webhook] process', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'processing_failed' }));
  }
}

export default async function handler(req, res) {
  const provider = webhookProvider(req);
  if (provider === 'asaas') return handleAsaas(req, res);
  if (provider === 'autentique') return handleAutentique(req, res);

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: 'webhook_provider_unknown' }));
}
