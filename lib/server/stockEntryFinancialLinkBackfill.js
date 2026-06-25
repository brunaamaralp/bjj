/**
 * Heurística para vincular entradas de estoque históricas a despesas no Caixa.
 */
import { FINANCE_ORIGIN_STOCK_ENTRY } from '../../src/lib/financeOriginTypes.js';

const FIVE_MIN_MS = 5 * 60 * 1000;

export function isStockPurchaseTx(doc) {
  const type = String(doc?.type || '').toLowerCase();
  return type === 'stock_purchase' || String(doc?.category || '').toLowerCase().includes('estoque');
}

export function txWithinMoveWindow(moveCreatedAt, txCreatedAt, windowMs = FIVE_MIN_MS) {
  const moveT = new Date(moveCreatedAt || 0).getTime();
  const txT = new Date(txCreatedAt || 0).getTime();
  if (!Number.isFinite(moveT) || !Number.isFinite(txT)) return false;
  return Math.abs(txT - moveT) <= windowMs;
}

export function grossMatchesPurchase(gross, purchasePrice, tolerance = 0.02) {
  const g = Number(gross);
  const p = Number(purchasePrice);
  if (!Number.isFinite(g) || !Number.isFinite(p) || p <= 0) return false;
  return Math.abs(g - p) <= tolerance;
}

export function noteMatchesStockPurchase(note, itemName) {
  const n = String(note || '').trim();
  const name = String(itemName || '').trim();
  if (!n || !name) return false;
  const prefix = `Compra de estoque: ${name}`;
  return n === prefix || n.startsWith(`${prefix} —`) || n.startsWith(`${prefix} -`);
}

/**
 * @param {object} move stock_moves doc
 * @param {object[]} candidates financial_tx docs
 * @param {string} itemName
 * @returns {object|null} unique match or null
 */
export function findStockEntryFinancialMatch(move, candidates, itemName) {
  const purchase = Number(move?.purchase_price);
  if (!Number.isFinite(purchase) || purchase <= 0) return null;

  const matches = (candidates || []).filter((tx) => {
    if (!isStockPurchaseTx(tx)) return false;
    if (String(tx.origin_id || '').trim()) return false;
    if (String(tx.origin_type || '').trim() === 'reversal') return false;
    const academyMove = String(move.academy_id || move.academyId || '').trim();
    const academyTx = String(tx.academyId || tx.academy_id || '').trim();
    if (academyMove && academyTx && academyMove !== academyTx) return false;
    if (!grossMatchesPurchase(tx.gross, purchase)) return false;
    if (!txWithinMoveWindow(move.$createdAt, tx.$createdAt)) return false;
    const note = tx.note || tx.planName || '';
    return noteMatchesStockPurchase(note, itemName);
  });

  if (matches.length !== 1) return null;
  return matches[0];
}

export function buildStockEntryLinkPatches(moveId, txId) {
  return {
    move: {
      financial_tx_id: String(txId).slice(0, 64),
    },
    tx: {
      origin_type: FINANCE_ORIGIN_STOCK_ENTRY,
      origin_id: String(moveId).slice(0, 64),
    },
  };
}
