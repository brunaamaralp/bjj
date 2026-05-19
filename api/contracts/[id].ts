import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGetContractById, jsonResponse } from '../../lib/contracts/contractHttp.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const id = Array.isArray((req as IncomingMessage & { query?: { id?: string | string[] } }).query?.id)
    ? String((req as IncomingMessage & { query?: { id?: string[] } }).query?.id?.[0])
    : String((req as IncomingMessage & { query?: { id?: string } }).query?.id || '');

  const response = await handleGetContractById(id);
  const body = await response.text();
  res.statusCode = response.status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
}
