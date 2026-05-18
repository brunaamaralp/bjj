import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { itemDisplayName } from '../../src/lib/stockInventory.js';
import { productDisplayLabel } from '../../src/lib/stockProducts.js';
import { formatItemsSummary, formatSaleIdShort } from '../../src/lib/salesHistory.js';
import { channelLabel } from '../../src/lib/salesSettings.js';
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

function mapSaleDoc(doc, items) {
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
    items_summary: formatItemsSummary(items, firstLabel),
    items,
  };
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

    let docs = (raw.documents || []).filter(
      (d) => !d.academyId || String(d.academyId) === academyId
    );

    if (!includeCancelled) {
      docs = docs.filter((d) => String(d.status || '').toLowerCase() === 'concluida');
    }

    const sales = [];
    for (const doc of docs) {
      const itemDocs = await listSaleItems(doc.$id);
      const items = await enrichSaleItems(itemDocs);
      sales.push(mapSaleDoc(doc, items));
    }

    return json(res, 200, { sucesso: true, sales });
  } catch (e) {
    console.error('[salesByStudent]', e);
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar vendas do aluno' });
  }
}
