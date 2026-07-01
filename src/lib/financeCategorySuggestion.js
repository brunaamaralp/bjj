import { txDirection } from './financeTxDisplay.js';
import { txTemporalIso } from './financeCompetence.js';

export const FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD = 0.3;
export const FINANCE_CATEGORY_SUGGESTION_MAX_ENTRIES = 500;
export const FINANCE_CATEGORY_SUGGESTION_MONTHS_WINDOW = 6;
export const FINANCE_CATEGORY_SUGGESTION_DEBOUNCE_MS = 500;

const STOPWORDS = new Set([
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'por',
  'para',
  'com',
  'sem',
  'entre',
  'sobre',
  'ate',
  'apos',
  'ante',
  'desde',
  'contra',
  'que',
  'se',
  'ao',
  'aos',
  'pela',
  'pelo',
  'pelas',
  'pelos',
  'pagamento',
  'valor',
  'referente',
  'referencia',
  'pago',
  'pagar',
  'recebimento',
  'receber',
  'transferencia',
  'compra',
  'venda',
  'lancamento',
  'saida',
  'entrada',
  'mes',
  'ano',
  'ref',
  'via',
]);

/**
 * Lowercase, remove accents, punctuation and extra whitespace (cache key).
 * @param {string} text
 */
export function normalizeFinanceDescriptionText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenizeFinanceDescription(text) {
  const normalized = normalizeFinanceDescriptionText(text);
  if (!normalized) return new Set();
  const tokens = new Set();
  for (const raw of normalized.split(' ')) {
    const token = raw.trim();
    if (token.length < 2) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
export function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  if (!intersection) return 0;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * @param {object} tx
 */
function txDescriptionForSuggestion(tx) {
  return String(tx?.planName || '').trim() || String(tx?.note || '').trim();
}

/**
 * @param {object[]} pastEntries
 * @param {{ monthsWindow?: number, maxEntries?: number, direction?: 'in'|'out' }} [options]
 */
export function filterEntriesForCategoryIndex(pastEntries, options = {}) {
  const monthsWindow = options.monthsWindow ?? FINANCE_CATEGORY_SUGGESTION_MONTHS_WINDOW;
  const maxEntries = options.maxEntries ?? FINANCE_CATEGORY_SUGGESTION_MAX_ENTRIES;
  const direction = options.direction;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsWindow);
  const cutoffMs = cutoff.getTime();

  const filtered = [];
  for (const tx of pastEntries || []) {
    if (String(tx?.status || '').toLowerCase() === 'cancelled') continue;
    if (direction && txDirection(tx) !== direction) continue;
    const category = String(tx?.category || '').trim();
    if (!category) continue;
    if (!txDescriptionForSuggestion(tx)) continue;
    const iso = txTemporalIso(tx);
    if (iso) {
      const t = new Date(iso).getTime();
      if (Number.isFinite(t) && t < cutoffMs) continue;
    }
    filtered.push(tx);
  }

  filtered.sort((a, b) => {
    const ta = new Date(txTemporalIso(a) || 0).getTime();
    const tb = new Date(txTemporalIso(b) || 0).getTime();
    return tb - ta;
  });

  return filtered.slice(0, maxEntries);
}

/**
 * Índice invertido para sugestão de categoria.
 * @typedef {{ category: string, weight: number, entryIndex: number }} TokenCategoryWeight
 * @typedef {{ entries: { category: string, tokens: Set<string> }[], invertedIndex: Map<string, number[]>, tokenCategoryWeights: Map<string, TokenCategoryWeight[]> }} CategorySuggestionIndex
 */

/**
 * Constrói o índice invertido uma vez a partir do histórico em memória.
 * @param {object[]} pastEntries
 * @param {{ monthsWindow?: number, maxEntries?: number, direction?: 'in'|'out' }} [options]
 * @returns {CategorySuggestionIndex}
 */
export function buildCategoryIndex(pastEntries, options = {}) {
  const scoped = filterEntriesForCategoryIndex(pastEntries, options);
  /** @type {CategorySuggestionIndex['entries']} */
  const entries = [];
  /** @type {Map<string, number[]>} */
  const invertedIndex = new Map();
  /** @type {Map<string, TokenCategoryWeight[]>} */
  const tokenCategoryWeights = new Map();

  for (const tx of scoped) {
    const category = String(tx.category || '').trim();
    const tokens = tokenizeFinanceDescription(txDescriptionForSuggestion(tx));
    if (!tokens.size) continue;

    const entryIndex = entries.length;
    entries.push({ category, tokens });

    const tokenWeight = 1 / tokens.size;
    for (const token of tokens) {
      if (!invertedIndex.has(token)) invertedIndex.set(token, []);
      invertedIndex.get(token).push(entryIndex);

      if (!tokenCategoryWeights.has(token)) tokenCategoryWeights.set(token, []);
      tokenCategoryWeights.get(token).push({ category, weight: tokenWeight, entryIndex });
    }
  }

  return { entries, invertedIndex, tokenCategoryWeights };
}

/**
 * @param {string} description
 * @param {{ index: CategorySuggestionIndex, threshold?: number, cache?: Map<string, { category: string, confidence: number } | null> }} options
 * @returns {{ category: string, confidence: number } | null}
 */
export function suggestCategory(description, options) {
  const index = options?.index;
  if (!index?.entries?.length) return null;

  const threshold = options?.threshold ?? FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD;
  const normalized = normalizeFinanceDescriptionText(description);
  if (!normalized) return null;

  const cache = options?.cache;
  if (cache?.has(normalized)) return cache.get(normalized) ?? null;

  const queryTokens = tokenizeFinanceDescription(description);
  if (!queryTokens.size) {
    cache?.set(normalized, null);
    return null;
  }

  const candidateIndices = new Set();
  for (const token of queryTokens) {
    const indices = index.invertedIndex.get(token);
    if (!indices) continue;
    for (const i of indices) candidateIndices.add(i);
  }

  if (!candidateIndices.size) {
    cache?.set(normalized, null);
    return null;
  }

  /** @type {Map<string, number>} */
  const categoryScores = new Map();
  for (const i of candidateIndices) {
    const entry = index.entries[i];
    if (!entry) continue;
    const sim = jaccardSimilarity(queryTokens, entry.tokens);
    if (sim <= 0) continue;
    categoryScores.set(entry.category, (categoryScores.get(entry.category) || 0) + sim);
  }

  let bestCategory = '';
  let bestScore = 0;
  for (const [category, score] of categoryScores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  const result =
    bestCategory && bestScore >= threshold ? { category: bestCategory, confidence: bestScore } : null;
  cache?.set(normalized, result);
  return result;
}
