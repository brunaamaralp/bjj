import { ensureAuth, ensureAcademyAccess, databases, DB_ID } from './academyAccess.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

/**
 * Cancela FINANCIAL_TX pendente (mesma validação multi-tenant que liquidação).
 */
export default async function cancelFinanceTxHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!FINANCIAL_TX_COL || !DB_ID) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }
  }

  const { transactionId } = body || {};
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId_required' });
  }

  let doc;
  try {
    doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, String(transactionId));
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('document_not_found') || msg.includes('not found')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('[cancelFinanceTxHandler] getDocument:', e);
    return res.status(500).json({ error: 'Erro ao cancelar' });
  }

  if (String(doc.academyId || '') !== String(academyId)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (doc.status === 'settled') {
    return res.status(400).json({ error: 'cannot_cancel_settled' });
  }
  if (doc.status === 'cancelled') {
    return res.status(400).json({ error: 'already_cancelled' });
  }

  try {
    await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, String(transactionId), {
      status: 'cancelled',
      settledAt: '',
    });
  } catch (e) {
    console.error('[cancelFinanceTxHandler] updateDocument:', e);
    return res.status(500).json({ error: 'Erro ao cancelar' });
  }

  return res.status(200).json({ success: true });
}
