import { ID } from 'appwrite';
import { databases, DB_ID, JOURNAL_COL } from './appwrite.js';
import { montarLancamento } from '../components/finance/montarLancamento.js';
import { useAccountingStore } from '../store/useAccountingStore.js';
import { defaultCategoryForTxType, normalizeFinanceCategory } from './financeCategories.js';

export function normalizeTxForJournal(tx) {
  if (!tx) return null;
  const type = String(tx.type || '').toLowerCase();
  return {
    ...tx,
    id: String(tx.id || tx.$id || '').trim(),
    type,
    category: normalizeFinanceCategory(tx.category || defaultCategoryForTxType(type)),
    gross: Math.abs(Number(tx.gross) || 0),
    fee: Math.abs(Number(tx.fee) || 0),
    net: Number.isFinite(Number(tx.net)) ? Number(tx.net) : undefined,
    settledAt: tx.settledAt || '',
    competence_month: tx.competence_month || '',
    planName: tx.planName || tx.note || '',
  };
}

export function journalMemoHasTxId(memo, txId) {
  const id = String(txId || '').trim();
  if (!id) return false;
  return String(memo || '').includes(`· ${id}`);
}

/**
 * Gera partida no razão local + Appwrite (não reverte FINANCIAL_TX em falha).
 */
export function applyAccountingSideEffectsAuto(tx, academyId) {
  const aid = String(academyId || '').trim();
  const row = normalizeTxForJournal(tx);
  if (!aid || !row?.id) return { ok: false, reason: 'invalid_tx' };
  if (String(row.status || '').toLowerCase() !== 'settled') {
    return { ok: false, reason: 'not_settled' };
  }

  const store = useAccountingStore.getState();
  if (store.academyId !== aid) store.loadByAcademy(aid);

  const { accounts, journal, addEntry } = useAccountingStore.getState();
  if (journal.some((e) => journalMemoHasTxId(e.memo, row.id))) {
    return { ok: true, skipped: true, reason: 'already_posted' };
  }

  const lancamento = montarLancamento(row, accounts, aid);
  if (!lancamento) {
    console.error(
      JSON.stringify({
        event: 'journal_auto_failed',
        tx_id: row.id,
        academy_id: aid,
        error: 'montar_lancamento_null',
      })
    );
    return { ok: false, reason: 'montar_lancamento_null' };
  }

  const localId = crypto.randomUUID();
  addEntry({ ...lancamento, id: localId });

  if (!JOURNAL_COL) return { ok: true, localOnly: true };

  void (async () => {
    try {
      const payload = {
        academyId: aid,
        date: lancamento.date,
        memo: lancamento.memo,
        lines: JSON.stringify(lancamento.lines),
      };
      if (lancamento.financial_tx_id) payload.financial_tx_id = lancamento.financial_tx_id;
      if (lancamento.competence_month) payload.competence_month = lancamento.competence_month;

      const journalDoc = await databases.createDocument(DB_ID, JOURNAL_COL, ID.unique(), payload);
      const newId = String(journalDoc?.$id || '').trim();
      if (newId) useAccountingStore.getState().updateEntryId(localId, newId);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'journal_auto_failed',
          tx_id: row.id,
          academy_id: aid,
          error: String(err?.message || err),
        })
      );
    }
  })();

  return { ok: true };
}
