import financeSummaryHandler from '../lib/server/financeSummaryHandler.js';
import financeClosingHandler from '../lib/server/financeClosingHandler.js';

export default async function handler(req, res) {
  const route = String(req.query.route || req.query.action || '').trim();
  if (route === 'summary' || req.url?.includes('/summary')) {
    return financeSummaryHandler(req, res);
  }
  if (route === 'closing' || req.url?.includes('/closing')) {
    return financeClosingHandler(req, res);
  }
  if (req.method === 'GET' && !route) {
    return financeSummaryHandler(req, res);
  }
  res.status(404).json({ ok: false, error: 'route_not_found' });
}
