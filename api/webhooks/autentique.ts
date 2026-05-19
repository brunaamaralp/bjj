import type { IncomingMessage, ServerResponse } from 'node:http';
import { processAutentiqueWebhook } from '../../lib/contracts/autentiqueWebhookHandler.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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

  let rawBuffer: Buffer;
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

  let parsed: { event?: { id?: string; type?: string; data?: Record<string, unknown> } };
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
