import { ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL, FINANCE_TX_FN_ID, JOURNAL_COL } from './appwrite';
import { callFunction } from './executeFunction';
import { montarLancamento } from '../components/finance/montarLancamento.js';
import { useAccountingStore } from '../store/useAccountingStore';

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
      settledAt: new Date().toISOString()
    });
  } else {
    throw new Error('Coleção de transações financeiras não configurada.');
  }
}

/**
 * Espelha o pós-liquidação da aba Transações (contabilidade + journal).
 * @param {object} tx — linha da tabela (id, gross, fee, net, method, installments, type, planName, lead_id, note, …)
 * @param {string} academyId
 */
export function applySettleAccountingSideEffects(tx, academyId) {
  if (!tx || !academyId) return;
  const aid = String(academyId || '').trim();
  const { accounts: storeAccounts, addEntry: storeAddEntry } = useAccountingStore.getState();
  const lancamento = montarLancamento(tx, storeAccounts, aid);
  if (!lancamento) return;
  const localId = crypto.randomUUID();
  storeAddEntry({ ...lancamento, id: localId });
  if (!JOURNAL_COL) return;
  void (async () => {
    try {
      const journalDoc = await databases.createDocument(DB_ID, JOURNAL_COL, ID.unique(), {
        academyId: aid,
        date: lancamento.date,
        memo: lancamento.memo,
        lines: JSON.stringify(lancamento.lines),
      });
      const newId = String(journalDoc?.$id || '').trim();
      if (newId) {
        useAccountingStore.getState().updateEntryId(localId, newId);
      }
    } catch (err) {
      console.error('journal entry failed:', err);
    }
  })();
}
