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

export function inferMovementKind(doc) {
  const mk = String(doc.movement_kind || '').trim();
  if (mk) return mk;
  const tipo = String(doc.tipo || '').toLowerCase();
  const motivo = String(doc.motivo || '').toLowerCase();
  if (motivo === 'cadastro_inicial' || String(doc.referencia_id || '').startsWith('cadastro:')) {
    return 'initial';
  }
  if (tipo === 'saida_venda') return 'sale';
  if (tipo === 'reversao_venda' || tipo === 'devolucao') return 'return';
  if (tipo === 'ajuste') return 'adjustment';
  if (tipo === 'entrada') return 'entry';
  if (tipo === 'saida_aluguel') return 'rental';
  return tipo || 'other';
}

export const KIND_LABELS = {
  sale: 'Venda',
  return: 'Devolução',
  adjustment: 'Ajuste',
  entry: 'Entrada',
  initial: 'Cadastro inicial',
  rental: 'Aluguel',
  loss: 'Perda',
  internal_use: 'Uso interno',
  other: 'Outro',
};

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

/** Saldo anterior → posterior quando quantity_before foi gravado na movimentação. */
export function resolveStockBalanceSnapshot(doc, signedQty) {
  const rawBefore = doc?.quantity_before;
  const hasBefore =
    rawBefore != null && rawBefore !== '' && Number.isFinite(Number(rawBefore));
  if (!hasBefore) {
    return { quantity_before: null, quantity_after: null, balance_label: null };
  }
  const before = Math.trunc(Number(rawBefore));
  const after = before + Math.trunc(Number(signedQty) || 0);
  return {
    quantity_before: before,
    quantity_after: after,
    balance_label: `${before} → ${after}`,
  };
}

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
  const clienteQ = String(req.query.cliente_q || '').trim();

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
    filters: { productId, leadId, saleId, movementKind, usuarioId, clienteQ },
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

export function computeOperationalTotals(docs) {
  let entradas_un = 0;
  let saidas_un = 0;
  let ajustes_liquido = 0;
  let total_devolucoes = 0;
  let total_faturado = 0;
  let saldo_liquido = 0;

  for (const doc of docs) {
    const kind = inferMovementKind(doc);
    const signedQty = resolveSignedStockMoveQuantity(doc);
    const absQty = Math.abs(signedQty);
    saldo_liquido += signedQty;

    if (kind === 'adjustment') {
      ajustes_liquido += signedQty;
    } else if (kind === 'return') {
      total_devolucoes += absQty;
      if (signedQty > 0) entradas_un += signedQty;
    } else if (kind === 'entry' || kind === 'initial') {
      entradas_un += absQty;
    } else if (kind === 'sale' || kind === 'rental' || kind === 'loss' || kind === 'internal_use') {
      saidas_un += absQty;
      if (kind === 'sale') {
        const lineTotal =
          doc.line_total != null
            ? Number(doc.line_total)
            : doc.unit_price != null
              ? roundMoney(Number(doc.unit_price) * absQty)
              : 0;
        if (Number.isFinite(lineTotal)) total_faturado += lineTotal;
      }
    } else if (signedQty > 0) {
      entradas_un += signedQty;
    } else if (signedQty < 0) {
      saidas_un += absQty;
    }
  }

  let with_balance_snapshot = 0;
  for (const doc of docs) {
    const rawBefore = doc?.quantity_before;
    if (rawBefore != null && rawBefore !== '' && Number.isFinite(Number(rawBefore))) {
      with_balance_snapshot += 1;
    }
  }

  return {
    entradas_un,
    saidas_un,
    ajustes_liquido,
    saldo_liquido,
    total_unidades: saidas_un,
    total_faturado: roundMoney(total_faturado),
    total_devolucoes,
    registros: docs.length,
    with_balance_snapshot,
    without_balance_snapshot: docs.length - with_balance_snapshot,
  };
}

async function fetchFinancialTxStatusMap(txIds, academyId) {
  const map = new Map();
  if (!FINANCIAL_TX_COL || !txIds.length) return map;
  const unique = [...new Set(txIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (id) => {
      try {
        const doc = await databases.getDocument(DB_ID, FINANCIAL_TX_COL, id);
        if (academyId && doc.academyId && String(doc.academyId) !== String(academyId)) return;
        map.set(id, String(doc.status || '').toLowerCase());
      } catch {
        map.set(id, 'missing');
      }
    })
  );
  return map;
}

function resolveClienteNomeFromDoc(doc, persons, salesMap) {
  const person = doc.lead_id ? persons.get(String(doc.lead_id)) : null;
  const saleRef = String(doc.sale_id || doc.referencia_id || '').trim();
  const saleDoc = saleRef ? salesMap.get(saleRef) : null;
  return (
    person?.nome ||
    String(saleDoc?.cliente_nome || '').trim() ||
    ''
  );
}

function matchesClienteQFilter(doc, clienteQ, persons, salesMap) {
  const q = String(clienteQ || '').trim().toLowerCase();
  if (!q) return true;
  const nome = resolveClienteNomeFromDoc(doc, persons, salesMap).toLowerCase();
  return nome.includes(q);
}

function paginateDocs(docs, limit, cursor) {
  const list = docs || [];
  if (!list.length) {
    return { page: [], nextCursor: null };
  }
  let startIdx = 0;
  const cursorId = String(cursor || '').trim();
  if (cursorId) {
    const idx = list.findIndex((d) => String(d.$id) === cursorId);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const page = list.slice(startIdx, startIdx + limit);
  const last = page.length ? page[page.length - 1] : null;
  const nextCursor = startIdx + limit < list.length && last ? last.$id : null;
  return { page, nextCursor };
}

function accumulateProductBucket(buckets, pid, productName) {
  if (!buckets.has(pid)) {
    buckets.set(pid, {
      product_id: pid,
      product_name: productName,
      entradas_un: 0,
      saidas_un: 0,
      ajustes_liquido: 0,
      saldo_liquido: 0,
      movimentos: 0,
    });
  }
  return buckets.get(pid);
}

function applySignedQtyToProductBucket(bucket, kind, signedQty) {
  const absQty = Math.abs(signedQty);
  bucket.movimentos += 1;
  bucket.saldo_liquido += signedQty;
  if (kind === 'adjustment') {
    bucket.ajustes_liquido += signedQty;
  } else if (kind === 'return') {
    if (signedQty > 0) bucket.entradas_un += signedQty;
  } else if (kind === 'entry' || kind === 'initial') {
    bucket.entradas_un += absQty;
  } else if (kind === 'sale' || kind === 'rental' || kind === 'loss' || kind === 'internal_use') {
    bucket.saidas_un += absQty;
  } else if (signedQty > 0) {
    bucket.entradas_un += signedQty;
  } else if (signedQty < 0) {
    bucket.saidas_un += absQty;
  }
}

/** @returns {object[]} */
export function aggregateMovesByProduct(docs, stockMeta, productNames) {
  const buckets = new Map();
  for (const doc of docs || []) {
    const itemId = String(doc.item_estoque_id || '').trim();
    const meta = stockMeta.get(itemId) || {};
    const pid = String(doc.product_id || meta.product_id || itemId).trim() || 'sem-produto';
    const productName = productNames.get(pid) || meta.product_name || pid;
    const bucket = accumulateProductBucket(buckets, pid, productName);
    const kind = inferMovementKind(doc);
    const signedQty = resolveSignedStockMoveQuantity(doc);
    applySignedQtyToProductBucket(bucket, kind, signedQty);
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (b.movimentos !== a.movimentos) return b.movimentos - a.movimentos;
    return String(a.product_name).localeCompare(String(b.product_name), 'pt-BR');
  });
}

function mapDocToMovementRow(doc, ctx) {
  const {
    stockMeta,
    productNames,
    persons,
    salesMap,
    operatorNames,
    txStatusById,
  } = ctx;

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

  const saleRef = String(doc.sale_id || doc.referencia_id || '').trim();
  const saleDoc = saleRef ? salesMap.get(saleRef) : null;
  const clienteNome =
    resolveClienteNomeFromDoc(doc, persons, salesMap) || '—';
  const person = doc.lead_id ? persons.get(String(doc.lead_id)) : null;
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
  const balance = resolveStockBalanceSnapshot(doc, qty);
  const unitPrice = doc.unit_price != null ? Number(doc.unit_price) : null;
  const lineTotal =
    doc.line_total != null
      ? Number(doc.line_total)
      : unitPrice != null && Number.isFinite(unitPrice)
        ? roundMoney(unitPrice * Math.abs(qty))
        : null;

  const financialTxId = String(doc.financial_tx_id || '').trim();
  const purchaseRaw = doc.purchase_price;
  const purchasePrice =
    purchaseRaw != null && purchaseRaw !== '' && Number.isFinite(Number(purchaseRaw))
      ? Number(purchaseRaw)
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
    quantity_before: balance.quantity_before,
    quantity_after: balance.quantity_after,
    balance_label: balance.balance_label,
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
    source: doc.source || null,
    financial_tx_id: financialTxId || null,
    purchase_price: purchasePrice,
    financial_tx_status: financialTxId ? txStatusById.get(financialTxId) || '' : '',
    product_id: pid || null,
    lead_id: doc.lead_id || null,
    usuario_id: doc.usuario_id || null,
  };
}

async function resolveReportContext(docs, academyId) {
  const leadIds = docs.map((d) => d.lead_id).filter(Boolean);
  const productIds = docs.map((d) => d.product_id).filter(Boolean);
  const itemIds = docs.map((d) => d.item_estoque_id).filter(Boolean);
  const saleIds = docs
    .map((d) => d.sale_id || d.referencia_id)
    .filter((id) => String(id || '').trim());
  const usuarioIds = docs.map((d) => d.usuario_id).filter(Boolean);
  const txIds = docs.map((d) => String(d.financial_tx_id || '').trim()).filter(Boolean);

  const [persons, productNames, stockMeta, salesMap, operatorNames, txStatusById] = await Promise.all([
    loadPersonsByIds(databases, DB_ID, leadIds),
    loadProductNamesByIds(databases, DB_ID, productIds),
    loadStockMetaByIds(databases, DB_ID, academyId, itemIds),
    loadSalesByIds(databases, DB_ID, saleIds),
    loadOperatorNames(docs, usuarioIds),
    fetchFinancialTxStatusMap(txIds, academyId),
  ]);

  return { persons, productNames, stockMeta, salesMap, operatorNames, txStatusById };
}

export async function handleInventoryMovementsReportGet(req, res, academyId) {
  if (!STOCK_MOVES_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'stock_moves_not_configured' });
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const cursor = String(req.query.cursor || '').trim();
  const { filters } = buildMoveQueries(academyId, req, limit, cursor);
  const clienteQ = filters.clienteQ;

  const allForSummary = await listAllMovesForSummary(academyId, req);
  const summaryContext = await resolveReportContext(allForSummary, academyId);

  let summaryDocs = allForSummary;
  if (clienteQ) {
    summaryDocs = allForSummary.filter((doc) =>
      matchesClienteQFilter(doc, clienteQ, summaryContext.persons, summaryContext.salesMap)
    );
  }

  let pageDocs;
  let nextCursor;
  if (clienteQ) {
    const paged = paginateDocs(summaryDocs, limit, cursor);
    pageDocs = paged.page;
    nextCursor = paged.nextCursor;
  } else {
    const { queries } = buildMoveQueries(academyId, req, limit, cursor);
    pageDocs = await listMovesWithFallback(academyId, queries, filters);
    const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
    nextCursor = pageDocs.length >= limit && lastDoc ? lastDoc.$id : null;
  }

  const pageContext = clienteQ
    ? summaryContext
    : await resolveReportContext(pageDocs, academyId);

  const by_product = aggregateMovesByProduct(
    summaryDocs,
    summaryContext.stockMeta,
    summaryContext.productNames
  );

  const rows = pageDocs.map((doc) => mapDocToMovementRow(doc, pageContext));
  const totals = computeOperationalTotals(summaryDocs);

  return json(res, 200, {
    ok: true,
    movements: rows,
    by_product,
    totals,
    summary: {
      units_in: totals.entradas_un,
      units_out: totals.saidas_un,
      adjustments_net: totals.ajustes_liquido,
      net_balance: totals.saldo_liquido,
      revenue_total: totals.total_faturado,
      returns_units: totals.total_devolucoes,
      count: rows.length,
      registros: totals.registros,
    },
    pagination: {
      limit,
      next_cursor: nextCursor,
      has_more: Boolean(nextCursor),
      client_filter_active: Boolean(clienteQ),
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
