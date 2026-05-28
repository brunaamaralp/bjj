/**
 * GET /api/reports/by-student?lead_id= — extrato unificado (produtos + mensalidades).
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { roundMoney } from './salePayments.js';
import { enrichSaleItemsBatch } from './reportBatchResolve.js';
import { formatReferenceMonthLong } from '../../src/lib/bundleCoverage.js';
import { formatSalePaymentHistoryLabel } from '../../src/lib/salePayments.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

function json(res, status, body) {
  res.status(status).json(body);
}

async function listSalesForLead(academyId, leadId) {
  if (!SALES_COL) return [];
  const queries = [Query.limit(500), Query.orderDesc('$createdAt')];
  try {
    queries.unshift(Query.equal('aluno_id', leadId));
  } catch {
    void 0;
  }
  let res;
  try {
    res = await databases.listDocuments(DB_ID, SALES_COL, queries);
  } catch {
    res = await databases.listDocuments(DB_ID, SALES_COL, [Query.limit(500)]);
  }
  return (res.documents || []).filter((d) => {
    const aid = String(d.academy_id || d.academyId || '');
    if (aid && aid !== academyId) return false;
    return String(d.aluno_id || '') === leadId;
  });
}

async function listPaymentsForLead(academyId, leadId) {
  if (!PAYMENTS_COL) return [];
  const queries = [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.limit(500),
    Query.orderDesc('$createdAt'),
  ];
  try {
    const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, queries);
    return res.documents || [];
  } catch {
    try {
      const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
        Query.equal('lead_id', leadId),
        Query.limit(500),
      ]);
      return (res.documents || []).filter((d) => String(d.academy_id || '') === academyId);
    } catch {
      return [];
    }
  }
}

async function listAllSaleItemsForSales(saleIds) {
  const want = new Set(saleIds);
  if (!want.size || !SALE_ITEMS_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(PAGE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, queries);
    const batch = (res.documents || []).filter((d) => want.has(String(d.venda_id || '')));
    all = all.concat(batch);
    if ((res.documents || []).length < PAGE) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return all;
}

function paymentDescription(p) {
  const cat = String(p.payment_category || 'plan').toLowerCase();
  const ref = String(p.reference_month || '').trim();
  if (cat === 'fee') return p.note || 'Taxa';
  if (ref && /^\d{4}-\d{2}$/.test(ref)) {
    return `Mensalidade ${formatReferenceMonthLong(ref)}`;
  }
  return p.note || 'Mensalidade';
}

function paymentAmount(p) {
  const st = String(p.status || '').toLowerCase();
  if (st === 'paid' || st === 'partial') {
    return Number(p.paid_amount ?? p.amount) || 0;
  }
  return Number(p.expected_amount ?? p.amount) || 0;
}

function mapPaymentStatus(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'pending' || s === 'awaiting') return 'pending';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'partial') return 'pending';
  return s || 'pending';
}

export default async function reportsByStudentHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, erro: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const leadId = String(req.query.lead_id || req.query.aluno_id || '').trim();
  if (!leadId) return json(res, 400, { ok: false, erro: 'lead_id obrigatório' });

  const [sales, payments] = await Promise.all([
    listSalesForLead(academyId, leadId),
    listPaymentsForLead(academyId, leadId),
  ]);

  const timeline = [];
  let total_gasto_produtos = 0;
  let total_pago_mensalidades = 0;
  let total_em_aberto = 0;
  const productDates = [];

  const saleIds = sales.map((s) => s.$id);
  const allSaleItems = await listAllSaleItemsForSales(saleIds);
  const enrichedAll = await enrichSaleItemsBatch(databases, DB_ID, academyId, allSaleItems);
  const itemsBySale = new Map();
  allSaleItems.forEach((doc, i) => {
    const vid = String(doc.venda_id || '');
    if (!itemsBySale.has(vid)) itemsBySale.set(vid, []);
    itemsBySale.get(vid).push(enrichedAll[i]);
  });

  for (const sale of sales) {
    const st = String(sale.status || '').toLowerCase();
    const items = itemsBySale.get(sale.$id) || [];
    const desc =
      items.map((it) => (it.quantidade > 1 ? `${it.display_label} ×${it.quantidade}` : it.display_label)).join(' + ') ||
      'Venda de produtos';
    const amount = Number(sale.total) || 0;
    const date = sale.$createdAt || sale.created_at;
    if (st === 'concluida') {
      total_gasto_produtos += amount;
      if (date) productDates.push(new Date(date).getTime());
    }
    timeline.push({
      date,
      type: 'product_sale',
      description: desc,
      amount: roundMoney(amount),
      method: formatSalePaymentHistoryLabel({
        forma_pagamento: sale.forma_pagamento,
        pagamentos_json: sale.pagamentos_json,
      }),
      status: st === 'cancelada' ? 'cancelled' : st === 'concluida' ? 'paid' : st,
      reference_id: sale.$id,
      operador_nome: String(sale.created_by_name || '').trim() || null,
      items,
    });
  }

  for (const p of payments) {
    const st = mapPaymentStatus(p.status);
    const amount = paymentAmount(p);
    const date = p.paid_at || p.due_date || p.$createdAt;
    if (st === 'paid') total_pago_mensalidades += Number(p.paid_amount ?? p.amount) || 0;
    else if (st === 'pending') total_em_aberto += amount;

    timeline.push({
      date,
      type: 'plan_payment',
      description: paymentDescription(p),
      amount: roundMoney(amount),
      method: String(p.method || p.payment_method || '').trim() || '—',
      status: st,
      reference_id: p.$id,
      operador_nome: String(p.created_by_name || p.registered_by_name || '').trim() || null,
    });
  }

  timeline.sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    return tb - ta;
  });

  productDates.sort((a, b) => a - b);

  return json(res, 200, {
    ok: true,
    lead_id: leadId,
    timeline,
    totals: {
      total_gasto_produtos: roundMoney(total_gasto_produtos),
      total_pago_mensalidades: roundMoney(total_pago_mensalidades),
      total_em_aberto: roundMoney(total_em_aberto),
      primeira_compra: productDates.length ? new Date(productDates[0]).toISOString() : null,
      ultima_compra: productDates.length
        ? new Date(productDates[productDates.length - 1]).toISOString()
        : null,
    },
  });
}
