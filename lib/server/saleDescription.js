/**
 * Monta descrição legível de vendas para FINANCIAL_TX.planName.
 */
import { Query } from 'node-appwrite';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import { variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { PRODUCT_VARIANTS_COL, resolveStockDocument } from './productCatalogDb.js';

const DEFAULT_DESCRIPTION = 'Venda de produtos';

export function formatSaleDescriptionPart(label, quantity) {
  const name = String(label || '').trim();
  if (!name) return '';
  const q = Math.trunc(Number(quantity) || 1);
  return q > 1 ? `${name} x${q}` : name;
}

export function descriptionFromSnapshotLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  const parts = lines
    .map((line) => formatSaleDescriptionPart(line.label, line.quantidade))
    .filter(Boolean);
  return parts.join(', ');
}

export function descriptionFromSnapshotJson(json) {
  if (!json) return '';
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return descriptionFromSnapshotLines(parsed);
  } catch {
    return '';
  }
}

export function stockItemLabelFromResolved(resolved) {
  if (!resolved?.doc) return 'Produto';
  const stock = resolved.doc;
  const parentName = String(resolved.parent?.nome || itemDisplayName(stock) || '').trim() || 'Produto';
  if (resolved.collection === PRODUCT_VARIANTS_COL) {
    return `${parentName} · ${variantInventoryLabel({
      size: stock.size,
      color: stock.color,
      Tamanho: stock.Tamanho,
    })}`;
  }
  return parentName;
}

export async function buildDescriptionFromSale(
  vendaId,
  { databases, dbId, saleItemsCol, stockItemsCol }
) {
  if (!saleItemsCol || !vendaId) return DEFAULT_DESCRIPTION;
  try {
    const items = await databases.listDocuments(dbId, saleItemsCol, [
      Query.equal('venda_id', vendaId),
      Query.limit(50),
    ]);
    const parts = [];
    for (const it of items.documents || []) {
      const stockId = String(it.item_estoque_id || it.product_variant_id || '').trim();
      let name = 'Produto';
      if (stockId && stockItemsCol) {
        const resolved = await resolveStockDocument(databases, dbId, stockItemsCol, stockId);
        if (resolved) name = stockItemLabelFromResolved(resolved);
      }
      const part = formatSaleDescriptionPart(name, it.quantidade);
      if (part) parts.push(part);
    }
    return parts.join(', ') || DEFAULT_DESCRIPTION;
  } catch {
    return DEFAULT_DESCRIPTION;
  }
}

/** Preferência: snapshot da venda (labels na criação) → itens da venda + catálogo. */
export async function resolveSaleDescription(
  saleDoc,
  { databases, dbId, saleItemsCol, stockItemsCol }
) {
  const fromSnapshot = descriptionFromSnapshotJson(saleDoc?.itens_snapshot_json);
  if (fromSnapshot) return fromSnapshot;
  const vendaId = String(saleDoc?.$id || saleDoc?.id || '').trim();
  if (!vendaId) return DEFAULT_DESCRIPTION;
  return buildDescriptionFromSale(vendaId, { databases, dbId, saleItemsCol, stockItemsCol });
}
