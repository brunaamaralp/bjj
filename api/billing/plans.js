import { listPlansForDisplay } from '../../lib/billing/plans.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ sucesso: false, erro: 'Method Not Allowed' });
  }
  try {
    const plans = listPlansForDisplay();
    return res.status(200).json({ sucesso: true, plans });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
