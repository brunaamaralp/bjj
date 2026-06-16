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
  { code: '1.1.9', name: 'Transferências entre contas', type: 'ativo', nature: 'devedora', dreGrupo: '', cash: false },
  { code: '2.2.1', name: 'Empréstimos', type: 'passivo', nature: 'credora', dreGrupo: '', cash: false },
  { code: '3.1.1', name: 'Capital social / Aportes', type: 'pl', nature: 'credora', dreGrupo: '', cash: false },
  { code: '4.1.1', name: 'Receita de Vendas', type: 'receita', nature: 'credora', dreGrupo: 'Receita Bruta', cash: false },
  { code: '4.9.1', name: 'Deduções/Impostos s/ Vendas', type: 'receita', nature: 'devedora', dreGrupo: 'Deduções', cash: false },
  { code: '5.1.1', name: 'CMV/CPV', type: 'custo', nature: 'devedora', dreGrupo: 'CMV/CPV', cash: false },
  { code: '6.2.1', name: 'Despesas Gerais e Adm', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais', cash: false },
  { code: '7.1.1', name: 'Despesas Financeiras', type: 'despesa', nature: 'devedora', dreGrupo: 'Resultado Financeiro', cash: true },
  { code: '7.1.2', name: 'Receitas financeiras', type: 'receita', nature: 'credora', dreGrupo: 'Resultado Financeiro', cash: false },
];

export async function loadAccounts(academyId) {
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
  const id = String(txId).trim();

  try {
    const byTxId = await databases.listDocuments(DB_ID, JOURNAL_COL, [
      Query.equal('academyId', academyId),
      Query.equal('financial_tx_id', id),
      Query.limit(1),
    ]);
    if ((byTxId.documents || []).length > 0) return true;
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (!msg.includes('unknown attribute') && !msg.includes('invalid')) {
      return false;
    }
    console.warn(JSON.stringify({
      event: 'journal_exists_fallback',
      academyId,
      txId: id,
      reason: 'financial_tx_id_query_unavailable',
    }));
  }

  const needle = `· ${id}`;
  let cursor = null;
  try {
    for (let page = 0; page < 3; page += 1) {
      const q = [
        Query.equal('academyId', academyId),
        Query.limit(100),
        Query.orderDesc('$createdAt'),
      ];
      if (cursor) q.push(Query.cursorAfter(cursor));
      const res = await databases.listDocuments(DB_ID, JOURNAL_COL, q);
      const docs = res.documents || [];
      if (docs.some((d) => String(d.memo || '').includes(needle))) return true;
      if (docs.length < 100) break;
      cursor = docs[docs.length - 1]?.$id;
      if (!cursor) break;
    }
  } catch {
    return false;
  }
  return false;
}

const TX_ID_MEMO_RE = /·\s*([a-zA-Z0-9]{10,})/;

/**
 * Backfill financial_tx_id em entradas legadas (memo contém · {txId}).
 * @returns {Promise<{ scanned: number, updated: number, skipped: number }>}
 */
export async function backfillJournalFinancialTxIds(academyId, { dryRun = false } = {}) {
  if (!JOURNAL_COL || !academyId) {
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let cursor = null;

  for (let page = 0; page < 50; page += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.limit(100),
      Query.orderDesc('$createdAt'),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, JOURNAL_COL, q);
    const docs = res.documents || [];
    for (const doc of docs) {
      scanned += 1;
      if (String(doc.financial_tx_id || '').trim()) {
        skipped += 1;
        continue;
      }
      const memo = String(doc.memo || '');
      const match = memo.match(TX_ID_MEMO_RE);
      const txId = match ? String(match[1] || '').trim() : '';
      if (!txId) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        updated += 1;
        continue;
      }
      try {
        await databases.updateDocument(DB_ID, JOURNAL_COL, doc.$id, { financial_tx_id: txId });
        updated += 1;
      } catch {
        skipped += 1;
      }
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return { scanned, updated, skipped };
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
