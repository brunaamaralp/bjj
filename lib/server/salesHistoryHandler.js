import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { itemDisplayName } from '../../src/lib/stockInventory.js';
import { productDisplayLabel } from '../../src/lib/stockProducts.js';
import {
  formatItemsSummary,
  formatSaleIdShort,
  parsePeriodBounds,
  resolveClientName,
  saleInPeriod,
} from '../../src/lib/salesHistory.js';
import { channelLabel, paymentLabel } from '../../src/lib/salesSettings.js';

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

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function listAcademySales(academyId) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderDesc('$createdAt')];
    try {
      queries.unshift(Query.equal('academyId', academyId));
    } catch {
      void 0;
    }
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, SALES_COL, queries);
    } catch {
      res = await databases.listDocuments(DB_ID, SALES_COL, [Query.limit(PAGE), Query.orderDesc('$createdAt')]);
    }
    const batch = (res.documents || []).filter(
      (d) => !d.academyId || String(d.academyId) === academyId
    );
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
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
    try {
      const doc = await databases.getDocument(DB_ID, LEADS_COL, id);
      map[id] = String(doc.name || doc.nome || '').trim() || id;
    } catch {
      map[id] = id;
    }
  }
  return map;
}

async function enrichSaleItems(itemDocs) {
  const items = [];
  for (const it of itemDocs) {
    let label = String(it.item_estoque_id || '').slice(-6);
    try {
      const stock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
      label = productDisplayLabel(stock);
    } catch {
      label = itemDisplayName({ nome: it.nome }) || label;
    }
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
    if (first?.item_estoque_id) ids.add(String(first.item_estoque_id));
  }
  for (const id of ids) {
    try {
      const stock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, id);
      map[id] = productDisplayLabel(stock);
    } catch {
      map[id] = 'Item';
    }
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
    payment_label: paymentLabel(doc.forma_pagamento),
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

      const rawSales = await listAcademySales(academyId);
      const inPeriod = rawSales.filter((d) => saleInPeriod({ ...d, created_at: d.$createdAt }, from, to));

      const itemsBySale = new Map();
      if (inPeriod.length > 0) {
        const allItems = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [Query.limit(500)]);
        for (const it of allItems.documents || []) {
          const vid = String(it.venda_id || '');
          if (!itemsBySale.has(vid)) itemsBySale.set(vid, []);
          itemsBySale.get(vid).push(it);
        }
      }

      const leadIds = inPeriod.map((d) => d.aluno_id).filter(Boolean);
      const leadNames = await loadLeadNames(leadIds);
      const stockLabels = await loadStockLabelsForFirstItems(itemsBySale);

      const sales = inPeriod.map((doc) => {
        const itemDocs = itemsBySale.get(doc.$id) || [];
        const summary = buildListItemsSummary(itemDocs, stockLabels);
        return mapSaleDoc(doc, [], leadNames, summary);
      });

      return json(res, 200, { sucesso: true, sales });
    } catch (e) {
      console.error('[sales] list:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar vendas' });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
