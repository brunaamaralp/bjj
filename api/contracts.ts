import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGetContracts, handlePostContract, jsonResponse } from '../lib/contracts/contractHttp.js';

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

async function responseToVercel(res: ServerResponse, response: Response) {
  const body = await response.text();
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(body);
}

async function incomingToFormData(req: IncomingMessage): Promise<FormData> {
  const raw = await readRawBody(req);
  const host = req.headers.host || 'localhost';
  const url = `https://${host}${req.url || '/api/contracts'}`;
  return new Request(url, {
    method: 'POST',
    headers: req.headers as HeadersInit,
    body: raw,
  }).formData();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    const url = new URL(req.url || '/api/contracts', `https://${req.headers.host || 'localhost'}`);
    return responseToVercel(res, await handleGetContracts(url.searchParams));
  }

  if (req.method === 'POST') {
    try {
      const formData = await incomingToFormData(req);
      return responseToVercel(res, await handlePostContract(formData));
    } catch (err) {
      console.error('[api/contracts POST]', err);
      const message = err instanceof Error ? err.message : String(err);
      return responseToVercel(res, jsonResponse({ ok: false, error: message }, 500));
    }
  }

  return responseToVercel(res, jsonResponse({ ok: false, error: 'method_not_allowed' }, 405));
}
