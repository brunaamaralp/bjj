/**
 * Diário contábil server-side (espelhos automáticos no backend).
 */
import { Query, ID } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { montarLancamento, resolveLedgerRouteKey } from '../../src/components/finance/montarLancamento.js';
import {
  defaultCategoryForTxType,
  normalizeFinanceCategory,
} from '../../src/lib/financeCategories.js';

const JOURNAL_COL =
  process.env.VITE_APPWRITE_JOURNAL_COLLECTION_ID ||
  process.env.APPWRITE_JOURNAL_COLLECTION_ID ||
  '';

const ACCOUNTS_COL =
  process.env.VITE_APPWRITE_ACCOUNTS_COLLECTION_ID ||
  process.env.APPWRITE_ACCOUNTS_COLLECTION_ID ||
  '';

const DEFAULT_ACCOUNTS = [
  { code: '1.1.1', name: 'Caixa', type: 'ativo', nature: 'devedora', dreGrupo: '', cash: true },
  { code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora', dreGrupo: 'Receita Bruta', cash: false },
  { code: '4.9.1', name: 'Deduções/Impostos s/ Vendas', type: 'receita', nature: 'devedora', dreGrupo: 'Deduções', cash: false },
  { code: '5.1.1', name: 'CMV/CPV', type: 'custo', nature: 'devedora', dreGrupo: 'CMV/CPV', cash: false },
  { code: '6.2.1', name: 'Despesas Gerais e Adm', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais', cash: false },
  { code: '7.1.1', name: 'Despesas Financeiras', type: 'despesa', nature: 'devedora', dreGrupo: 'Resultado Financeiro', cash: true },
];

async function loadAccounts(academyId) {
  if (!ACCOUNTS_COL) {
    return DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: `seed-${i}` }));
  }
  try {
    const res = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
      Query.equal('academyId', academyId),
      Query.limit(200),
    ]);
    const docs = res.documents || [];
    if (docs.length === 0) {
      return DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: `seed-${i}` }));
    }
    return docs.map((d) => ({
      id: d.$id,
      code: d.code,
      name: d.name,
      type: d.type,
      nature: d.nature,
      dreGrupo: d.dreGrupo || '',
      cash: Boolean(d.cash),
    }));
  } catch {
    return DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: `seed-${i}` }));
  }
}

async function journalExistsForTx(academyId, txId) {
  if (!JOURNAL_COL || !txId) return false;
  try {
    const res = await databases.listDocuments(DB_ID, JOURNAL_COL, [
      Query.equal('academyId', academyId),
      Query.limit(5),
    ]);
    const needle = `· ${txId}`;
    return (res.documents || []).some((d) => String(d.memo || '').includes(needle));
  } catch {
    return false;
  }
}

function normalizeTx(tx) {
  const type = String(tx?.type || '').toLowerCase();
  return {
    ...tx,
    id: String(tx.id || tx.$id || '').trim(),
    type,
    category: normalizeFinanceCategory(tx.category || defaultCategoryForTxType(type)),
    gross: Math.abs(Number(tx.gross) || 0),
    fee: Math.abs(Number(tx.fee) || 0),
    status: String(tx.status || 'settled').toLowerCase(),
    settledAt: tx.settledAt || '',
    competence_month: tx.competence_month || '',
    planName: tx.planName || tx.note || '',
    route: resolveLedgerRouteKey({ ...tx, type, category: tx.category }),
  };
}

export async function applyAccountingSideEffectsAutoServer(tx, academyId) {
  const aid = String(academyId || '').trim();
  const row = normalizeTx(tx);
  if (!aid || !row.id || row.status !== 'settled') {
    return { ok: false, reason: 'invalid_tx' };
  }
  if (!JOURNAL_COL) {
    return { ok: false, reason: 'journal_not_configured' };
  }

  if (await journalExistsForTx(aid, row.id)) {
    return { ok: true, skipped: true };
  }

  const accounts = await loadAccounts(aid);
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

  try {
    const payload = {
      academyId: aid,
      date: lancamento.date,
      memo: lancamento.memo,
      lines: JSON.stringify(lancamento.lines),
      financial_tx_id: row.id,
    };
    if (lancamento.competence_month) payload.competence_month = lancamento.competence_month;
    await databases.createDocument(DB_ID, JOURNAL_COL, ID.unique(), payload);
    return { ok: true };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'journal_auto_failed',
        tx_id: row.id,
        academy_id: aid,
        error: String(err?.message || err),
      })
    );
    return { ok: false, reason: String(err?.message || err) };
  }
}
