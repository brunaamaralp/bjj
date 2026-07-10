import { apiErro } from './friendlyError.js';
import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import {
  formatItemsSummary,
  formatSaleIdShort,
  itemsSummaryFromSnapshot,
  parsePeriodBounds,
  resolveClientName,
} from '../../src/lib/salesHistory.js';
import { channelLabel } from '../../src/lib/salesSettings.js';
import { saleBelongsToAcademy } from './saleAcademyScope.js';
import { formatSalePaymentHistoryLabel, parsePagamentosJson, salePaidAmountNet, saleRemainingAmount } from '../../src/lib/salePayments.js';
import { generateSaleReceiptPdfBuffer } from '../receipts/saleReceiptPdf.js';
import {
  enrichSaleItemsBatch,
  loadStockMetaByIds,
  saleItemDisplayLabelFromMeta,
} from './reportBatchResolve.js';

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
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

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

/** Uma query (ou fallback paralelo) para itens de várias vendas. */
async function listSaleItemsForSales(vendaIds) {
  const map = new Map();
  const ids = [...new Set((vendaIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  for (const id of ids) map.set(id, []);

  if (!ids.length) return map;

  try {
    const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      Query.equal('venda_id', ids),
      Query.limit(Math.min(500, ids.length * 20)),
    ]);
    for (const it of res.documents || []) {
      const vid = String(it.venda_id || '').trim();
      if (!map.has(vid)) map.set(vid, []);
      map.get(vid).push(it);
    }
    return map;
  } catch {
    await Promise.all(
      ids.map(async (id) => {
        map.set(id, await listSaleItems(id));
      })
    );
    return map;
  }
}

async function resolveLeadName(id) {
  const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
  for (const col of cols) {
    try {
      const doc = await databases.getDocument(DB_ID, col, id);
      return String(doc.name || doc.nome || '').trim() || id;
    } catch {
      void 0;
    }
  }
  return id;
}

async function loadLeadNames(leadIds) {
  const unique = [...new Set(leadIds.filter(Boolean))];
  if (!unique.length) return {};
  const pairs = await Promise.all(
    unique.map(async (id) => [id, await resolveLeadName(id)])
  );
  return Object.fromEntries(pairs);
}

async function enrichSaleItems(itemDocs, academyId) {
  return enrichSaleItemsBatch(databases, DB_ID, academyId, itemDocs);
}

async function loadStockLabelsForFirstItems(itemsBySale, academyId) {
  const stockIds = new Set();
  for (const docs of itemsBySale.values()) {
    const first = docs[0];
    const sid = String(first?.product_variant_id || first?.item_estoque_id || '').trim();
    if (sid) stockIds.add(sid);
  }
  if (!stockIds.size) return {};

  const meta = await loadStockMetaByIds(databases, DB_ID, academyId, [...stockIds]);
  const map = {};
  for (const id of stockIds) {
    map[id] = saleItemDisplayLabelFromMeta(id, meta);
  }
  return map;
}

function buildListItemsSummary(itemDocs, stockLabels) {
  if (!itemDocs.length) return '—';
  const firstStockId = String(
    itemDocs[0]?.product_variant_id || itemDocs[0]?.item_estoque_id || ''
  ).trim();
  const first = stockLabels[firstStockId] || 'Item';
  if (itemDocs.length === 1) return first;
  const rest = itemDocs.length - 1;
  return `${first} + ${rest} outro${rest > 1 ? 's' : ''}`;
}

function mapFinancialTxRow(doc) {
  return {
    id: doc.$id,
    type: String(doc.type || '').trim(),
    status: String(doc.status || '').trim().toLowerCase(),
    net: Number(doc.net) || 0,
    gross: Number(doc.gross) || 0,
    description: String(doc.description || doc.notes || '').trim(),
    settledAt: doc.settledAt || null,
  };
}

async function listSaleFinancialTx(vendaId) {
  if (!FINANCIAL_TX_COL || !vendaId) return [];
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('saleId', vendaId),
      Query.limit(25),
    ]);
    return (res.documents || []).map(mapFinancialTxRow);
  } catch {
    return [];
  }
}

function mapSaleDoc(doc, items, leadNames, itemsSummaryOverride = null, financialTxs = []) {
  const status = String(doc.status || '').toLowerCase();
  const client_name = resolveClientName(
    {
      cliente_nome: doc.cliente_nome,
      aluno_id: doc.aluno_id,
    },
    leadNames
  );
  const firstLabel = items[0]?.display_label;
  const paidAmount = salePaidAmountNet(doc.pagamentos_json);
  const total = Number(doc.total) || 0;
  return {
    id: doc.$id,
    academyId: doc.academyId,
    aluno_id: doc.aluno_id || null,
    cliente_nome: doc.cliente_nome || null,
    cliente_telefone: doc.cliente_telefone || null,
    total,
    paid_amount: paidAmount,
    remaining_amount: saleRemainingAmount(total, paidAmount),
    forma_pagamento: doc.forma_pagamento || '',
    payment_label: formatSalePaymentHistoryLabel({
      forma_pagamento: doc.forma_pagamento,
      pagamentos_json: doc.pagamentos_json,
    }),
    canal: doc.canal || 'presencial',
    canal_label: channelLabel(doc.canal),
    status,
    deferred: doc.deferred === true,
    due_date: doc.due_date || null,
    cancelada_em: doc.cancelada_em || null,
    cancel_motivo: doc.cancel_motivo || null,
    created_at: doc.$createdAt || doc.created_at || null,
    id_short: formatSaleIdShort(doc.$id),
    client_name,
    items_summary: itemsSummaryOverride ?? formatItemsSummary(items, firstLabel),
    items,
    pagamentos: parsePagamentosJson(doc.pagamentos_json),
    financial_txs: financialTxs,
    pagamentos_json: doc.pagamentos_json || '[]',
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
      if (!saleBelongsToAcademy(doc, academyId)) {
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
      }
      const itemDocs = await listSaleItems(saleId);
      const items = await enrichSaleItems(itemDocs, academyId);
      const leadNames = doc.aluno_id
        ? await loadLeadNames([doc.aluno_id])
        : {};
      const financialTxs = await listSaleFinancialTx(saleId);

      const format = String(req.query.format || req.query.action || '').trim().toLowerCase();
      if (format === 'pdf' || format === 'receipt_pdf') {
        const status = String(doc.status || '').toLowerCase();
        if (status !== 'concluida') {
          return json(res, 400, {
            sucesso: false,
            erro: 'Comprovante PDF disponível apenas para vendas concluídas',
          });
        }
        if (!ACADEMIES_COL) {
          return json(res, 503, { sucesso: false, erro: 'Academia não configurada' });
        }
        const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const buffer = await generateSaleReceiptPdfBuffer(doc, items, leadNames, academyDoc);
        const idShort = formatSaleIdShort(doc.$id).replace('#', '');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="recibo-venda-${idShort}.pdf"`
        );
        return res.status(200).send(buffer);
      }

      return json(res, 200, { sucesso: true, sale: mapSaleDoc(doc, items, leadNames, null, financialTxs) });
    } catch (e) {
      console.error('[sales] detail:', e);
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
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

      const summaries = new Map();
      const docsNeedingItems = [];

      for (const doc of inPeriod) {
        const fromSnap = itemsSummaryFromSnapshot(doc);
        if (fromSnap) {
          summaries.set(doc.$id, fromSnap);
        } else {
          docsNeedingItems.push(doc);
        }
      }

      if (docsNeedingItems.length) {
        const itemsBySale = await listSaleItemsForSales(docsNeedingItems.map((d) => d.$id));
        const stockLabels = await loadStockLabelsForFirstItems(itemsBySale, academyId);
        for (const doc of docsNeedingItems) {
          const itemDocs = itemsBySale.get(doc.$id) || [];
          summaries.set(doc.$id, buildListItemsSummary(itemDocs, stockLabels));
        }
      }

      const leadIds = inPeriod.map((d) => d.aluno_id).filter(Boolean);
      const leadNames = await loadLeadNames(leadIds);

      const sales = inPeriod.map((doc) => {
        const summary = summaries.get(doc.$id) || '—';
        return mapSaleDoc(doc, [], leadNames, summary);
      });

      return json(res, 200, { sucesso: true, sales, next_cursor, has_more });
    } catch (e) {
      console.error('[sales] list:', e);
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}

export {
  listAcademySalesPage,
  listSaleItems,
  listSaleItemsForSales,
  enrichSaleItems,
  loadLeadNames,
  mapSaleDoc,
  buildListItemsSummary,
  loadStockLabelsForFirstItems,
};
