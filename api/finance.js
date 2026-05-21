/**
 * Hub financeiro (Vercel Hobby: uma função para tx, mensalidades, resumos, previsão e conciliação).
 * ?route=tx | student-payments | summary | closing | forecast
 * /api/bank-reconciliation → ?finance_hub=bank-reconciliation&route=list|detail|import|...
 */
import financeSummaryHandler from '../lib/server/financeSummaryHandler.js';
import financeClosingHandler from '../lib/server/financeClosingHandler.js';
import financeForecastHandler from '../lib/server/financeForecastHandler.js';
import financeTxHandler from '../lib/server/financeTxHandler.js';
import studentPaymentsHandler from '../lib/server/studentPaymentsHandler.js';
import bankReconciliationHandler from '../lib/server/bankReconciliationHandler.js';

export default async function handler(req, res) {
  const financeHub = String(req.query.finance_hub || '').trim();
  if (financeHub === 'bank-reconciliation' || financeHub === 'bank_reconciliation') {
    return bankReconciliationHandler(req, res);
  }

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
  if (route === 'forecast' || req.url?.includes('/forecast')) {
    return financeForecastHandler(req, res);
  }
  if (req.method === 'GET' && !route) {
    return financeSummaryHandler(req, res);
  }
  res.status(404).json({ ok: false, error: 'route_not_found' });
}
