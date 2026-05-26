import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { itemDisplayName, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { productDisplayLabel } from '../../src/lib/stockProducts.js';
import { resolveStockDocument, PRODUCT_VARIANTS_COL } from './productCatalogDb.js';
import {
  formatItemsSummary,
  formatSaleIdShort,
  parsePeriodBounds,
  resolveClientName,
} from '../../src/lib/salesHistory.js';
import { channelLabel, paymentLabel } from '../../src/lib/salesSettings.js';
import { formatSalePaymentHistoryLabel } from '../../src/lib/salePayments.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function listAcademySalesPage(academyId, { from, to, limit = 50, cursor = null }) {
  const pageLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
  const queries = [
    Query.equal('academyId', academyId),
    Query.orderDesc('$createdAt'),
    Query.limit(pageLimit),
  ];
  if (from) queries.push(Query.greaterThanEqual('$createdAt', from.toISOString()));
  if (to) queries.push(Query.lessThanEqual('$createdAt', to.toISOString()));
  if (cursor) queries.push(Query.cursorAfter(cursor));

  let res;
  try {
    res = await databases.listDocuments(DB_ID, SALES_COL, queries);
  } catch (e) {
    const fallback = [Query.limit(pageLimit), Query.orderDesc('$createdAt')];
    if (cursor) fallback.push(Query.cursorAfter(cursor));
    res = await databases.listDocuments(DB_ID, SALES_COL, fallback);
  }

  const docs = (res.documents || []).filter(
    (d) => !d.academyId || String(d.academyId) === academyId
  );
  const lastId = docs.length ? docs[docs.length - 1].$id : null;
  return {
    docs,
    next_cursor: docs.length === pageLimit && lastId ? lastId : null,
    has_more: docs.length === pageLimit && Boolean(lastId),
  };
}

async function listSaleItems(vendaId) {
  const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
    Query.equal('venda_id', vendaId),
    Query.limit(500),
  ]);
  return res.documents || [];
}

async function loadLeadNames(leadIds) {
  const map = {};
  const unique = [...new Set(leadIds.filter(Boolean))];
  for (const id of unique) {
    const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
    let resolved = false;
    for (const col of cols) {
      try {
        const doc = await databases.getDocument(DB_ID, col, id);
        map[id] = String(doc.name || doc.nome || '').trim() || id;
        resolved = true;
        break;
      } catch {
        /* next */
      }
    }
    if (!resolved) map[id] = id;
  }
  return map;
}

function fallbackStockIdTruncated(id) {
  const s = String(id || '').trim();
  if (!s) return 'Item';
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

/** Rótulo de linha de venda: variante → pai · tamanho; senão legado STOCK_ITEMS. */
async function resolveSaleItemDisplayLabel(stockItemId) {
  const id = String(stockItemId || '').trim();
  if (!id) return 'Item';

  const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, id);
  if (resolved?.collection === PRODUCT_VARIANTS_COL) {
    const parentName =
      String(resolved.parent?.nome || '').trim() ||
      itemDisplayName(resolved.doc) ||
      '';
    const size = String(resolved.doc?.size ?? resolved.doc?.Tamanho ?? '').trim();
    const color = String(resolved.doc?.color ?? '').trim();
    const variantPart = variantInventoryLabel({ size, color, Tamanho: size });
    if (parentName && variantPart && variantPart !== 'Único') {
      return `${parentName} · ${variantPart}`;
    }
    if (parentName) return parentName;
    if (variantPart && variantPart !== 'Único') return variantPart;
  }

  if (resolved?.doc) {
    const label = productDisplayLabel(resolved.doc) || itemDisplayName(resolved.doc);
    if (label && label !== 'Item') return label;
  }

  if (STOCK_ITEMS_COL) {
    try {
      const stock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, id);
      const label = productDisplayLabel(stock) || itemDisplayName(stock);
      if (label && label !== 'Item') return label;
    } catch {
      void 0;
    }
  }

  return fallbackStockIdTruncated(id);
}

async function enrichSaleItems(itemDocs) {
  const items = [];
  for (const it of itemDocs) {
    const stockId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    const label = stockId
      ? await resolveSaleItemDisplayLabel(stockId)
      : itemDisplayName({ nome: it.nome }) || 'Item';
    const qty = Number(it.quantidade) || 0;
    const unit = Number(it.preco_unitario) || 0;
    items.push({
      item_estoque_id: it.item_estoque_id,
      display_label: label,
      quantidade: qty,
      preco_unitario: unit,
      subtotal: Math.round(qty * unit * 100) / 100,
    });
  }
  return items;
}

async function loadStockLabelsForFirstItems(itemsBySale) {
  const map = {};
  const ids = new Set();
  for (const docs of itemsBySale.values()) {
    const first = docs[0];
    const sid = String(first?.product_variant_id || first?.item_estoque_id || '').trim();
    if (sid) ids.add(sid);
  }
  for (const id of ids) {
    map[id] = await resolveSaleItemDisplayLabel(id);
  }
  return map;
}

function buildListItemsSummary(itemDocs, stockLabels) {
  if (!itemDocs.length) return '—';
  const firstId = String(itemDocs[0].item_estoque_id || '');
  const first = stockLabels[firstId] || 'Item';
  if (itemDocs.length === 1) return first;
  const rest = itemDocs.length - 1;
  return `${first} + ${rest} outro${rest > 1 ? 's' : ''}`;
}

function mapSaleDoc(doc, items, leadNames, itemsSummaryOverride = null) {
  const status = String(doc.status || '').toLowerCase();
  const client_name = resolveClientName(
    {
      cliente_nome: doc.cliente_nome,
      aluno_id: doc.aluno_id,
    },
    leadNames
  );
  const firstLabel = items[0]?.display_label;
  return {
    id: doc.$id,
    academyId: doc.academyId,
    aluno_id: doc.aluno_id || null,
    cliente_nome: doc.cliente_nome || null,
    cliente_telefone: doc.cliente_telefone || null,
    total: Number(doc.total) || 0,
    forma_pagamento: doc.forma_pagamento || '',
    payment_label: formatSalePaymentHistoryLabel({
      forma_pagamento: doc.forma_pagamento,
      pagamentos_json: doc.pagamentos_json,
    }),
    canal: doc.canal || 'presencial',
    canal_label: channelLabel(doc.canal),
    status,
    cancelada_em: doc.cancelada_em || null,
    cancel_motivo: doc.cancel_motivo || null,
    created_at: doc.$createdAt || doc.created_at || null,
    id_short: formatSaleIdShort(doc.$id),
    client_name,
    items_summary: itemsSummaryOverride ?? formatItemsSummary(items, firstLabel),
    items,
  };
}

export default async function salesHistoryHandler(req, res) {
  if (!DB_ID || !SALES_COL || !SALE_ITEMS_COL) {
    return json(res, 503, { sucesso: false, erro: 'Vendas não configuradas no servidor' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const saleId = String(req.query.id || req.query.sale_id || '').trim();

  if (req.method === 'GET' && saleId) {
    try {
      const doc = await databases.getDocument(DB_ID, SALES_COL, saleId);
      if (doc.academyId && String(doc.academyId) !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
      }
      const itemDocs = await listSaleItems(saleId);
      const items = await enrichSaleItems(itemDocs);
      const leadNames = doc.aluno_id
        ? await loadLeadNames([doc.aluno_id])
        : {};
      return json(res, 200, { sucesso: true, sale: mapSaleDoc(doc, items, leadNames) });
    } catch (e) {
      console.error('[sales] detail:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao carregar venda' });
    }
  }

  if (req.method === 'GET') {
    try {
      const fromStr = String(req.query.from || '').trim();
      const toStr = String(req.query.to || '').trim();
      const { from, to } = parsePeriodBounds(fromStr, toStr);
      const cursor = String(req.query.cursor || '').trim();
      const limitRaw = Number(req.query.limit);
      const pageLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 50;

      const { docs: inPeriod, next_cursor, has_more } = await listAcademySalesPage(academyId, {
        from,
        to,
        limit: pageLimit,
        cursor: cursor || null,
      });

      const itemsBySale = new Map();
      for (const doc of inPeriod) {
        const itemDocs = await listSaleItems(doc.$id);
        itemsBySale.set(doc.$id, itemDocs);
      }

      const leadIds = inPeriod.map((d) => d.aluno_id).filter(Boolean);
      const leadNames = await loadLeadNames(leadIds);
      const stockLabels = await loadStockLabelsForFirstItems(itemsBySale);

      const sales = inPeriod.map((doc) => {
        const itemDocs = itemsBySale.get(doc.$id) || [];
        const summary = buildListItemsSummary(itemDocs, stockLabels);
        return mapSaleDoc(doc, [], leadNames, summary);
      });

      return json(res, 200, { sucesso: true, sales, next_cursor, has_more });
    } catch (e) {
      console.error('[sales] list:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar vendas' });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
