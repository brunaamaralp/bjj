const SALE_REVENUE_TX_TYPES = new Set(['product', 'rental']);
const DEFAULT_SALE_DESCRIPTION = 'venda de produtos';

/** FINANCIAL_TX de receita espelhada de venda (ignora CMV e troco). */
export function isSaleRevenueFinancialTx(doc) {
  const saleId = String(doc?.saleId || '').trim();
  if (!saleId) return false;
  const type = String(doc?.type || '').toLowerCase();
  if (SALE_REVENUE_TX_TYPES.has(type)) return true;
  const origin = String(doc?.origin_type || doc?.originType || '').toLowerCase();
  return origin === 'sale' && type !== 'stock_purchase';
}

/** Descrições genéricas gravadas quando o espelho não resolveu o catálogo. */
export function isGenericSaleProductDescription(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (lower === DEFAULT_SALE_DESCRIPTION || lower === 'venda de produto') return true;
  if (/^produto$/i.test(value)) return true;

  const parts = value.split(/,\s*/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => /^produto(\s+x\d+)?$/i.test(part));
}

/**
 * @param {object} txDoc FINANCIAL_TX
 * @param {string} resolvedDescription descrição canônica da venda
 */
export function resolveSaleFinancialTxDescriptionBackfill(txDoc, resolvedDescription) {
  const planName = String(txDoc?.planName || '').trim();
  const next = String(resolvedDescription || '').trim();

  if (!next || next.toLowerCase() === DEFAULT_SALE_DESCRIPTION) {
    return { action: 'unresolved', reason: 'no_sale_description' };
  }
  if (!isGenericSaleProductDescription(planName)) {
    return { action: 'skip', reason: 'planName_ok', planName };
  }
  if (planName === next) {
    return { action: 'skip', reason: 'unchanged', planName };
  }

  const patch = {
    planName: next.slice(0, 256),
  };
  const note = String(txDoc?.note || '').trim();
  if (!note || note === planName || isGenericSaleProductDescription(note)) {
    patch.note = next.slice(0, 2000);
  }

  return { action: 'update', planName: patch.planName, patch };
}
