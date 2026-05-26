/**
 * GET /api/inventory/movements — relatório de movimentações de estoque enriquecidas.
 */
import { Client, Databases, Query, Users } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { resolveStockDocument, PRODUCTS_COL } from './productCatalogDb.js';
import { itemDisplayName, variantInventoryLabel } from '../../src/lib/stockInventory.js';
import { roundMoney } from './salePayments.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const usersApi = new Users(adminClient);

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

async function loadPersonName(leadId, cache) {
  const id = String(leadId || '').trim();
  if (!id) return '';
  if (cache.has(`lead:${id}`)) return cache.get(`lead:${id}`);
  const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
  for (const col of cols) {
    try {
      const doc = await databases.getDocument(DB_ID, col, id);
      const name = String(doc.name || doc.nome || '').trim();
      cache.set(`lead:${id}`, name || id);
      return name || id;
    } catch {
      void 0;
    }
  }
  cache.set(`lead:${id}`, id);
  return id;
}

async function loadOperatorName(doc, cache) {
  const stored = String(doc.usuario_name || '').trim();
  if (stored) return stored;
  const uid = String(doc.usuario_id || '').trim();
  if (!uid) return '—';
  if (cache.has(`user:${uid}`)) return cache.get(`user:${uid}`);
  try {
    const u = await usersApi.get({ userId: uid });
    const name = String(u.name || u.email || '').trim() || uid;
    cache.set(`user:${uid}`, name);
    return name;
  } catch {
    cache.set(`user:${uid}`, uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid);
    return cache.get(`user:${uid}`);
  }
}

async function loadProductName(productId, cache) {
  const id = String(productId || '').trim();
  if (!id) return '';
  if (cache.has(`product:${id}`)) return cache.get(`product:${id}`);
  if (!PRODUCTS_COL) return '';
  try {
    const doc = await databases.getDocument(DB_ID, PRODUCTS_COL, id);
    const name = String(doc.name || doc.nome || '').trim();
    cache.set(`product:${id}`, name);
    return name;
  } catch {
    cache.set(`product:${id}`, '');
    return '';
  }
}

async function resolveVariantMeta(itemId, cache) {
  const id = String(itemId || '').trim();
  if (!id) return { product_name: '', variant_size: '', variant_color: '', product_id: '' };
  if (cache.has(`variant:${id}`)) return cache.get(`variant:${id}`);

  let meta = { product_name: '', variant_size: '', variant_color: '', product_id: '' };
  try {
    const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, id);
    if (resolved?.doc) {
      const d = resolved.doc;
      const size = String(d.size ?? d.Tamanho ?? '').trim();
      const color = String(d.color ?? '').trim();
      const parentName = resolved.parent?.nome || itemDisplayName(d);
      meta = {
        product_name: parentName,
        variant_size: size,
        variant_color: color,
        product_id: String(d.product_id || resolved.parent?.id || '').trim(),
      };
    }
  } catch {
    void 0;
  }

  cache.set(`variant:${id}`, meta);
  return meta;
}

function paymentStatusLabel(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'paid') return 'Pago';
  if (s === 'partial') return 'Parcial';
  if (s === 'pending') return 'Pendente';
  return st || '—';
}

export async function handleInventoryMovementsReportGet(req, res, academyId) {
  if (!STOCK_MOVES_COL || !DB_ID) {
    return json(res, 503, { ok: false, erro: 'stock_moves_not_configured' });
  }

  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const productId = String(req.query.product_id || '').trim();
  const leadId = String(req.query.lead_id || '').trim();
  const saleId = String(req.query.sale_id || '').trim();
  const movementKind = String(req.query.movement_kind || '').trim();
  const usuarioId = String(req.query.usuario_id || '').trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const cursor = String(req.query.cursor || '').trim();

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

  let list;
  try {
    list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute') || msg.includes('Invalid query')) {
      const fallback = [
        Query.orderDesc('$createdAt'),
        Query.limit(Math.min(500, limit * 3)),
      ];
      list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, fallback);
      list.documents = (list.documents || []).filter(
        (d) => !d.academy_id || String(d.academy_id) === academyId
      );
    } else {
      throw e;
    }
  }

  let docs = list.documents || [];
  if (movementKind && !queries.some((q) => String(q).includes('movement_kind'))) {
    docs = docs.filter((d) => inferMovementKind(d) === movementKind);
  }
  if (productId && !queries.some((q) => String(q).includes('product_id'))) {
    docs = docs.filter((d) => String(d.product_id || '') === productId);
  }

  const cache = new Map();
  const rows = [];

  for (const doc of docs) {
    const kind = inferMovementKind(doc);
    const itemId = String(doc.item_estoque_id || '').trim();
    let variantMeta = await resolveVariantMeta(itemId, cache);
    const pid = String(doc.product_id || variantMeta.product_id || '').trim();
    let productName = await loadProductName(pid, cache);
    if (!productName) productName = variantMeta.product_name;

    const size =
      variantMeta.variant_size ||
      (variantMeta.product_name
        ? ''
        : '');
    const color = variantMeta.variant_color || '';

    const clienteNome = doc.lead_id
      ? await loadPersonName(doc.lead_id, cache)
      : '';
    const operadorNome = await loadOperatorName(doc, cache);

    const qty = Number(doc.quantidade) || 0;
    const unitPrice = doc.unit_price != null ? Number(doc.unit_price) : null;
    const lineTotal =
      doc.line_total != null
        ? Number(doc.line_total)
        : unitPrice != null && Number.isFinite(unitPrice)
          ? roundMoney(unitPrice * Math.abs(qty))
          : null;

    const saleRef = String(doc.sale_id || doc.referencia_id || '').trim();

    rows.push({
      move_id: doc.$id,
      date: doc.$createdAt,
      movement_kind: kind,
      movement_kind_label: KIND_LABELS[kind] || kind,
      tipo: String(doc.tipo || ''),
      product_name: productName || '—',
      variant_size: size,
      variant_color: color,
      variant_label: variantInventoryLabel({
        size,
        color,
        Tamanho: size,
      }),
      quantidade: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      sale_id: saleRef || null,
      cliente_nome: clienteNome || '—',
      operador_nome: operadorNome,
      payment_status_at_move: doc.payment_status_at_move || null,
      payment_status_label: paymentStatusLabel(doc.payment_status_at_move),
      payment_method: doc.payment_method || null,
      notes: doc.notes || doc.motivo || null,
      product_id: pid || null,
      lead_id: doc.lead_id || null,
      usuario_id: doc.usuario_id || null,
    });
  }

  const lastDoc = docs.length ? docs[docs.length - 1] : null;
  const nextCursor = docs.length >= limit && lastDoc ? lastDoc.$id : null;

  let unitsOut = 0;
  let revenueTotal = 0;
  for (const r of rows) {
    if (r.movement_kind === 'sale') {
      unitsOut += Math.abs(Number(r.quantidade) || 0);
      if (Number.isFinite(r.line_total)) revenueTotal += r.line_total;
    }
  }

  return json(res, 200, {
    ok: true,
    movements: rows,
    summary: {
      units_out: unitsOut,
      revenue_total: roundMoney(revenueTotal),
      count: rows.length,
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
