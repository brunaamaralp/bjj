/**
 * Cancela lançamentos FINANCIAL_TX espelhados de um student_payment (principal + troco).
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';

function resolveFinancialTxCol() {
  return (
    process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
    process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
    process.env.FINANCIAL_TX_COL ||
    ''
  );
}

async function listMirrorTxsForPayment(paymentId, originType, limit = 10) {
  const col = resolveFinancialTxCol();
  const id = String(paymentId || '').trim();
  if (!col || !id) return [];
  try {
    const res = await databases.listDocuments(DB_ID, col, [
      Query.equal('origin_id', id),
      Query.equal('origin_type', originType),
      Query.limit(limit),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<{ cancelledIds: string[], errors: string[] }>}
 */
export async function cancelFinancialTxMirrorsForPayment(paymentId, { explicitTxId = '' } = {}) {
  const id = String(paymentId || '').trim();
  const col = resolveFinancialTxCol();
  if (!id || !col) return { cancelledIds: [], errors: [] };

  const ids = new Set();
  const explicit = String(explicitTxId || '').trim();
  if (explicit) ids.add(explicit);

  const [mainTxs, trocoTxs] = await Promise.all([
    listMirrorTxsForPayment(id, 'student_payment', 10),
    listMirrorTxsForPayment(id, 'student_payment_troco', 5),
  ]);
  for (const doc of [...mainTxs, ...trocoTxs]) {
    const txId = String(doc?.$id || '').trim();
    if (txId) ids.add(txId);
  }

  const cancelledIds = [];
  const errors = [];

  for (const txId of ids) {
    try {
      const doc = await databases.getDocument(DB_ID, col, txId);
      if (String(doc.status || '').toLowerCase() === 'cancelled') {
        cancelledIds.push(txId);
        continue;
      }
      await databases.updateDocument(DB_ID, col, txId, { status: 'cancelled' });
      cancelledIds.push(txId);
    } catch (e) {
      errors.push(`${txId}: ${String(e?.message || e)}`);
    }
  }

  return { cancelledIds, errors };
}
