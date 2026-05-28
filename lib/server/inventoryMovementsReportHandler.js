/**
 * GET /api/inventory/movements — relatório de movimentações de estoque enriquecidas.
 */
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { Query } from 'node-appwrite';
import { resolveSignedStockMoveQuantity, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { roundMoney } from './salePayments.js';
import {
  loadPersonsByIds,
  loadProductNamesByIds,
  loadSalesByIds,
  loadStockMetaByIds,
  loadOperatorNames,
} from './reportBatchResolve.js';

const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';

function json(res, status, body) {
  res.status(status).json(body);
}

function inferMovementKind(doc) {
  const mk = String(doc.movement_kind || '').trim();
  if (mk) return mk;
  const tipo = String(doc.tipo || '').toLowerCase();
  if (tipo === 'saida_venda') return 'sale';
  if (tipo === 'reversao_venda') return 'return';
  if (tipo === 'ajuste') return 'adjustment';
  if (tipo === 'entrada') return 'entry';
  if (tipo === 'saida_aluguel') return 'rental';
  return tipo || 'other';
}

const KIND_LABELS = {
  sale: 'Venda',
  return: 'Devolução',
  adjustment: 'Ajuste',
  entry: 'Entrada',
  rental: 'Aluguel',
  loss: 'Perda',
  internal_use: 'Uso interno',
  other: 'Outro',
};

function paymentStatusLabel(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'paid') return 'Pago';
  if (s === 'partial') return 'Parcial';
  if (s === 'pending') return 'Pendente';
  return st || '—';
}

function buildMoveQueries(academyId, req, limit, cursor) {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const productId = String(req.query.product_id || '').trim();
  const leadId = String(req.query.lead_id || '').trim();
  const saleId = String(req.query.sale_id || '').trim();
  const movementKind = String(req.query.movement_kind || '').trim();
  const usuarioId = String(req.query.usuario_id || '').trim();

  const queries = [Query.equal('academy_id', academyId), Query.orderDesc('$createdAt'), Query.limit(limit)];
  if (cursor) {
    try {
      queries.push(Query.cursorAfter(cursor));
    } catch {
      void 0;
    }
  }
  if (from) {
    queries.push(Query.greaterThanEqual('$createdAt', new Date(`${from}T00:00:00`).toISOString()));
  }
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    queries.push(Query.lessThan('$createdAt', d.toISOString()));
  }
  if (productId) queries.push(Query.equal('product_id', productId));
  if (leadId) queries.push(Query.equal('lead_id', leadId));
  if (saleId) queries.push(Query.equal('sale_id', saleId));
  if (movementKind) queries.push(Query.equal('movement_kind', movementKind));
  if (usuarioId) queries.push(Query.equal('usuario_id', usuarioId));

  return {
    queries,
    filters: { productId, leadId, saleId, movementKind, usuarioId },
  };
}

async function listMovesWithFallback(academyId, queries, filters) {
  let list;
  try {
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute') && !msg.includes('Invalid query')) throw e;
    const fallback = [Query.orderDesc('$createdAt'), Query.limit(500)];
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, fallback);
    list.documents = (list.documents || []).filter(
      (d) => !d.academy_id || String(d.academy_id) === academyId
    );
  }

  let docs = list.documents || [];
  const { productId, leadId, saleId, movementKind, usuarioId } = filters;
  if (movementKind && !queries.some((q) => String(q).includes('movement_kind'))) {
    docs = docs.filter((d) => inferMovementKind(d) === movementKind);
  }
  if (productId && !queries.some((q) => String(q).includes('product_id'))) {
    docs = docs.filter((d) => String(d.product_id || '') === productId);
  }
  if (leadId && !queries.some((q) => String(q).includes('lead_id'))) {
    docs = docs.filter((d) => String(d.lead_id || '') === leadId);
  }
  if (saleId && !queries.some((q) => String(q).includes('sale_id'))) {
    docs = docs.filter(
      (d) => String(d.sale_id || '') === saleId || String(d.referencia_id || '') === saleId
    );
  }
  if (usuarioId && !queries.some((q) => String(q).includes('usuario_id'))) {
    docs = docs.filter((d) => String(d.usuario_id || '') === usuarioId);
  }
  return docs;
}

async function listAllMovesForSummary(academyId, req) {
  const limit = 100;
  const { queries, filters } = buildMoveQueries(academyId, req, limit, null);
  let all = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const pageQueries = [...queries.filter((q) => !String(q).includes('cursorAfter'))];
    if (cursor) {
      try {
        pageQueries.push(Query.cursorAfter(cursor));
      } catch {
        break;
      }
    }
    pageQueries[pageQueries.length - 1] = Query.limit(limit);
    const docs = await listMovesWithFallback(academyId, pageQueries, filters);
    if (!docs.length) break;
    all = all.concat(docs);
    if (docs.length < limit) break;
    cursor = docs[docs.length - 1].$id;
  }
  return all;
}

function computeTotals(docs) {
  let total_unidades = 0;
  let total_faturado = 0;
  let total_devolucoes = 0;
  for (const doc of docs) {
    const kind = inferMovementKind(doc);
    const qty = Math.abs(resolveSignedStockMoveQuantity(doc));
    if (kind === 'sale') {
      total_unidades += qty;
      const lineTotal =
        doc.line_total != null
          ? Number(doc.line_total)
          : doc.unit_price != null
            ? roundMoney(Number(doc.unit_price) * qty)
            : 0;
      if (Number.isFinite(lineTotal)) total_faturado += lineTotal;
    } else if (kind === 'return') {
      total_devolucoes += qty;
    }
  }
  return {
    total_unidades,
    total_faturado: roundMoney(total_faturado),
    total_devolucoes,
    registros: docs.length,
  };
}

export async function handleInventoryMovementsReportGet(req, res, academyId) {
  if (!STOCK_MOVES_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'stock_moves_not_configured' });
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const cursor = String(req.query.cursor || '').trim();
  const { queries, filters } = buildMoveQueries(academyId, req, limit, cursor);

  const [docs, allForSummary] = await Promise.all([
    listMovesWithFallback(academyId, queries, filters),
    listAllMovesForSummary(academyId, req),
  ]);

  const leadIds = docs.map((d) => d.lead_id).filter(Boolean);
  const productIds = docs.map((d) => d.product_id).filter(Boolean);
  const itemIds = docs.map((d) => d.item_estoque_id).filter(Boolean);
  const saleIds = docs
    .map((d) => d.sale_id || d.referencia_id)
    .filter((id) => String(id || '').trim());
  const usuarioIds = docs.map((d) => d.usuario_id).filter(Boolean);

  const [persons, productNames, stockMeta, salesMap, operatorNames] = await Promise.all([
    loadPersonsByIds(databases, DB_ID, leadIds),
    loadProductNamesByIds(databases, DB_ID, productIds),
    loadStockMetaByIds(databases, DB_ID, academyId, itemIds),
    loadSalesByIds(databases, DB_ID, saleIds),
    loadOperatorNames(docs, usuarioIds),
  ]);

  const rows = docs.map((doc) => {
    const kind = inferMovementKind(doc);
    const itemId = String(doc.item_estoque_id || '').trim();
    const meta = stockMeta.get(itemId) || {
      product_name: '',
      variant_size: '',
      variant_color: '',
      sku: '',
      product_id: '',
    };
    const pid = String(doc.product_id || meta.product_id || '').trim();
    const productName = productNames.get(pid) || meta.product_name || '—';
    const size = meta.variant_size || '';
    const color = meta.variant_color || '';
    const sku = meta.sku || '';

    const person = doc.lead_id ? persons.get(String(doc.lead_id)) : null;
    const saleRef = String(doc.sale_id || doc.referencia_id || '').trim();
    const saleDoc = saleRef ? salesMap.get(saleRef) : null;

    const clienteNome =
      person?.nome ||
      String(saleDoc?.cliente_nome || '').trim() ||
      '—';
    const clienteTelefone =
      person?.telefone ||
      String(saleDoc?.cliente_telefone || '').trim() ||
      '';

    const uid = String(doc.usuario_id || '').trim();
    const operadorNome =
      String(doc.usuario_name || '').trim() ||
      (uid ? operatorNames.get(uid) : '') ||
      '—';

    const qty = resolveSignedStockMoveQuantity(doc);
    const unitPrice = doc.unit_price != null ? Number(doc.unit_price) : null;
    const lineTotal =
      doc.line_total != null
        ? Number(doc.line_total)
        : unitPrice != null && Number.isFinite(unitPrice)
          ? roundMoney(unitPrice * Math.abs(qty))
          : null;

    return {
      move_id: doc.$id,
      date: doc.$createdAt,
      movement_kind: kind,
      movement_kind_label: KIND_LABELS[kind] || kind,
      tipo: String(doc.tipo || ''),
      product_name: productName,
      variant_size: size,
      variant_color: color,
      variant_label: variantInventoryLabel({ size, color, Tamanho: size }),
      sku,
      quantidade: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      sale_id: saleRef || null,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      operador_nome: operadorNome,
      payment_status_at_move: doc.payment_status_at_move || null,
      payment_status_label: paymentStatusLabel(doc.payment_status_at_move),
      payment_method: doc.payment_method || null,
      notes: doc.notes || doc.motivo || null,
      product_id: pid || null,
      lead_id: doc.lead_id || null,
      usuario_id: doc.usuario_id || null,
    };
  });

  const lastDoc = docs.length ? docs[docs.length - 1] : null;
  const nextCursor = docs.length >= limit && lastDoc ? lastDoc.$id : null;
  const totals = computeTotals(allForSummary);

  return json(res, 200, {
    ok: true,
    movements: rows,
    totals,
    summary: {
      units_out: totals.total_unidades,
      revenue_total: totals.total_faturado,
      returns_units: totals.total_devolucoes,
      count: rows.length,
      registros: totals.registros,
    },
    pagination: {
      limit,
      next_cursor: nextCursor,
      has_more: Boolean(nextCursor),
    },
  });
}

export default async function inventoryMovementsReportRoute(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, erro: 'method_not_allowed' });
  }
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  return handleInventoryMovementsReportGet(req, res, access.academyId);
}
