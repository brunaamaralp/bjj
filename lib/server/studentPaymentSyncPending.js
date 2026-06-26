import { databases, DB_ID } from './academyAccess.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

async function patchPaymentSyncField(paymentId, fields) {
  const id = String(paymentId || '').trim();
  if (!id || !PAYMENTS_COL) return;
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, id, fields);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
  }
}

export async function markFinancialTxSyncPending(paymentId) {
  await patchPaymentSyncField(paymentId, { financial_tx_sync_pending: true });
}

export async function clearFinancialTxSyncPending(paymentId) {
  await patchPaymentSyncField(paymentId, { financial_tx_sync_pending: false });
}
