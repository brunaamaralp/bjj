/**
 * GET /api/reports-light?type=finance|sales&from=&to=&regime=
 */
import { Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  ensureAcademyOwnerOrAdmin,
  isAcademyOwnerOrAdminUser,
  DB_ID,
  databases,
} from './academyAccess.js';
import { cacheKey, getCached, setCached, cacheMaxAgeSeconds } from './reportsLightCache.js';
import { listFinancialTxForPeriodWithMeta } from './financeTxQuery.js';
import { FINANCE_REGIME } from '../../src/lib/financeCompetence.js';
import { formatPaymentMethod } from '../../src/lib/paymentMethodLabels.js';
import { aggregateOperationalSummary } from './financeTxAggregate.js';
import { loadPersonNamesByIds } from './reportBatchResolve.js';
import { handleReportsOverviewGet } from './reportsOverviewHandler.js';

const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';

/** Relatórios que expõem dados financeiros — titular ou admin apenas. */
const FINANCE_REPORT_TYPES = new Set([
  'finance',
  'cashflow',
  'revenue',
  'expenses',
  'closing',
  'conciliation',
]);

function json(res, status, body, cacheHit = false) {
  res.setHeader('Cache-Control', `private, max-age=${cacheMaxAgeSeconds()}`);
  if (cacheHit) res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
  res.status(status).json(body);
}

export async function financeSummary(academyId, from, to, regime) {
  const { items: documents, truncated, totalInPeriod, maxCollect } =
    await listFinancialTxForPeriodWithMeta(academyId, { from, to, regime });
  const agg = aggregateOperationalSummary(documents);

  return {
    received: agg.received,
    expenses: agg.expenses,
    balance: agg.balance,
    receivedCount: agg.receivedCount,
    expenseCount: agg.expenseCount,
    truncated,
    totalLoaded: documents.length,
    totalInPeriod,
    maxCollect,
    regime,
    byMethod: Object.entries(agg.byMethod).map(([method, totalAmt]) => ({
      method,
      methodLabel: formatPaymentMethod(method),
      total: totalAmt,
    })),
  };
}

export async function salesSummary(academyId, from, to) {
  if (!SALES_COL) {
    return {
      concludedCount: 0,
      concludedTotal: 0,
      cancelCount: 0,
      byChannel: [],
      byProduct: [],
      byBuyer: [],
      truncated: false,
    };
  }
  const queries = [Query.equal('academy_id', academyId), Query.limit(500)];
  if (from) queries.push(Query.greaterThanEqual('$createdAt', new Date(`${from}T00:00:00`).toISOString()));
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    queries.push(Query.lessThan('$createdAt', d.toISOString()));
  }
  const list = await databases.listDocuments(DB_ID, SALES_COL, queries);
  const docs = list.documents || [];
  let concludedCount = 0;
  let concludedTotal = 0;
  let cancelCount = 0;
  const byChannel = {};
  const byBuyerMap = new Map();
  const concludedSaleIds = [];
  for (const s of docs) {
    const st = String(s.status || '').toLowerCase();
    if (st === 'concluida') {
      const amount = Number(s.total) || 0;
      concludedCount += 1;
      concludedTotal += amount;
      const canal = String(s.canal || 'presencial');
      byChannel[canal] = (byChannel[canal] || 0) + amount;
      concludedSaleIds.push(s.$id);

      const alunoId = String(s.aluno_id || '').trim();
      const clienteNome = String(s.cliente_nome || '').trim();
      const buyerKey = alunoId ? `s:${alunoId}` : clienteNome ? `c:${clienteNome.toLowerCase()}` : 'anon';
      const saleDate = s.$createdAt || s.created_at;
      const saleIso = saleDate ? new Date(saleDate).toISOString() : null;
      const prev = byBuyerMap.get(buyerKey) || {
        aluno_id: alunoId || null,
        cliente_nome: alunoId ? null : clienteNome || 'Cliente avulso',
        vendas: 0,
        total: 0,
        ultima_compra: null,
      };
      prev.vendas += 1;
      prev.total += amount;
      if (saleIso && (!prev.ultima_compra || saleIso > prev.ultima_compra)) {
        prev.ultima_compra = saleIso;
      }
      byBuyerMap.set(buyerKey, prev);
    } else if (st === 'cancelada') cancelCount += 1;
  }

  const byProductMap = new Map();
  if (SALE_ITEMS_COL && concludedSaleIds.length) {
    for (const vendaId of concludedSaleIds) {
      let items;
      try {
        items = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
          Query.equal('venda_id', vendaId),
          Query.limit(100),
        ]);
      } catch {
        continue;
      }
      for (const it of items.documents || []) {
        const productId = String(
          it.product_id || it.parent_product_id || it.product_variant_id || it.item_estoque_id || 'outros'
        ).trim();
        const label = String(it.display_label || it.nome || it.name || 'Produto').trim() || 'Produto';
        const qty = Math.max(0, Number(it.quantidade) || 0);
        const unit = Number(it.preco_unitario) || 0;
        const lineTotal = unit * qty;
        const prev = byProductMap.get(productId) || { product_id: productId, nome: label, qty: 0, total: 0 };
        prev.qty += qty;
        prev.total += lineTotal;
        if (!prev.nome && label) prev.nome = label;
        byProductMap.set(productId, prev);
      }
    }
  }

  const byProduct = [...byProductMap.values()]
    .map((r) => ({ product_id: r.product_id, nome: r.nome, qty: r.qty, total: r.total }))
    .sort((a, b) => b.total - a.total);

  const leadIds = [...byBuyerMap.values()].map((b) => b.aluno_id).filter(Boolean);
  const leadNames = await loadPersonNamesByIds(databases, DB_ID, leadIds);
  const byBuyer = [...byBuyerMap.values()]
    .map((b) => ({
      aluno_id: b.aluno_id,
      nome: b.aluno_id ? leadNames.get(b.aluno_id) || b.aluno_id : b.cliente_nome,
      vendas: b.vendas,
      total: b.total,
      ultima_compra: b.ultima_compra,
    }))
    .sort((a, b) => b.total - a.total || b.vendas - a.vendas);

  return {
    concludedCount,
    concludedTotal,
    cancelCount,
    ticketMedio: concludedCount > 0 ? concludedTotal / concludedCount : 0,
    truncated: (list.total ?? docs.length) > docs.length,
    byChannel: Object.entries(byChannel).map(([canal, total]) => ({ canal, total })),
    byProduct,
    byBuyer,
  };
}

export default async function reportsLightHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const type = String(req.query.type || 'finance').toLowerCase();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const regimeRaw = String(req.query.regime || FINANCE_REGIME.CASH).toLowerCase();
  const regime =
    regimeRaw === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;

  const financePrivileged = FINANCE_REPORT_TYPES.has(type)
    ? await isAcademyOwnerOrAdminUser(access.doc, me)
    : true;

  if (FINANCE_REPORT_TYPES.has(type) && !financePrivileged && type !== 'finance') {
    return json(res, 403, {
      ok: false,
      error: 'permission_denied',
      message: 'Acesso restrito a gestores',
    });
  }

  const key = cacheKey(['light', type, academyId, from, to, regime, financePrivileged ? 'full' : 'basic']);
  const cached = getCached(key);
  if (cached) return json(res, 200, cached, true);

  try {
    if (type === 'finance') {
      const summary = await financeSummary(academyId, from, to, regime);
      const body = financePrivileged
        ? {
            ok: true,
            type: 'finance',
            from,
            to,
            scope: 'full',
            limited: false,
            ...summary,
          }
        : {
            ok: true,
            type: 'finance',
            from,
            to,
            scope: 'basic',
            limited: true,
            received: summary.received,
            expenses: summary.expenses,
            balance: summary.balance,
            totalReceived: summary.received,
            totalExpenses: summary.expenses,
            receivedCount: summary.receivedCount,
            expenseCount: summary.expenseCount,
          };
      setCached(key, body);
      return json(res, 200, body);
    }
    if (type === 'sales') {
      const body = { ok: true, type: 'sales', from, to, ...(await salesSummary(academyId, from, to)) };
      setCached(key, body);
      return json(res, 200, body);
    }
    if (type === 'overview') {
      return handleReportsOverviewGet(req, res, access, me);
    }
    return json(res, 400, { ok: false, error: 'invalid_type' });
  } catch (e) {
    console.error('[reportsLight]', e);
    return json(res, 500, { ok: false, error: 'load_failed' });
  }
}

export async function ensureReportsOwnerOnly(req, res, me) {
  return ensureAcademyOwnerOrAdmin(req, res, me);
}
