import { journalMemoHasTxId } from './financeJournal.js';
import { montarLancamento } from '../components/finance/montarLancamento.js';
import { fmt } from '../components/finance/financeFmt.js';

/**
 * @typedef {'pending' | 'cancelled' | 'posted' | 'preview' | 'post_missing'} TxJournalMirrorState
 */

/**
 * @param {Array<{ id?: string, financial_tx_id?: string, memo?: string, lines?: object[] }>} entries
 * @param {string} txId
 */
export function findJournalEntryForTx(entries, txId) {
  const id = String(txId || '').trim();
  if (!id || !Array.isArray(entries)) return null;

  const byField = entries.find((e) => String(e.financial_tx_id || '').trim() === id);
  if (byField) return byField;

  return entries.find((e) => journalMemoHasTxId(e.memo, id)) || null;
}

/**
 * @param {Map<string, { code?: string, name?: string }>} accountById
 */
export function buildAccountById(accounts) {
  const m = new Map();
  (accounts || []).forEach((a) => {
    if (a?.id) m.set(a.id, a);
  });
  return m;
}

/**
 * @param {{ accountId?: string, debit?: number, credit?: number }} line
 * @param {Map<string, { code?: string, name?: string }>} accountById
 */
export function formatJournalLineDisplay(line, accountById) {
  const acc = accountById.get(line.accountId);
  const code = String(acc?.code || '').trim();
  const name = String(acc?.name || '').trim();
  const label = code && name ? `${code} ${name}` : code || name || 'Conta';
  const debit = Number(line.debit || 0);
  const credit = Number(line.credit || 0);
  const side = debit > 0 ? 'D' : 'C';
  const amount = debit > 0 ? debit : credit;
  return `${side} ${label} · ${fmt(amount)}`;
}

/**
 * Linhas estruturadas para mini-tabela no drawer (D/C, conta, valor).
 * @param {object[]} lines
 * @param {Map<string, { code?: string, name?: string }>} accountById
 */
export function buildJournalMirrorRows(lines, accountById) {
  if (!Array.isArray(lines) || !lines.length) return [];
  return lines.map((line) => {
    const acc = accountById.get(line.accountId);
    const accountCode = String(acc?.code || '').trim();
    const accountName = String(acc?.name || '').trim() || 'Conta';
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const side = debit > 0 ? 'debit' : 'credit';
    const amount = debit > 0 ? debit : credit;
    return {
      side,
      sideLabel: side === 'debit' ? 'D' : 'C',
      accountCode,
      accountName,
      amount,
      amountFormatted: fmt(amount),
    };
  });
}

function mirrorPayload(state, lines, accountById, extras = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  return {
    state,
    lines: safeLines,
    displayLines: safeLines.map((ln) => formatJournalLineDisplay(ln, accountById)),
    rows: buildJournalMirrorRows(safeLines, accountById),
    ...extras,
  };
}

/**
 * @param {object} params
 * @param {object} params.tx
 * @param {object[]} params.accounts
 * @param {object[]} [params.journalEntries]
 * @param {string} [params.academyId]
 * @returns {{ state: TxJournalMirrorState, lines: object[], memo?: string, displayLines?: string[], rows?: object[] }}
 */
export function resolveTxJournalMirror({ tx, accounts, journalEntries = [], academyId }) {
  const accountById = buildAccountById(accounts);

  if (!tx) {
    return mirrorPayload('post_missing', [], accountById);
  }

  const status = String(tx.status || '').toLowerCase();
  const txId = String(tx.id || tx.$id || '').trim();

  if (status === 'cancelled') {
    return mirrorPayload('cancelled', [], accountById);
  }

  if (status === 'pending') {
    return mirrorPayload('pending', [], accountById);
  }

  if (status !== 'settled') {
    return mirrorPayload('post_missing', [], accountById);
  }

  const posted = findJournalEntryForTx(journalEntries, txId);
  if (posted?.lines?.length) {
    return mirrorPayload('posted', posted.lines, accountById, { memo: posted.memo || '' });
  }

  const aid = String(academyId || tx.academyId || '').trim();
  const preview = montarLancamento(tx, accounts, aid);
  if (preview?.lines?.length) {
    return mirrorPayload('preview', preview.lines, accountById, { memo: preview.memo || '' });
  }

  return mirrorPayload('post_missing', [], accountById);
}

/** Mensagem de status para o drawer conforme state. */
export function txJournalMirrorStatusMessage(state) {
  switch (state) {
    case 'pending':
      return 'Será contabilizado ao liquidar.';
    case 'cancelled':
      return 'Não contabilizado.';
    case 'preview':
      return 'Previsto (ainda não gravado no razão).';
    case 'post_missing':
      return 'Espelho contábil indisponível. Verifique o plano de contas ou abra o razão.';
    default:
      return '';
  }
}

/**
 * Mapeia documento Appwrite JOURNAL_COL para entrada local.
 * @param {object} doc
 */
export function mapJournalDoc(doc) {
  if (!doc) return null;
  let lines = [];
  try {
    lines = JSON.parse(doc.lines || '[]');
  } catch {
    lines = [];
  }
  return {
    id: doc.$id,
    date: doc.date,
    memo: doc.memo || '',
    financial_tx_id: doc.financial_tx_id || '',
    lines,
  };
}
