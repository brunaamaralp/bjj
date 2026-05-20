import salesHistoryHandler from '../lib/server/salesHistoryHandler.js';
import salesCreateHandler from '../lib/server/salesCreateHandler.js';
import salesReconcileHandler from '../lib/server/salesReconcileHandler.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim();
  if (action === 'reconcile') return salesReconcileHandler(req, res);
  if (req.method === 'POST') return salesCreateHandler(req, res);
  if (req.method === 'GET') return salesHistoryHandler(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
