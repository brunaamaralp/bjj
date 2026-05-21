import { databases, DB_ID, FINANCIAL_TX_COL, FINANCE_TX_FN_ID } from './appwrite';
import { callFunction } from './executeFunction';

/**
 * Atualiza documento FINANCIAL_TX como liquidado (função server ou SDK).
 * @param {string} id
 */
export async function settleFinancialTransactionById(id) {
  const tid = String(id || '').trim();
  if (!tid) throw new Error('Transação inválida');
  if (FINANCE_TX_FN_ID) {
    await callFunction(FINANCE_TX_FN_ID, { action: 'settle', id: tid });
  } else if (FINANCIAL_TX_COL) {
    await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tid, {
      status: 'settled',
      settledAt: new Date().toISOString(),
    });
  } else {
    throw new Error('Coleção de transações financeiras não configurada.');
  }
}
