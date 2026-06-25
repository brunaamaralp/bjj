/**
 * Listagem e mapeamento de movimentações de estoque (histórico).
 */
import { Query } from 'node-appwrite';
import {
  itemDisplayName,
  resolveSignedStockMoveQuantity,
  STOCK_MOVE_TYPE_LABELS,
  variantInventoryLabel,
} from '../../src/lib/stockInventory.js';
import { detectStockEntryInconsistency } from '../../src/lib/stockEntryInconsistency.js';
import { resolveStockDocument, PRODUCT_VARIANTS_COL } from './productCatalogDb.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function moveTipoLabel(tipo) {
  const t = String(tipo || '').toLowerCase();
  return STOCK_MOVE_TYPE_LABELS[t] || t || '—';
}

function buildItemLabel(resolved) {
  if (!resolved?.doc) return '—';
  const item = resolved.doc;
  const parentName = resolved.parent?.nome || itemDisplayName(item);
  if (resolved.collection === PRODUCT_VARIANTS_COL || item.size != null || item.color != null) {
    const vl = variantInventoryLabel({
      size: item.size,
      color: item.color,
      Tamanho: item.Tamanho ?? item.tamanho,
    });
    return vl === 'Único' ? parentName : `${parentName} · ${vl}`;
  }
  const tam = String(item.Tamanho ?? item.tamanho ?? '').trim();
  return tam ? `${parentName} · ${tam}` : parentName;
}

/**
 * @param {object} doc stock_moves document
 * @param {object} [ctx]
 * @param {string} [ctx.item_label]
 * @param {string} [ctx.financial_tx_status]
 */
export function mapStockMoveRow(doc, ctx = {}) {
  const purchaseRaw = doc.purchase_price;
  const purchasePrice =
    purchaseRaw != null && purchaseRaw !== '' && Number.isFinite(Number(purchaseRaw))
      ? Number(purchaseRaw)
      : null;
  const financialTxId = String(doc.financial_tx_id || '').trim();
  const tipo = String(doc.tipo || '').toLowerCase();
  const correctedByMoveId = String(doc.corrected_by_move_id || '').trim();

  const row = {
    id: doc.$id,
    item_estoque_id: String(doc.item_estoque_id || '').trim(),
    item_label: ctx.item_label || '',
    tipo,
    tipo_label: moveTipoLabel(tipo),
    quantidade: resolveSignedStockMoveQuantity(doc),
    purchase_price: purchasePrice,
    payment_method: String(doc.payment_method || '').trim(),
    financial_tx_id: financialTxId,
    financial_tx_status: ctx.financial_tx_status || '',
    corrected_by_move_id: correctedByMoveId,
    quantity_before:
      doc.quantity_before != null && doc.quantity_before !== ''
        ? Math.trunc(Number(doc.quantity_before))
        : null,
    motivo: String(doc.motivo || '').trim(),
    created_at: doc.$createdAt || doc.created_at || null,
    has_cash_link: Boolean(financialTxId),
    can_correct: tipo === 'entrada',
  };

  const inconsistency = detectStockEntryInconsistency(row);
  row.has_inconsistency = inconsistency.has_issue;
  row.inconsistency_kind = inconsistency.kind;
  row.inconsistency_message = inconsistency.message;

  return row;
}

async function fetchFinancialTxStatusMap(databases, dbId, txIds, academyId) {
  const map = new Map();
  if (!FINANCIAL_TX_COL || !txIds.length) return map;
  const unique = [...new Set(txIds.filter(Boolean))];
  for (const id of unique) {
    try {
      const doc = await databases.getDocument(dbId, FINANCIAL_TX_COL, id);
      if (academyId && doc.academyId && String(doc.academyId) !== String(academyId)) continue;
      map.set(id, String(doc.status || '').toLowerCase());
    } catch {
      map.set(id, 'missing');
    }
  }
  return map;
}

const itemLabelCache = new Map();

async function resolveItemLabel(databases, dbId, stockItemsCol, itemId, academyId) {
  const key = `${academyId}:${itemId}`;
  if (itemLabelCache.has(key)) return itemLabelCache.get(key);
  try {
    const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, itemId);
    if (!resolved) return '—';
    if (academyId && resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
      return '—';
    }
    const label = buildItemLabel(resolved);
    itemLabelCache.set(key, label);
    return label;
  } catch {
    return '—';
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 */
export async function listAcademyStockMoves(databases, opts) {
  const {
    dbId,
    stockMovesCol,
    stockItemsCol,
    academyId,
    itemEstoqueId = '',
    limit: limitRaw = 50,
    cursor = '',
  } = opts;

  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 50));
  const queries = [Query.orderDesc('$createdAt'), Query.limit(limit)];
  if (academyId) {
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      void 0;
    }
  }
  const itemId = String(itemEstoqueId || '').trim();
  if (itemId) {
    queries.unshift(Query.equal('item_estoque_id', itemId));
  }
  const cursorId = String(cursor || '').trim();
  if (cursorId) {
    queries.push(Query.cursorAfter(cursorId));
  }

  const list = await databases.listDocuments(dbId, stockMovesCol, queries);
  const docs = list.documents || [];
  const txIds = docs.map((d) => String(d.financial_tx_id || '').trim()).filter(Boolean);
  const txStatusById = await fetchFinancialTxStatusMap(databases, dbId, txIds, academyId);

  itemLabelCache.clear();
  const moves = [];
  for (const doc of docs) {
    const itemLabel = await resolveItemLabel(
      databases,
      dbId,
      stockItemsCol,
      doc.item_estoque_id,
      academyId
    );
    const txId = String(doc.financial_tx_id || '').trim();
    moves.push(
      mapStockMoveRow(doc, {
        item_label: itemLabel,
        financial_tx_status: txId ? txStatusById.get(txId) || '' : '',
      })
    );
  }

  const nextCursor = docs.length >= limit ? docs[docs.length - 1].$id : '';
  return { moves, cursor: nextCursor };
}
