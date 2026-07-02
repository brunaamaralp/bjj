/**
 * Consulta FINANCIAL_TX com regra temporal única:
 * settled → settledAt; pending → $createdAt.
 */
import { Query } from 'node-appwrite';
import { DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc } from './financeTxFields.js';
import {
  FINANCE_REGIME,
  txInPeriod,
  txTemporalIso,
} from '../../src/lib/financeCompetence.js';
import { isAccrualLedgerTx } from '../../src/lib/financeLedgerRegime.js';
import {
  endOfDayIsoFinance,
  startOfDayIsoFinance,
} from '../../src/lib/financeForecastCore.js';
import {
  FINANCE_TX_LIST_MAX_PAGE_SIZE,
  FINANCE_TX_LIST_PAGE_SIZE,
} from '../../src/lib/financeListLimits.js';
import { normalizeStatementPeriod } from '../../src/lib/financeStatementPeriod.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const PAGE = 200;
const MAX_PAGES = 30;

/** Máximo de documentos únicos coletados por período (proteção de carga). */
export const MAX_TX_COLLECT_PER_PERIOD = 2500;

export const DEFAULT_TX_LIST_LIMIT = FINANCE_TX_LIST_PAGE_SIZE;
export const MAX_TX_LIST_LIMIT = FINANCE_TX_LIST_MAX_PAGE_SIZE;

function rangeBounds(from, to) {
  const startIso = from ? startOfDayIsoFinance(from) : null;
  const endIso = to ? endOfDayIsoFinance(to) : null;
  return { startIso, endIso };
}

async function fetchPages(academyId, extraQueries, onBatch) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.limit(PAGE),
      Query.orderDesc('$createdAt'),
      ...extraQueries,
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    if (typeof onBatch === 'function') {
      if (onBatch(docs) === false) break;
    } else {
      all.push(...docs);
    }
    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

function sortTxByTemporalDesc(a, b) {
  const ta = new Date(txTemporalIso(a)).getTime();
  const tb = new Date(txTemporalIso(b)).getTime();
  const taOk = Number.isFinite(ta);
  const tbOk = Number.isFinite(tb);
  if (taOk && tbOk && tb !== ta) return tb - ta;
  if (taOk && !tbOk) return -1;
  if (!taOk && tbOk) return 1;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

/** @param {string} cursor */
export function parseFinanceTxListCursor(cursor) {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const m = /^o:(\d+)$/.exec(raw);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function encodeFinanceTxListCursor(offset) {
  const n = Math.max(0, Math.floor(Number(offset) || 0));
  return Buffer.from(`o:${n}`, 'utf8').toString('base64url');
}

/**
 * @param {string} academyId
 * @param {{ from?: string, to?: string, regime?: string, maxCollect?: number }} opts
 * @returns {Promise<{ items: object[], truncated: boolean }>}
 */
export async function collectFinancialTxForPeriod(academyId, opts = {}) {
  if (!FINANCIAL_TX_COL || !DB_ID) return { items: [], truncated: false };
  const { from = '', to = '', regime = FINANCE_REGIME.CASH } = opts;
  const maxCollect =
    Number.isFinite(opts.maxCollect) && opts.maxCollect > 0
      ? Math.floor(opts.maxCollect)
      : Infinity;
  const { startIso, endIso } = rangeBounds(from, to);

  const byId = new Map();
  let truncated = false;

  const ingest = (docs) => {
    for (const doc of docs) {
      byId.set(doc.$id, doc);
      if (byId.size >= maxCollect) {
        truncated = true;
        return false;
      }
    }
    return true;
  };

  if (startIso && endIso) {
    const settledQs = [
      Query.equal('status', ['settled']),
      Query.greaterThanEqual('settledAt', startIso),
      Query.lessThanEqual('settledAt', endIso),
    ];
    await fetchPages(academyId, settledQs, ingest);
    if (!truncated) {
      const pendingQs = [
        Query.equal('status', ['pending']),
        Query.greaterThanEqual('$createdAt', startIso),
        Query.lessThanEqual('$createdAt', endIso),
      ];
      await fetchPages(academyId, pendingQs, ingest);
    }
  } else {
    await fetchPages(academyId, [], ingest);
  }

  const mapped = [...byId.values()]
    .map((d) => {
      const row = mapFinanceTxDoc(d);
      if (!row) return null;
      return {
        ...row,
        competence_month: d.competence_month || row.competence_month || '',
        $createdAt: d.$createdAt,
      };
    })
    .filter(Boolean);

  let items = mapped;
  if (regime === FINANCE_REGIME.COMPETENCE && (from || to)) {
    items = items.filter((tx) => txInPeriod(tx, { from, to, regime }));
  } else if (from || to) {
    items = items.filter((tx) => txInPeriod(tx, { from, to, regime: FINANCE_REGIME.CASH }));
  }

  if (regime === FINANCE_REGIME.CASH) {
    items = items.filter((tx) => !isAccrualLedgerTx(tx));
  }

  items.sort(sortTxByTemporalDesc);
  return { items, truncated };
}

/**
 * @param {string} academyId
 * @param {{ from?: string, to?: string, regime?: string }} opts
 */
export async function listFinancialTxForPeriod(academyId, opts = {}) {
  const { items } = await collectFinancialTxForPeriod(academyId, opts);
  return items;
}

/**
 * @param {string} academyId
 * @param {{ from?: string, to?: string, regime?: string, maxCollect?: number }} opts
 */
export async function listFinancialTxForPeriodWithMeta(academyId, opts = {}) {
  const maxCollect =
    Number.isFinite(opts.maxCollect) && opts.maxCollect > 0
      ? Math.floor(opts.maxCollect)
      : MAX_TX_COLLECT_PER_PERIOD;
  const { items, truncated } = await collectFinancialTxForPeriod(academyId, {
    ...opts,
    maxCollect,
  });
  return { items, truncated, maxCollect, totalInPeriod: items.length };
}

/**
 * Lista paginada para a UI do Caixa (cursor = offset na lista ordenada do período).
 * @param {string} academyId
 * @param {{ from?: string, to?: string, regime?: string, cursor?: string, limit?: number }} opts
 */
/**
 * TX para DRE por competência: união por competence_month + liquidações no período (fallback).
 * @param {string} academyId
 * @param {{ from?: string, to?: string, month?: string, maxCollect?: number }} opts
 */
export async function listFinancialTxForDrePeriod(academyId, opts = {}) {
  const period = normalizeStatementPeriod({
    from: opts.from,
    to: opts.to,
    month: opts.month,
  });
  const maxCollect =
    Number.isFinite(opts.maxCollect) && opts.maxCollect > 0
      ? Math.floor(opts.maxCollect)
      : MAX_TX_COLLECT_PER_PERIOD;

  const byId = new Map();
  let truncated = false;

  const ingestRaw = (docs) => {
    for (const doc of docs) {
      byId.set(doc.$id, doc);
      if (byId.size >= maxCollect) {
        truncated = true;
        return false;
      }
    }
    return true;
  };

  if (period.months.length > 0) {
    const minYm = period.months[0];
    const maxYm = period.months[period.months.length - 1];
    try {
      await fetchPages(
        academyId,
        [
          Query.greaterThanEqual('competence_month', minYm),
          Query.lessThanEqual('competence_month', maxYm),
        ],
        ingestRaw
      );
    } catch {
      for (const ym of period.months) {
        if (truncated) break;
        try {
          await fetchPages(academyId, [Query.equal('competence_month', ym)], ingestRaw);
        } catch {
          /* atributo ausente — segue só com liquidações no período */
        }
      }
    }
  }

  const remaining = Math.max(0, maxCollect - byId.size);
  const { items: settledItems, truncated: settledTruncated } =
    await collectFinancialTxForPeriod(academyId, {
      from: period.from,
      to: period.to,
      regime: FINANCE_REGIME.COMPETENCE,
      maxCollect: remaining || MAX_TX_COLLECT_PER_PERIOD,
    });
  if (settledTruncated) truncated = true;

  const merged = new Map();
  for (const doc of byId.values()) {
    const row = mapFinanceTxDoc(doc);
    if (!row) continue;
    merged.set(row.id, {
      ...row,
      competence_month: doc.competence_month || row.competence_month || '',
      $createdAt: doc.$createdAt,
    });
  }
  for (const tx of settledItems) {
    if (!merged.has(tx.id)) merged.set(tx.id, tx);
  }

  const items = [...merged.values()];
  return { items, truncated, maxCollect, totalInPeriod: items.length };
}

export async function listFinancialTxPage(academyId, opts = {}) {
  const limit = Math.min(
    MAX_TX_LIST_LIMIT,
    Math.max(1, Math.floor(Number(opts.limit) || DEFAULT_TX_LIST_LIMIT))
  );
  const offset = parseFinanceTxListCursor(opts.cursor);
  const { items, truncated } = await collectFinancialTxForPeriod(academyId, {
    from: opts.from,
    to: opts.to,
    regime: opts.regime,
    maxCollect: MAX_TX_COLLECT_PER_PERIOD,
  });

  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < items.length;

  return {
    transactions: page,
    total: items.length,
    hasMore,
    nextCursor: hasMore ? encodeFinanceTxListCursor(nextOffset) : null,
    truncated,
  };
}
