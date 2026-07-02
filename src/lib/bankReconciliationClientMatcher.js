import { roundMoney } from '../../lib/money.js';
import {
  BANK_MATCH_SUGGEST_SCORE,
  bankMatchSuggestionToClientView,
  reconciliationTxDateYmd,
  resolveBankMatchSuggestion,
  scoreBankItemToTxBase,
  txDirectionForReconciliation,
} from './bankReconciliationScore.js';
import { txEligibleForBankReconciliation } from './financeLedgerRegime.js';

export {
  BANK_MATCH_SUGGEST_SCORE,
  BANK_MATCH_AMBIGUITY_DELTA,
  BANK_MATCH_MIN_CANDIDATES,
} from './bankReconciliationScore.js';

/** @deprecated use BANK_MATCH_SUGGEST_SCORE / 100 for exibição percentual */
export const RECON_CLIENT_DEFAULT_MIN_SCORE = BANK_MATCH_SUGGEST_SCORE / 100;

export const RECON_CLIENT_AMOUNT_TOLERANCE = 0.02;
export const RECON_CLIENT_DEFAULT_MAX_DATE_DAYS = 3;
export const RECON_CLIENT_BATCH_CHUNK_SIZE = 12;

const batchResultCache = new Map();

function amountToCents(amount) {
  return Math.round(roundMoney(amount) * 100);
}

function txAmountValue(tx) {
  const gross = roundMoney(Math.abs(Number(tx?.gross) || 0));
  const net = roundMoney(Math.abs(Number(tx?.net) || gross));
  return gross > 0 ? gross : net;
}

/**
 * Hash simples do extrato para cache de sessão.
 * @param {object[]} extratoItems
 */
export function getExtratoHash(extratoItems) {
  const items = Array.isArray(extratoItems) ? extratoItems : [];
  if (!items.length) return 'empty';
  const dates = items.map((i) => String(i?.date || '').slice(0, 10)).sort();
  const total = roundMoney(items.reduce((sum, i) => sum + Math.abs(Number(i?.amount) || 0), 0));
  return `${items.length}:${total}:${dates[0] || ''}:${dates[dates.length - 1] || ''}`;
}

export function getCachedReconciliationBatch(hash) {
  return batchResultCache.get(hash) ?? null;
}

export function setCachedReconciliationBatch(hash, results) {
  if (!hash) return;
  batchResultCache.set(hash, results);
}

export function clearReconciliationBatchCache() {
  batchResultCache.clear();
}

/**
 * @typedef {object} ReconciliationIndexEntry
 * @property {string} id
 * @property {number} amountCents
 * @property {'in'|'out'} direction
 * @property {string} dateYmd
 * @property {object} tx
 */

/**
 * @param {object[]} lancamentosNaoConciliados
 * @returns {{ byAmountCents: Map<number, ReconciliationIndexEntry[]>, txById: Map<string, ReconciliationIndexEntry> }}
 */
export function buildReconciliationIndex(lancamentosNaoConciliados) {
  /** @type {Map<number, ReconciliationIndexEntry[]>} */
  const byAmountCents = new Map();
  /** @type {Map<string, ReconciliationIndexEntry>} */
  const txById = new Map();

  for (const tx of lancamentosNaoConciliados || []) {
    const id = String(tx?.id || '').trim();
    if (!id) continue;
    if (!txEligibleForBankReconciliation(tx)) continue;
    if (tx?.reconciled === true) continue;
    if (String(tx?.status || '').toLowerCase() !== 'settled') continue;

    const amount = txAmountValue(tx);
    if (amount < 0.01) continue;

    const entry = {
      id,
      amountCents: amountToCents(amount),
      direction: txDirectionForReconciliation(tx),
      dateYmd: reconciliationTxDateYmd(tx),
      tx,
    };

    txById.set(id, entry);
    if (!byAmountCents.has(entry.amountCents)) byAmountCents.set(entry.amountCents, []);
    byAmountCents.get(entry.amountCents).push(entry);
  }

  return { byAmountCents, txById };
}

/**
 * Consulta candidatos pelo valor exato e vizinhos dentro da tolerância (± R$0,02).
 * @param {{ byAmountCents: Map<number, ReconciliationIndexEntry[]> }} index
 * @param {number} amountCents
 */
export function lookupCandidatesByAmount(index, amountCents) {
  const toleranceCents = Math.round(RECON_CLIENT_AMOUNT_TOLERANCE * 100);
  const seen = new Set();
  /** @type {ReconciliationIndexEntry[]} */
  const candidates = [];

  for (let delta = -toleranceCents; delta <= toleranceCents; delta += 1) {
    const key = amountCents + delta;
    const bucket = index.byAmountCents.get(key);
    if (!bucket) continue;
    for (const entry of bucket) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      candidates.push(entry);
    }
  }

  return candidates;
}

/**
 * @param {object} extratoItem
 * @param {ReconciliationIndexEntry} entry
 */
export function scoreReconciliationPair(extratoItem, entry) {
  const base = scoreBankItemToTxBase(extratoItem, entry.tx);
  if (!base) return null;

  const rank_score = base;
  const score = base;
  const match_tier =
    base >= 70 ? 'amount_date' : base >= BANK_MATCH_SUGGEST_SCORE ? 'amount_approx' : null;

  if (rank_score < BANK_MATCH_SUGGEST_SCORE) return null;

  return {
    txId: entry.id,
    tx: entry.tx,
    score,
    rank_score,
    name_bonus: 0,
    match_tier,
    partialScores: { base, name_bonus: 0 },
  };
}

/**
 * @param {object} extratoItem
 * @param {{ byAmountCents: Map<number, ReconciliationIndexEntry[]>, txById: Map<string, ReconciliationIndexEntry> }} index
 */
export function matchReconciliationItem(extratoItem, index) {
  if (!extratoItem || !index?.byAmountCents) {
    return { candidates: [], displayMode: 'none', suggestedTxId: null };
  }

  const amountCents = amountToCents(Math.abs(Number(extratoItem.amount) || 0));
  if (amountCents <= 0) {
    return { candidates: [], displayMode: 'none', suggestedTxId: null };
  }

  const bucketEntries = lookupCandidatesByAmount(index, amountCents);
  const scored = [];
  for (const entry of bucketEntries) {
    const result = scoreReconciliationPair(extratoItem, entry);
    if (result) {
      scored.push({
        tx: entry.tx,
        score: result.score,
        rank_score: result.rank_score,
        name_bonus: result.name_bonus,
        match_tier: result.match_tier,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
    return String(a.tx?.id || '').localeCompare(String(b.tx?.id || ''));
  });

  const suggestion = resolveBankMatchSuggestion(scored);
  const view = bankMatchSuggestionToClientView(suggestion, index.txById);
  if (view.candidates?.length) {
    view.candidates = view.candidates.map((c) => ({
      ...c,
      tx: c.tx || index.txById.get(c.txId)?.tx || null,
    }));
  }
  return view;
}

/**
 * Remove um lançamento do índice após conciliação confirmada.
 * @param {{ byAmountCents: Map<number, ReconciliationIndexEntry[]>, txById: Map<string, ReconciliationIndexEntry> }} index
 * @param {string} lancamentoId
 */
export function removeFromIndex(index, lancamentoId) {
  const id = String(lancamentoId || '').trim();
  if (!id || !index?.txById) return index;

  const entry = index.txById.get(id);
  if (!entry) return index;

  index.txById.delete(id);
  const bucket = index.byAmountCents.get(entry.amountCents);
  if (bucket) {
    const next = bucket.filter((e) => e.id !== id);
    if (next.length) index.byAmountCents.set(entry.amountCents, next);
    else index.byAmountCents.delete(entry.amountCents);
  }

  return index;
}

const scheduleIdle =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 80 })
    : (cb) => setTimeout(cb, 0);

/**
 * Processa o extrato em lotes assíncronos.
 * @param {object[]} extratoItems
 * @param {{ byAmountCents: Map<number, ReconciliationIndexEntry[]>, txById: Map<string, ReconciliationIndexEntry> }} index
 * @param {(processed: number, total: number) => void} [onProgress]
 * @param {{ chunkSize?: number, cache?: boolean, cacheKey?: string }} [options]
 */
export function reconcileBatch(extratoItems, index, onProgress, options = {}) {
  const items = Array.isArray(extratoItems) ? extratoItems : [];
  const total = items.length;
  const chunkSize = options.chunkSize ?? RECON_CLIENT_BATCH_CHUNK_SIZE;
  const cacheKey = options.cacheKey ?? getExtratoHash(items);

  if (options.cache !== false && cacheKey) {
    const cached = getCachedReconciliationBatch(cacheKey);
    if (cached) {
      onProgress?.(total, total);
      return Promise.resolve(cached);
    }
  }

  return new Promise((resolve) => {
    /** @type {Record<string, ReturnType<typeof matchReconciliationItem>>} */
    const results = {};
    let cursor = 0;

    const processChunk = () => {
      const end = Math.min(cursor + chunkSize, total);
      for (; cursor < end; cursor += 1) {
        const item = items[cursor];
        const itemId = String(item?.id || '').trim();
        if (!itemId) continue;
        results[itemId] = matchReconciliationItem(item, index);
      }
      onProgress?.(cursor, total);
      if (cursor >= total) {
        if (options.cache !== false && cacheKey) {
          setCachedReconciliationBatch(cacheKey, results);
        }
        resolve(results);
        return;
      }
      scheduleIdle(processChunk);
    };

    scheduleIdle(processChunk);
  });
}

/** @deprecated classificação unificada via resolveBankMatchSuggestion */
export function classifyReconciliationCandidates(candidates, options = {}) {
  const scored = (candidates || []).map((c) => ({
    tx: { id: c.txId },
    score: c.score,
    rank_score: c.rank_score ?? c.score,
    name_bonus: c.name_bonus ?? 0,
    match_tier: c.match_tier ?? null,
  }));
  scored.sort((a, b) => b.rank_score - a.rank_score);
  const suggestion = resolveBankMatchSuggestion(scored);
  return bankMatchSuggestionToClientView(suggestion);
}

/** @deprecated use scoreBankItemToTxBase via scoreReconciliationPair */
export function scoreReconciliationValue(itemAmount, txAmount) {
  const item = { amount: itemAmount, direction: 'credit', date: '2000-01-01' };
  const tx = { gross: txAmount, net: txAmount, direction: 'in', type: 'plan', settledAt: '2000-01-01' };
  const base = scoreBankItemToTxBase(item, tx);
  if (base >= 100) return 1;
  if (base >= BANK_MATCH_SUGGEST_SCORE) return BANK_MATCH_SUGGEST_SCORE / 100;
  return 0;
}

/** @deprecated use scoreBankItemToTxBase */
export function scoreReconciliationDate(itemDateYmd, txDateYmdValue, maxDays = RECON_CLIENT_DEFAULT_MAX_DATE_DAYS) {
  const item = { amount: 100, direction: 'credit', date: itemDateYmd };
  const tx = {
    gross: 100,
    net: 100,
    direction: 'in',
    type: 'plan',
    settledAt: txDateYmdValue,
  };
  const base = scoreBankItemToTxBase(item, tx);
  if (!base) return 0;
  if (base >= 100) return 1;
  if (base >= 85) return 0.85;
  if (base >= 70) return 0.7;
  return BANK_MATCH_SUGGEST_SCORE / 100;
}

/** @deprecated descrição não compõe score base unificado (bônus de pagador é server-only) */
export function scoreReconciliationDescription() {
  return 0;
}

export { bankItemToNaviDirection } from './bankReconciliationScore.js';
