/**
 * GET /api/inventory/movements/conciliation — divergência pagamento na saída vs estado atual.
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { roundMoney } from './salePayments.js';
import {
  loadPersonsByIds,
  loadProductNamesByIds,
  loadSalesByIds,
  loadStockMetaByIds,
  loadOperatorNames,
} from './reportBatchResolve.js';
import { variantInventoryLabel } from '../../src/lib/stockInventory.js';
import {
  comparePaymentConciliation,
  deriveStatusAtualVenda,
  matchesStatusFilter,
  CONCILIATION_STATUS_LABELS,
  STATUS_ATUAL_LABELS,
  SNAPSHOT_STATUS_LABELS,
  normalizeSnapshotStatus,
} from './stockMovesPaymentConciliation.js';

const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function json(res, status, body) {
  res.status(status).json(body);
}

async function listSaleMoves(academyId, from, to) {
  const queries = [
    Query.equal('academy_id', academyId),
    Query.equal('movement_kind', 'sale'),
    Query.orderDesc('$createdAt'),
    Query.limit(500),
  ];
  if (from) {
    queries.push(Query.greaterThanEqual('$createdAt', new Date(`${from}T00:00:00`).toISOString()));
  }
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    queries.push(Query.lessThan('$createdAt', d.toISOString()));
  }

  let list;
  try {
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
    const fallback = [Query.orderDesc('$createdAt'), Query.limit(500)];
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, fallback);
    let docs = (list.documents || []).filter(
      (d) => !d.academy_id || String(d.academy_id) === academyId
    );
    docs = docs.filter((d) => {
      const kind = String(d.movement_kind || '');
      const tipo = String(d.tipo || '').toLowerCase();
      return kind === 'sale' || tipo === 'saida_venda';
    });
    if (from) {
      const fromT = new Date(`${from}T00:00:00`).getTime();
      docs = docs.filter((d) => new Date(d.$createdAt).getTime() >= fromT);
    }
    if (to) {
      const toT = new Date(`${to}T23:59:59`).getTime();
      docs = docs.filter((d) => new Date(d.$createdAt).getTime() <= toT);
    }
    return docs;
  }

  return (list.documents || []).filter((d) => String(d.sale_id || d.referencia_id || '').trim());
}

/** Uma listagem FINANCIAL_TX da academia; filtra saleId em memória. */
async function loadFinancialTxBySaleIds(academyId, saleIds) {
  const want = new Set(saleIds.filter(Boolean));
  const bySale = new Map();
  if (!want.size || !FINANCIAL_TX_COL) return bySale;

  const PAGE = 100;
  let cursor = null;
  for (let page = 0; page < 30; page++) {
    const queries = [
      Query.equal('academyId', academyId),
      Query.limit(PAGE),
      Query.orderDesc('$createdAt'),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, queries);
    } catch {
      break;
    }
    const batch = res.documents || [];
    for (const doc of batch) {
      const sid = String(doc.saleId || '').trim();
      if (!want.has(sid)) continue;
      if (!bySale.has(sid)) bySale.set(sid, []);
      bySale.get(sid).push(doc);
    }
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return bySale;
}

export async function handleStockMovesConciliationGet(req, res, academyId) {
  if (!STOCK_MOVES_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'stock_moves_not_configured' });
  }

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const statusFilter = String(req.query.status_filter || 'divergent').trim().toLowerCase();

  const moves = await listSaleMoves(academyId, from, to);
  const saleIds = [
    ...new Set(moves.map((m) => String(m.sale_id || m.referencia_id || '').trim()).filter(Boolean)),
  ];

  const [salesMap, financeBySale] = await Promise.all([
    loadSalesByIds(databases, DB_ID, saleIds),
    loadFinancialTxBySaleIds(academyId, saleIds),
  ]);

  const leadIds = moves.map((m) => m.lead_id).filter(Boolean);
  const productIds = moves.map((m) => m.product_id).filter(Boolean);
  const itemIds = moves.map((m) => m.item_estoque_id).filter(Boolean);
  const usuarioIds = moves.map((m) => m.usuario_id).filter(Boolean);

  const [persons, productNames, stockMeta, operatorNames] = await Promise.all([
    loadPersonsByIds(databases, DB_ID, leadIds),
    loadProductNamesByIds(databases, DB_ID, productIds),
    loadStockMetaByIds(databases, DB_ID, academyId, itemIds),
    loadOperatorNames(moves, usuarioIds),
  ]);

  const rows = [];
  const summary = {
    total_moves: 0,
    ok: 0,
    divergent: 0,
    settled_after: 0,
    cancelled_after: 0,
    reversed: 0,
    pending_atual: 0,
    settled_atual: 0,
  };

  for (const doc of moves) {
    const saleId = String(doc.sale_id || doc.referencia_id || '').trim();
    const saleDoc = saleId ? salesMap.get(saleId) : null;
    const financeTxs = saleId ? financeBySale.get(saleId) || [] : [];

    const statusAtual = deriveStatusAtualVenda(saleDoc, financeTxs);
    const conciliationStatus = comparePaymentConciliation(doc.payment_status_at_move, statusAtual);

    summary.total_moves += 1;
    if (conciliationStatus === 'ok') summary.ok += 1;
    else if (conciliationStatus === 'settled_after') summary.settled_after += 1;
    else if (conciliationStatus === 'cancelled_after') summary.cancelled_after += 1;
    else if (conciliationStatus === 'reversed') summary.reversed += 1;
    else summary.divergent += 1;

    if (statusAtual === 'pending') summary.pending_atual += 1;
    if (statusAtual === 'settled') summary.settled_atual += 1;

    if (!matchesStatusFilter(conciliationStatus, statusAtual, statusFilter)) continue;

    const itemId = String(doc.item_estoque_id || '').trim();
    const meta = stockMeta.get(itemId) || {};
    const pid = String(doc.product_id || meta.product_id || '').trim();
    const productName = productNames.get(pid) || meta.product_name || '—';
    const size = meta.variant_size || '';
    const color = meta.variant_color || '';

    const person = doc.lead_id ? persons.get(String(doc.lead_id)) : null;
    const uid = String(doc.usuario_id || '').trim();
    const snapNorm = normalizeSnapshotStatus(doc.payment_status_at_move);

    const qty = Number(doc.quantidade) || 0;
    const lineTotal =
      doc.line_total != null
        ? Number(doc.line_total)
        : doc.unit_price != null
          ? roundMoney(Number(doc.unit_price) * Math.abs(qty))
          : null;

    rows.push({
      move_id: doc.$id,
      date: doc.$createdAt,
      product_name: productName,
      variant_size: size,
      variant_color: color,
      variant_label: variantInventoryLabel({ size, color, Tamanho: size }),
      quantidade: qty,
      line_total: lineTotal,
      cliente_nome: person?.nome || saleDoc?.cliente_nome || '—',
      operador_nome:
        String(doc.usuario_name || '').trim() || (uid ? operatorNames.get(uid) : '') || '—',
      sale_id: saleId || null,
      payment_status_at_move: doc.payment_status_at_move || null,
      payment_status_at_move_label:
        SNAPSHOT_STATUS_LABELS[snapNorm] || SNAPSHOT_STATUS_LABELS[String(doc.payment_status_at_move || '')] || '—',
      status_atual_venda: statusAtual,
      status_atual_venda_label: STATUS_ATUAL_LABELS[statusAtual] || statusAtual,
      conciliacao_status: conciliationStatus,
      conciliacao_status_label: CONCILIATION_STATUS_LABELS[conciliationStatus] || conciliationStatus,
      finance_tx_count: financeTxs.length,
      sale_status: saleDoc ? String(saleDoc.status || '') : null,
    });
  }

  summary.divergent_total =
    summary.divergent + summary.settled_after + summary.cancelled_after + summary.reversed;

  return json(res, 200, {
    ok: true,
    rows,
    summary,
    filters: { from, to, status_filter: statusFilter },
  });
}

export default async function stockMovesConciliationRoute(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, erro: 'method_not_allowed' });
  }
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  return handleStockMovesConciliationGet(req, res, access.academyId);
}
