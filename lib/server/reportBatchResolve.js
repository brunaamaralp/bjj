/**
 * Resolução em batch para relatórios (uma listagem por collection, sem N+1).
 */
import { Client, Query, Users } from 'node-appwrite';
import {
  resolveStockDocument,
  PRODUCTS_COL,
  PRODUCT_VARIANTS_COL,
  isParentVariantCatalogEnabled,
} from './productCatalogDb.js';
import { itemDisplayName, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { productDisplayLabel } from '../../src/lib/stockProducts.js';

const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const usersApiSingleton = API_KEY
  ? new Users(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY))
  : null;

async function listAllDocuments(databases, dbId, col, baseQueries = []) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [...baseQueries, Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, col, queries);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

/** @returns {Map<string, string>} id → display name */
export async function loadPersonNamesByIds(databases, dbId, ids) {
  const want = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!want.length) return map;

  const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
  for (const id of want) {
    let resolved = false;
    for (const col of cols) {
      try {
        const doc = await databases.getDocument(dbId, col, id);
        map.set(id, String(doc.name || doc.nome || '').trim() || id);
        resolved = true;
        break;
      } catch {
        void 0;
      }
    }
    if (!resolved) map.set(id, id);
  }
  return map;
}

/** @returns {Map<string, { nome: string, telefone: string }>} */
export async function loadPersonsByIds(databases, dbId, ids) {
  const want = new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean));
  const map = new Map();
  if (!want.size) return map;

  const fill = (doc) => {
    const id = doc.$id;
    if (!want.has(id)) return;
    map.set(id, {
      nome: String(doc.name || doc.nome || '').trim() || id,
      telefone: String(doc.phone || doc.telefone || doc.cliente_telefone || '').trim(),
    });
  };

  if (STUDENTS_COL) {
    try {
      const docs = await listAllDocuments(databases, dbId, STUDENTS_COL, []);
      for (const d of docs) fill(d);
    } catch {
      void 0;
    }
  }
  if (LEADS_COL && map.size < want.size) {
    try {
      const docs = await listAllDocuments(databases, dbId, LEADS_COL, []);
      for (const d of docs) {
        if (!map.has(d.$id)) fill(d);
      }
    } catch {
      void 0;
    }
  }
  for (const id of want) {
    if (!map.has(id)) map.set(id, { nome: id, telefone: '' });
  }
  return map;
}

/** @returns {Map<string, string>} product id → name */
export async function loadProductNamesByIds(databases, dbId, ids) {
  const want = new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean));
  const map = new Map();
  if (!want.size || !PRODUCTS_COL) return map;

  try {
    const docs = await listAllDocuments(databases, dbId, PRODUCTS_COL, []);
    for (const d of docs) {
      if (!want.has(d.$id)) continue;
      map.set(d.$id, String(d.name || d.nome || '').trim());
    }
  } catch {
    void 0;
  }
  for (const id of want) {
    if (!map.has(id)) map.set(id, '');
  }
  return map;
}

/** @returns {Map<string, object>} sale id → sale doc */
export async function loadSalesByIds(databases, dbId, ids) {
  const want = new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean));
  const map = new Map();
  if (!want.size || !SALES_COL) return map;

  try {
    const docs = await listAllDocuments(databases, dbId, SALES_COL, [Query.orderDesc('$createdAt')]);
    for (const d of docs) {
      if (!want.has(d.$id)) continue;
      map.set(d.$id, d);
    }
  } catch {
    void 0;
  }
  return map;
}

/**
 * @returns {Map<string, { product_name, variant_size, variant_color, sku, product_id }>}
 */
export async function loadStockMetaByIds(databases, dbId, academyId, itemIds) {
  const want = new Set((itemIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const map = new Map();
  if (!want.size) return map;

  if (isParentVariantCatalogEnabled() && PRODUCT_VARIANTS_COL) {
    const queries = [Query.limit(500)];
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      void 0;
    }
    let variants = [];
    try {
      const res = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, queries);
      variants = res.documents || [];
    } catch {
      variants = await listAllDocuments(databases, dbId, PRODUCT_VARIANTS_COL, []);
      variants = variants.filter((d) => !d.academy_id || String(d.academy_id) === academyId);
    }

    const parentIds = new Set();
    for (const d of variants) {
      if (!want.has(d.$id)) continue;
      const pid = String(d.product_id || '').trim();
      if (pid) parentIds.add(pid);
    }
    const parentNames = await loadProductNamesByIds(databases, dbId, [...parentIds]);

    for (const d of variants) {
      if (!want.has(d.$id)) continue;
      const pid = String(d.product_id || '').trim();
      map.set(d.$id, {
        product_id: pid,
        product_name: parentNames.get(pid) || itemDisplayName(d),
        variant_size: String(d.size ?? d.Tamanho ?? '').trim(),
        variant_color: String(d.color ?? '').trim(),
        sku: String(d.sku || '').trim(),
      });
    }
  }

  if (map.size < want.size && STOCK_ITEMS_COL) {
    const queries = [Query.limit(500)];
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      void 0;
    }
    let items = [];
    try {
      const res = await databases.listDocuments(dbId, STOCK_ITEMS_COL, queries);
      items = res.documents || [];
    } catch {
      items = await listAllDocuments(databases, dbId, STOCK_ITEMS_COL, []);
      items = items.filter((d) => !d.academy_id || String(d.academy_id) === academyId);
    }
    for (const d of items) {
      if (!want.has(d.$id) || map.has(d.$id)) continue;
      map.set(d.$id, {
        product_id: '',
        product_name: productDisplayLabel(d) || itemDisplayName(d),
        variant_size: String(d.Tamanho ?? d.tamanho ?? d.size ?? '').trim(),
        variant_color: String(d.color ?? '').trim(),
        sku: String(d.sku || '').trim(),
      });
    }
  }

  for (const id of want) {
    if (map.has(id)) continue;
    map.set(id, {
      product_id: '',
      product_name: 'Produto removido',
      variant_size: '',
      variant_color: '',
      sku: '',
    });
  }
  return map;
}

/** @returns {Map<string, string>} userId → display name */
export async function loadOperatorNames(docs, usuarioIds) {
  const map = new Map();
  const want = new Set((usuarioIds || []).map((id) => String(id || '').trim()).filter(Boolean));

  for (const doc of docs || []) {
    const uid = String(doc.usuario_id || '').trim();
    const stored = String(doc.usuario_name || '').trim();
    if (uid && stored) map.set(uid, stored);
  }

  if (!usersApiSingleton) return map;

  const missing = [...want].filter((id) => !map.has(id));
  await Promise.all(
    missing.map(async (uid) => {
      try {
        const u = await usersApiSingleton.get({ userId: uid });
        map.set(uid, String(u.name || u.email || '').trim() || uid);
      } catch {
        map.set(uid, uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid);
      }
    })
  );
  return map;
}

function fallbackStockIdTruncated(id) {
  const s = String(id || '').trim();
  if (!s) return 'Item';
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export function saleItemDisplayLabelFromMeta(stockId, meta) {
  const m = meta?.get?.(stockId) || meta;
  if (!m) return fallbackStockIdTruncated(stockId);
  const size = m.variant_size || '';
  const color = m.variant_color || '';
  const variantPart = variantInventoryLabel({ size, color, Tamanho: size });
  const parent = String(m.product_name || '').trim();
  if (parent && variantPart && variantPart !== 'Único') return `${parent} · ${variantPart}`;
  if (parent) return parent;
  if (variantPart && variantPart !== 'Único') return variantPart;
  return parent || fallbackStockIdTruncated(stockId);
}

/** Enriquece linhas de venda sem N+1. */
export async function enrichSaleItemsBatch(databases, dbId, academyId, itemDocs) {
  const stockIds = (itemDocs || [])
    .map((it) => String(it.product_variant_id || it.item_estoque_id || '').trim())
    .filter(Boolean);
  const meta = await loadStockMetaByIds(databases, dbId, academyId, stockIds);

  return (itemDocs || []).map((it) => {
    const stockId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    const label = stockId
      ? saleItemDisplayLabelFromMeta(stockId, meta)
      : itemDisplayName({ nome: it.nome }) || 'Item';
    const qty = Number(it.quantidade) || 0;
    const unit = Number(it.preco_unitario) || 0;
    return {
      id: it.$id,
      item_estoque_id: it.item_estoque_id,
      line_kind: it.line_kind || 'sale',
      display_label: label,
      quantidade: qty,
      preco_unitario: unit,
      subtotal: Math.round(qty * unit * 100) / 100,
    };
  });
}
