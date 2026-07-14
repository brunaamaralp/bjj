/**
 * Restaura estoque ao cancelar venda — resolução canônica + fallback de snapshot.
 */
import { Query } from 'node-appwrite';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import {
  buildCancelStockPatch,
  cancelStockMoveTipoForLineKind,
  normalizeLineKind,
} from '../../src/lib/saleLineKind.js';
import { updateDocumentResilient } from './appwriteSchemaResilient.js';
import { createStockMoveDocument } from './stockMoveFields.js';
import { resolveStockDocument } from './productCatalogDb.js';
import { roundMoney } from './salePayments.js';

const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';

export function parseSaleItemsSnapshot(venda) {
  try {
    const raw = JSON.parse(venda?.itens_snapshot_json || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((l, i) => {
        const stockId = String(l?.item_estoque_id || l?.product_variant_id || '').trim();
        const qty = Number(l?.quantidade || 0);
        if (!stockId || !(qty > 0)) return null;
        return {
          $id: `snap-${i}`,
          product_variant_id: stockId,
          item_estoque_id: stockId,
          quantidade: qty,
          preco_unitario: Number(l?.preco_unitario) || 0,
          line_kind: l?.line_kind || 'sale',
          display_label: l?.label || '',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function listSaleItemsForCancel(databases, dbId, vendaId, venda) {
  let docs = [];
  if (SALE_ITEMS_COL) {
    try {
      const res = await databases.listDocuments(dbId, SALE_ITEMS_COL, [
        Query.equal('venda_id', vendaId),
        Query.limit(1000),
      ]);
      docs = res.documents || [];
    } catch (e) {
      console.warn('[salesCancel] listSaleItems:', e?.message || e);
    }
  }
  if (docs.length) return { items: docs, source: 'sale_items' };
  const snap = parseSaleItemsSnapshot(venda);
  return { items: snap, source: snap.length ? 'snapshot' : 'empty' };
}

export function isCancelStockMove(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  const mk = String(doc?.movement_kind || '').toLowerCase();
  const motivo = String(doc?.motivo || '').toLowerCase();
  if (mk === 'return') return true;
  if (tipo === 'reversao_venda' || tipo === 'devolucao') return true;
  // Schema Appwrite colapsa reversao/devolucao → entrada (mesmo referencia_id da venda).
  if (tipo === 'entrada' && mk !== 'sale' && mk !== 'initial') return true;
  if (motivo.includes('cancelamento') || motivo.includes('rascunho')) return true;
  return false;
}

export async function listCancelStockMovesForSale(databases, dbId, vendaId) {
  if (!STOCK_MOVES_COL || !vendaId) return [];
  const out = [];
  const seen = new Set();

  async function pull(attr) {
    try {
      const res = await databases.listDocuments(dbId, STOCK_MOVES_COL, [
        Query.equal(attr, vendaId),
        Query.limit(100),
      ]);
      for (const d of res.documents || []) {
        if (seen.has(d.$id)) continue;
        seen.add(d.$id);
        if (isCancelStockMove(d)) out.push(d);
      }
    } catch {
      void 0;
    }
  }

  await pull('referencia_id');
  if (!out.length) await pull('sale_id');
  return out;
}

export async function revertSaleItemsStock(
  databases,
  {
    dbId,
    itens,
    venda,
    vendaId,
    academyId,
    motivo,
    usuarioId,
    usuarioName,
    stockItemsCol = STOCK_ITEMS_COL,
    stockMovesCol = STOCK_MOVES_COL,
  }
) {
  const revertedItems = [];

  for (const it of itens) {
    const qty = Number(it.quantidade || 0);
    if (qty <= 0) continue;

    const lookupId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, lookupId);
    const itemStock = resolved?.doc;
    const stockCol = resolved?.collection || stockItemsCol;
    const stockId = String(itemStock?.$id || lookupId).trim();
    if (!itemStock || !stockCol || resolved?.parentProductOnly || !stockId) {
      const err = new Error('stock_item_not_found');
      err.code = 'stock_item_not_found';
      err.lookupId = lookupId;
      throw err;
    }
    const stockAcademyId = String(itemStock.academy_id || itemStock.academyId || '').trim();
    if (stockAcademyId && stockAcademyId !== String(academyId)) {
      const err = new Error('forbidden');
      err.code = 'forbidden';
      throw err;
    }

    const lineKind = normalizeLineKind(it.line_kind);
    const stockPatch = buildCancelStockPatch(itemStock, qty, lineKind);

    await updateDocumentResilient(databases, dbId, stockCol, stockId, {
      ...stockPatch,
      last_updated: new Date().toISOString(),
    });

    const unitPrice = Number(it.preco_unitario) || 0;
    const isRental = lineKind === 'rental';
    const movePayload = {
      item_estoque_id: stockId,
      tipo: cancelStockMoveTipoForLineKind(lineKind),
      quantidade: qty,
      referencia_id: vendaId,
      motivo: isRental ? 'cancelamento_aluguel' : motivo,
      usuario_id: usuarioId,
      academy_id: academyId || itemStock.academy_id || null,
      movement_kind: isRental ? 'rental' : 'return',
      sale_id: vendaId,
      sale_item_id: it.$id || null,
      lead_id: venda?.aluno_id || null,
      product_id: itemStock.product_id || null,
      unit_price: unitPrice > 0 ? roundMoney(unitPrice) : null,
      line_total: unitPrice > 0 ? roundMoney(unitPrice * qty) : null,
      payment_status_at_move: 'cancelled',
      usuario_name: usuarioName || null,
      notes: String(motivo || '').trim().slice(0, 512) || null,
      source: 'pos',
    };

    const moveDoc = await createStockMoveDocument(databases, {
      dbId,
      stockMovesCol,
      payload: movePayload,
    });
    if (!moveDoc) {
      const err = new Error('stock_move_create_failed');
      err.code = 'stock_move_create_failed';
      err.stockId = stockId;
      throw err;
    }

    revertedItems.push({
      item_estoque_id: stockId,
      display_label: it.display_label || itemDisplayName(itemStock),
      quantidade: qty,
    });
  }

  return revertedItems;
}

/**
 * Garante que o estoque da venda cancelada foi devolvido (idempotente).
 */
export async function ensureSaleCancelStockRestored(
  databases,
  {
    dbId,
    vendaId,
    venda,
    academyId,
    motivo = 'cancelamento_venda',
    usuarioId = '',
    usuarioName = '',
  }
) {
  const existingMoves = await listCancelStockMovesForSale(databases, dbId, vendaId);
  if (existingMoves.length) {
    return { restored: false, already_done: true, items: [], moves: existingMoves.length };
  }

  const { items, source } = await listSaleItemsForCancel(databases, dbId, vendaId, venda);
  if (!items.length) {
    const snapHint = String(venda?.itens_snapshot_json || '');
    const looksLikeHadItems =
      snapHint.includes('item_estoque') ||
      snapHint.includes('product_variant') ||
      Number(venda?.itens_count || 0) > 0;
    if (looksLikeHadItems) {
      const err = new Error('no_sale_items');
      err.code = 'no_sale_items';
      err.source = source;
      throw err;
    }
    console.warn(
      JSON.stringify({
        level: 'warn',
        action: 'sales_cancel_stock_no_items',
        venda_id: vendaId,
        academy_id: academyId,
      })
    );
    return { restored: false, already_done: false, items: [], items_source: 'empty' };
  }

  const reverted = await revertSaleItemsStock(databases, {
    dbId,
    itens: items,
    venda,
    vendaId,
    academyId,
    motivo,
    usuarioId,
    usuarioName,
  });

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'sales_cancel_stock_restored',
      venda_id: vendaId,
      academy_id: academyId,
      items_source: source,
      items_count: reverted.length,
    })
  );

  return { restored: true, already_done: false, items: reverted, items_source: source };
}
