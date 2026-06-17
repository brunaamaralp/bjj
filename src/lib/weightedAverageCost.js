/** Custo médio ponderado (WAC) para variantes de estoque. */

export function roundUnitCost(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 10000) / 10000;
}

/**
 * @param {number} currentQty saldo antes da entrada
 * @param {number} currentAvg custo médio atual
 * @param {number} entryQty quantidade da entrada (> 0)
 * @param {number} entryUnitCost custo unitário da entrada
 */
export function computeWeightedAverageCost(currentQty, currentAvg, entryQty, entryUnitCost) {
  const qty = Math.max(0, Number(currentQty) || 0);
  const avg = Math.max(0, Number(currentAvg) || 0);
  const inQty = Math.max(0, Number(entryQty) || 0);
  const unit = Math.max(0, Number(entryUnitCost) || 0);
  if (inQty <= 0) return roundUnitCost(avg);
  const denom = qty + inQty;
  if (denom <= 0) return roundUnitCost(unit);
  return roundUnitCost((qty * avg + inQty * unit) / denom);
}

/** purchase_price na entrada é o valor total da compra. */
export function entryUnitCostFromPurchaseTotal(purchaseTotal, entryQty) {
  const total = Number(purchaseTotal);
  const q = Number(entryQty);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(q) || q <= 0) return null;
  return roundUnitCost(total / q);
}

export function readAverageCost(doc) {
  const n = Number(doc?.average_cost);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function readLastPurchaseCost(doc) {
  const n = Number(doc?.last_purchase_cost);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Custo unitário para CMV: médio ponderado, depois última compra, depois preço de custo do catálogo. */
export function resolveCmvUnitCost(doc) {
  const avg = readAverageCost(doc);
  if (avg > 0) return avg;
  const last = readLastPurchaseCost(doc);
  if (last > 0) return last;
  const catalog = Number(doc?.cost_price ?? doc?.preco_custo);
  if (Number.isFinite(catalog) && catalog > 0) return roundUnitCost(catalog);
  return 0;
}
