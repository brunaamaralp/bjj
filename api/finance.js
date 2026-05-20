/**
 * Hub financeiro (Vercel Hobby: uma função para tx, mensalidades e resumos).
 * ?route=tx | student-payments | summary | closing
 */
import financeSummaryHandler from '../lib/server/financeSummaryHandler.js';
import financeClosingHandler from '../lib/server/financeClosingHandler.js';
import financeTxHandler from '../lib/server/financeTxHandler.js';
import studentPaymentsHandler from '../lib/server/studentPaymentsHandler.js';

export default async function handler(req, res) {
  const route = String(req.query.route || req.query.action || '').trim();

  if (route === 'student-payments') {
    return studentPaymentsHandler(req, res);
  }
  if (route === 'tx' || route === 'finance-tx') {
    return financeTxHandler(req, res);
  }
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
