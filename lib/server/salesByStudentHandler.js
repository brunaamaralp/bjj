import { apiErro, logApiError } from './friendlyError.js';
import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { enrichSaleItemsBatch } from './reportBatchResolve.js';
import { formatItemsSummary, formatSaleIdShort } from '../../src/lib/salesHistory.js';
import { channelLabel } from '../../src/lib/salesSettings.js';
import { formatSalePaymentHistoryLabel } from '../../src/lib/salePayments.js';
import { filterSalesForAcademy } from './saleAcademyScope.js';

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
const FINANCIAL_TX_COL =
  process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID ||
  process.env.FINANCIAL_TX_COL ||
  '';

const SALE_REVENUE_TX_TYPES = new Set(['product', 'rental']);

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function listSaleItems(vendaId) {
  const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
    Query.equal('venda_id', vendaId),
    Query.limit(500),
  ]);
  return res.documents || [];
}

function mapSaleDoc(doc, items, financialTxId = '') {
  const status = String(doc.status || '').toLowerCase();
  const firstLabel = items[0]?.display_label;
  return {
    id: doc.$id,
    academyId: doc.academyId,
    aluno_id: doc.aluno_id || null,
    cliente_nome: doc.cliente_nome || null,
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
    created_at: doc.$createdAt || doc.created_at || null,
    id_short: formatSaleIdShort(doc.$id),
    financial_tx_id: financialTxId,
    items_summary: formatItemsSummary(items, firstLabel),
    items,
  };
}

async function loadFinancialTxIdsForSales(academyId, saleIds) {
  if (!FINANCIAL_TX_COL || !saleIds.length) return new Map();
  const wanted = new Set(saleIds);
  const txBySale = new Map();
  try {
    const queries = [Query.limit(Math.min(500, saleIds.length * 3))];
    if (academyId) queries.unshift(Query.equal('academyId', academyId));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    for (const tx of res.documents || []) {
      const saleId = String(tx.saleId || tx.origin_id || '').trim();
      if (!wanted.has(saleId) || txBySale.has(saleId)) continue;
      const type = String(tx.type || '').toLowerCase();
      const origin = String(tx.origin_type || '').toLowerCase();
      if (type === 'stock_purchase') continue;
      if (SALE_REVENUE_TX_TYPES.has(type) || origin === 'sale') {
        txBySale.set(saleId, tx.$id);
      }
    }
  } catch {
    return new Map();
  }
  return txBySale;
}

export default async function salesByStudentHandler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }
  if (!DB_ID || !SALES_COL || !SALE_ITEMS_COL) {
    return json(res, 503, { sucesso: false, erro: 'Vendas não configuradas no servidor' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const alunoId = String(req.query.aluno_id || req.query.lead_id || '').trim();
  if (!alunoId) {
    return json(res, 400, { sucesso: false, erro: 'aluno_id obrigatório' });
  }

  const includeCancelled = ['true', '1', 'yes'].includes(
    String(req.query.include_cancelled || '').trim().toLowerCase()
  );
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 50));

  try {
    const queries = [
      Query.equal('aluno_id', alunoId),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
    ];
    let raw;
    try {
      queries.unshift(Query.equal('academyId', academyId));
      raw = await databases.listDocuments(DB_ID, SALES_COL, queries);
    } catch {
      raw = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.equal('aluno_id', alunoId),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
      ]);
    }

    let docs = filterSalesForAcademy(raw.documents || [], academyId);

    if (!includeCancelled) {
      docs = docs.filter((d) => {
        const st = String(d.status || '').toLowerCase();
        return st === 'concluida' || st === 'pendente';
      });
    }

    const itemsBySale = new Map();
    for (const doc of docs) {
      const itemDocs = await listSaleItems(doc.$id);
      itemsBySale.set(doc.$id, itemDocs);
    }
    const allItemDocs = [...itemsBySale.values()].flat();
    const enrichedAll = await enrichSaleItemsBatch(databases, DB_ID, academyId, allItemDocs);
    let idx = 0;
    const saleIds = docs.map((d) => d.$id);
    const txBySale = await loadFinancialTxIdsForSales(academyId, saleIds);
    const sales = [];
    for (const doc of docs) {
      const rawItems = itemsBySale.get(doc.$id) || [];
      const items = enrichedAll.slice(idx, idx + rawItems.length);
      idx += rawItems.length;
      sales.push(mapSaleDoc(doc, items, txBySale.get(doc.$id) || ''));
    }

    return json(res, 200, { sucesso: true, sales });
  } catch (e) {
    console.error('[salesByStudent]', e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}
