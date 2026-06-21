/**
 * GET /api/reports/by-operator — extrato por operador (vendas + movimentos manuais).
 */
import { Query, Users, Client } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { roundMoney } from './salePayments.js';
import { enrichSaleItemsBatch, saleItemDisplayLabelFromMeta, loadStockMetaByIds } from './reportBatchResolve.js';

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
const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';

const usersApi = API_KEY
  ? new Users(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY))
  : null;

function json(res, status, body) {
  res.status(status).json(body);
}

function parsePeriod(req) {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  let toIso = null;
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    toIso = d.toISOString();
  }
  return { from, to, fromIso, toIso };
}

function saleInRange(doc, fromIso, toIso) {
  const created = doc.$createdAt || doc.created_at;
  if (!created) return true;
  const t = new Date(created).getTime();
  if (fromIso && t < new Date(fromIso).getTime()) return false;
  if (toIso && t >= new Date(toIso).getTime()) return false;
  return true;
}

async function listAcademySales(academyId, fromIso, toIso) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderDesc('$createdAt')];
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      try {
        queries.unshift(Query.equal('academyId', academyId));
      } catch {
        void 0;
      }
    }
    if (fromIso) queries.push(Query.greaterThanEqual('$createdAt', fromIso));
    if (toIso) queries.push(Query.lessThan('$createdAt', toIso));
    if (cursor) queries.push(Query.cursorAfter(cursor));

    let res;
    try {
      res = await databases.listDocuments(DB_ID, SALES_COL, queries);
    } catch {
      res = await databases.listDocuments(DB_ID, SALES_COL, [
        Query.limit(PAGE),
        Query.orderDesc('$createdAt'),
      ]);
    }
    const batch = (res.documents || []).filter((d) => {
      const aid = String(d.academy_id || d.academyId || '');
      if (aid && aid !== academyId) return false;
      return saleInRange(d, fromIso, toIso);
    });
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return all;
}

async function listSaleItemsForSales(saleIds) {
  if (!SALE_ITEMS_COL || !saleIds.length) return [];
  const CHUNK = 25;
  const chunks = [];
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    chunks.push(saleIds.slice(i, i + CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (ids) => {
      try {
        const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
          Query.equal('venda_id', ids),
          Query.limit(ids.length * 10),
        ]);
        return res.documents || [];
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}

async function listManualMoves(academyId, fromIso, toIso, usuarioId) {
  if (!STOCK_MOVES_COL) return [];
  const queries = [Query.orderDesc('$createdAt'), Query.limit(500)];
  try {
    queries.unshift(Query.equal('academy_id', academyId));
  } catch {
    void 0;
  }
  if (fromIso) queries.push(Query.greaterThanEqual('$createdAt', fromIso));
  if (toIso) queries.push(Query.lessThan('$createdAt', toIso));
  if (usuarioId) queries.push(Query.equal('usuario_id', usuarioId));

  let list;
  try {
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
  } catch {
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, [Query.limit(500)]);
    list.documents = (list.documents || []).filter(
      (d) => !d.academy_id || String(d.academy_id) === academyId
    );
  }

  return (list.documents || []).filter((d) => {
    if (String(d.sale_id || '').trim()) return false;
    const tipo = String(d.tipo || '').toLowerCase();
    if (tipo === 'saida_venda' || tipo === 'reversao_venda') return false;
    if (String(d.movement_kind || '') === 'sale' || String(d.movement_kind || '') === 'return') {
      return false;
    }
    if (usuarioId && String(d.usuario_id || '') !== usuarioId) return false;
    if (!saleInRange(d, fromIso, toIso)) return false;
    return true;
  });
}

async function resolveUserDisplayName(userId, cache) {
  const uid = String(userId || '').trim();
  if (!uid) return '—';
  if (cache.has(uid)) return cache.get(uid);
  if (!usersApi) {
    cache.set(uid, uid);
    return uid;
  }
  try {
    const u = await usersApi.get({ userId: uid });
    const name = String(u.name || u.email || '').trim() || uid;
    cache.set(uid, name);
    return name;
  } catch {
    const short = uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
    cache.set(uid, short);
    return short;
  }
}

export default async function reportsByOperatorHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, erro: 'method_not_allowed' });
  }
  if (!SALES_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const filterUserId = String(req.query.usuario_id || '').trim();
  const { fromIso, toIso } = parsePeriod(req);

  const sales = await listAcademySales(academyId, fromIso, toIso);
  const concluded = sales.filter((s) => String(s.status || '').toLowerCase() === 'concluida');
  const cancelled = sales.filter((s) => String(s.status || '').toLowerCase() === 'cancelada');

  const byOperator = new Map();
  const nameCache = new Map();

  for (const s of concluded) {
    const opId = String(s.created_by || '').trim() || 'unknown';
    if (filterUserId && opId !== filterUserId) continue;
    if (!byOperator.has(opId)) {
      byOperator.set(opId, {
        usuario_id: opId,
        vendas_concluidas: 0,
        faturamento: 0,
        cancelamentos: 0,
        sale_ids: [],
        item_counts: new Map(),
      });
    }
    const row = byOperator.get(opId);
    row.vendas_concluidas += 1;
    row.faturamento += Number(s.total) || 0;
    row.sale_ids.push(s.$id);
  }

  for (const s of cancelled) {
    const opId = String(s.created_by || '').trim() || 'unknown';
    if (filterUserId && opId !== filterUserId) continue;
    if (!byOperator.has(opId)) {
      byOperator.set(opId, {
        usuario_id: opId,
        vendas_concluidas: 0,
        faturamento: 0,
        cancelamentos: 0,
        sale_ids: [],
        item_counts: new Map(),
      });
    }
    byOperator.get(opId).cancelamentos += 1;
  }

  const allSaleIds = [...new Set([...byOperator.values()].flatMap((o) => o.sale_ids))];
  const saleItems = await listSaleItemsForSales(allSaleIds);
  const stockIds = saleItems.map((it) => String(it.product_variant_id || it.item_estoque_id || '')).filter(Boolean);
  const stockMeta = await loadStockMetaByIds(databases, DB_ID, academyId, stockIds);

  for (const it of saleItems) {
    const sale = sales.find((s) => s.$id === it.venda_id);
    if (!sale) continue;
    const opId = String(sale.created_by || '').trim() || 'unknown';
    const row = byOperator.get(opId);
    if (!row) continue;
    const stockId = String(it.product_variant_id || it.item_estoque_id || '').trim();
    const label = saleItemDisplayLabelFromMeta(stockId, stockMeta);
    const qty = Number(it.quantidade) || 0;
    row.item_counts.set(label, (row.item_counts.get(label) || 0) + qty);
  }

  const allManualMoves = await listManualMoves(academyId, fromIso, toIso, filterUserId || null);
  const manualByUser = new Map();
  for (const m of allManualMoves) {
    const uid = String(m.usuario_id || '').trim() || 'unknown';
    if (!manualByUser.has(uid)) manualByUser.set(uid, []);
    manualByUser.get(uid).push(m);
  }

  const operators = [];
  for (const [opId, row] of byOperator) {
    const manualMoves = manualByUser.get(opId) || [];
    const topItems = [...row.item_counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, quantidade]) => ({ label, quantidade }));

    const vendasDetalhe = concluded
      .filter((s) => String(s.created_by || '').trim() === opId || (opId === 'unknown' && !s.created_by))
      .map((s) => ({
        sale_id: s.$id,
        date: s.$createdAt,
        total: Number(s.total) || 0,
        cliente_nome: s.cliente_nome || null,
        status: s.status,
      }));

    operators.push({
      usuario_id: opId,
      operador_nome: await resolveUserDisplayName(opId, nameCache),
      vendas_concluidas: row.vendas_concluidas,
      faturamento: roundMoney(row.faturamento),
      ticket_medio:
        row.vendas_concluidas > 0 ? roundMoney(row.faturamento / row.vendas_concluidas) : 0,
      cancelamentos: row.cancelamentos,
      top_itens: topItems,
      movimentos_manuais: manualMoves.length,
      movimentos_manuais_detalhe: manualMoves.slice(0, 20).map((m) => ({
        move_id: m.$id,
        date: m.$createdAt,
        tipo: m.tipo,
        quantidade: m.quantidade,
        motivo: m.motivo || m.notes,
      })),
      vendas: vendasDetalhe,
    });
  }

  operators.sort((a, b) => b.faturamento - a.faturamento);

  return json(res, 200, { ok: true, operators, from: req.query.from, to: req.query.to });
}
