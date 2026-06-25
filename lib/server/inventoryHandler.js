import { apiErro, logApiError } from './friendlyError.js';
import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { academyHasInventoryModule, academyHasProductsAccess } from '../../src/lib/stockSettings.js';
import { executeInventoryMove, executeStockItemCheck, executeInventoryAdjustment } from './inventoryMoveHandler.js';
import {
  resolveCurrentQuantity,
  getVariantStockStatus,
  itemDisplayName,
  itemCategory,
  variantInventoryLabel,
} from '../../src/lib/stockInventory.js';
import { listCatalog, resolveStockDocument, PRODUCT_VARIANTS_COL, isParentVariantCatalogEnabled } from './productCatalogDb.js';
import { isAdjustmentSubtype } from '../../src/lib/inventoryAdjust.js';
import { handleInventoryReportGet } from './inventoryReportHandler.js';
import { handleInventoryMovementsReportGet } from './inventoryMovementsReportHandler.js';
import { handleStockMovesConciliationGet } from './stockMovesConciliationHandler.js';
import { listAcademyStockMoves, mapStockMoveRow } from './inventoryMovesList.js';
import { executeStockEntryCorrection } from './stockEntryCorrection.js';
import { isAcademyOwnerOrAdminUser } from './academyAccess.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const STOCK_ITEMS_COL =
  process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || process.env.STOCK_ITEMS_COL || '';
const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL || process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function buildItemLabelFromResolved(resolved) {
  if (!resolved?.doc) return '—';
  const item = resolved.doc;
  const parentName = resolved.parent?.nome || itemDisplayName(item);
  if (resolved.collection === PRODUCT_VARIANTS_COL || item.size != null || item.color != null) {
    const vl = variantInventoryLabel({
      size: item.size,
      color: item.color,
      Tamanho: item.Tamanho ?? item.tamanho,
    });
    return vl === 'Único' ? parentName : `${parentName} · ${vl}`;
  }
  const tam = String(item.Tamanho ?? item.tamanho ?? '').trim();
  return tam ? `${parentName} · ${tam}` : parentName;
}

function mapStockMoveDoc(doc, ctx = {}) {
  return mapStockMoveRow(doc, ctx);
}

export async function handleListStockMovesForItem(res, academyId, itemId) {
  if (!STOCK_MOVES_COL) {
    return json(res, 503, { sucesso: false, erro: 'Movimentações não configuradas' });
  }
  if (!itemId) {
    return json(res, 400, { sucesso: false, erro: 'item_id_required' });
  }

  try {
    const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
    if (!resolved) return json(res, 404, { sucesso: false, erro: 'not_found' });
    const item = resolved.doc;
    if (item.academy_id && String(item.academy_id) !== academyId) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }

    const queries = [
      Query.equal('item_estoque_id', itemId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    try {
      queries.unshift(Query.equal('academy_id', academyId));
    } catch {
      void 0;
    }

    const list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
    const docs = list.documents || [];
    const itemLabel = buildItemLabelFromResolved(resolved);
    const moves = docs.map((doc) => mapStockMoveDoc(doc, { item_label: itemLabel }));
    return json(res, 200, { sucesso: true, ok: true, moves });
  } catch (e) {
    console.error('[inventory] moves:', itemId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function mapItem(doc) {
  const qty = resolveCurrentQuantity(doc);
  const min = Number(doc.minimum_level || 0);
  const salePrice = doc.sale_price != null && doc.sale_price !== '' ? Number(doc.sale_price) : null;
  const costPrice = doc.cost_price != null && doc.cost_price !== '' ? Number(doc.cost_price) : null;
  return {
    id: doc.$id,
    nome: itemDisplayName(doc),
    categoria: itemCategory(doc),
    Tamanho: String(doc.Tamanho ?? doc.tamanho ?? '').trim(),
    unit: String(doc.unit || 'unidade').trim() || 'unidade',
    current_quantity: qty,
    minimum_level: min,
    status: getVariantStockStatus(qty, min),
    sale_price: Number.isFinite(salePrice) ? salePrice : null,
    cost_price: Number.isFinite(costPrice) ? costPrice : null,
    is_for_sale: doc.is_for_sale !== false,
    is_active: doc.is_active !== false,
    last_updated: doc.last_updated || doc.$updatedAt || '',
    last_checked: doc.last_checked || '',
    notes: doc.notes || '',
    average_cost: Number(doc.average_cost ?? 0) || 0,
    last_purchase_cost: Number(doc.last_purchase_cost ?? 0) || 0,
    image_url: String(doc.image_url || doc.image || doc.photo_url || '').trim(),
  };
}

export default async function inventoryHandler(req, res) {
  const method = req.method?.toUpperCase();

  if (!DB_ID || !STOCK_ITEMS_COL) {
    return json(res, 503, { sucesso: false, erro: 'Estoque não configurado no servidor' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  if (method === 'GET') {
    const reqUrl = String(req.url || '');
    const conciliationMode =
      String(req.query.conciliation || '').trim() === '1' || reqUrl.includes('/conciliation');
    if (conciliationMode) {
      return handleStockMovesConciliationGet(req, res, academyId);
    }

    const movementsMode =
      String(req.query.movements || '').trim() === '1' ||
      (reqUrl.includes('/movements') && !reqUrl.includes('/conciliation'));
    if (movementsMode) {
      return handleInventoryMovementsReportGet(req, res, academyId);
    }

    const reportMode =
      String(req.query.report || '').trim() === '1' ||
      String(req.url || '').includes('/report');
    if (reportMode) {
      return handleInventoryReportGet(req, res, databases, DB_ID, STOCK_ITEMS_COL, academyId);
    }

    const itemId = String(req.query.item_id || req.query.item_estoque_id || '').trim();
    const listMovesMode = String(req.query.list_moves || '').trim() === '1';

    if (listMovesMode) {
      if (!STOCK_MOVES_COL) {
        return json(res, 503, { sucesso: false, erro: 'Movimentações não configuradas' });
      }
      if (!academyHasInventoryModule(academyDoc)) {
        return json(res, 403, { sucesso: false, erro: 'Módulo de estoque desativado' });
      }
      try {
        const limit = Number(req.query.limit) || 50;
        const cursor = String(req.query.cursor || '').trim();
        const filterItemId = String(req.query.item_estoque_id || req.query.item_id || '').trim();
        const out = await listAcademyStockMoves(databases, {
          dbId: DB_ID,
          stockMovesCol: STOCK_MOVES_COL,
          stockItemsCol: STOCK_ITEMS_COL,
          academyId,
          itemEstoqueId: filterItemId,
          limit,
          cursor,
        });
        return json(res, 200, { ok: true, sucesso: true, moves: out.moves, cursor: out.cursor });
      } catch (e) {
        console.error('[inventory] list_moves:', e?.message || e);
        return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
      }
    }

    if (itemId) {
      if (!academyHasProductsAccess(academyDoc) && !academyHasInventoryModule(academyDoc)) {
        return json(res, 403, { sucesso: false, erro: 'Módulo de produtos/estoque desativado' });
      }
      return handleListStockMovesForItem(res, academyId, itemId);
    }
  }

  if (!academyHasInventoryModule(academyDoc)) {
    return json(res, 403, { sucesso: false, erro: 'Módulo de estoque desativado' });
  }

  if (method === 'GET') {
    try {
      if (isParentVariantCatalogEnabled()) {
        const catalog = await listCatalog(databases, DB_ID, STOCK_ITEMS_COL, academyId);
        const items = (catalog.variants || []).map((v) => ({
          id: v.id,
          nome: v.nome,
          parent_nome: v.nome,
          display_label: v.display_label,
          categoria: v.categoria,
          Tamanho: v.size || v.Tamanho,
          size: v.size || v.Tamanho,
          color: v.color,
          product_id: v.product_id,
          image_url: v.image_url || '',
          unit: v.unit,
          current_quantity: v.current_quantity,
          minimum_level: v.minimum_level,
          status: getVariantStockStatus(v.current_quantity, v.minimum_level),
          sale_price: v.sale_price,
          cost_price: v.cost_price,
          is_for_sale: v.is_for_sale,
          is_active: v.is_active,
          last_updated: v.last_updated,
          last_checked: v.last_checked || '',
          notes: v.notes || '',
          average_cost: v.average_cost ?? 0,
          last_purchase_cost: v.last_purchase_cost ?? 0,
        }));
        return json(res, 200, { sucesso: true, items });
      }

      const queries = [Query.limit(500)];
      try {
        queries.unshift(Query.equal('academy_id', academyId));
      } catch {
        void 0;
      }
      let list;
      try {
        list = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, queries);
      } catch {
        list = await databases.listDocuments(DB_ID, STOCK_ITEMS_COL, [Query.limit(500)]);
      }
      const items = (list.documents || [])
        .filter((d) => !d.academy_id || String(d.academy_id) === academyId)
        .filter((d) => d.migrated !== true)
        .map(mapItem);
      return json(res, 200, { sucesso: true, items });
    } catch (e) {
      console.error('[inventory] list:', e);
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
    }
  }

  if (method === 'POST') {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json') || !req.body || typeof req.body !== 'object') {
      return json(res, 400, { sucesso: false, erro: 'Body JSON obrigatório' });
    }

    const action = String(req.body.action || 'move').toLowerCase();

    if (action === 'check') {
      const itemId = String(req.body.item_estoque_id || req.body.item_id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_estoque_id obrigatório' });
      if (!STOCK_MOVES_COL) {
        return json(res, 503, { sucesso: false, erro: 'Movimentações não configuradas' });
      }
      try {
        const out = await executeStockItemCheck(databases, {
          dbId: DB_ID,
          stockItemsCol: STOCK_ITEMS_COL,
          itemEstoqueId: itemId,
          academy_id: academyId,
        });
        if (!out.ok) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 200, { sucesso: true, ...out });
      } catch (e) {
        console.error('[inventory] check:', e);
        return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
      }
    }

    if (action === 'update_item') {
      const itemId = String(req.body.item_estoque_id || req.body.item_id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_estoque_id obrigatório' });
      try {
        const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
        if (!resolved) return json(res, 404, { sucesso: false, erro: 'not_found' });
        if (resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
          return json(res, 403, { sucesso: false, erro: 'academy_mismatch' });
        }
        const patch = { last_updated: new Date().toISOString() };
        if (req.body.minimum_level != null) {
          patch.minimum_level = Math.max(0, Math.trunc(Number(req.body.minimum_level) || 0));
        }
        if (req.body.unit != null) {
          patch.unit = String(req.body.unit || 'unidade').trim().slice(0, 32) || 'unidade';
        }
        if (req.body.notes != null) {
          patch.notes = String(req.body.notes || '').slice(0, 2048);
        }
        const updated = await databases.updateDocument(DB_ID, resolved.collection, itemId, patch);
        const item =
          resolved.collection === PRODUCT_VARIANTS_COL
            ? {
                id: updated.$id,
                nome: resolved.parent?.nome || itemDisplayName(updated),
                categoria: resolved.parent?.categoria || '',
                Tamanho: String(updated.size || '').trim(),
                unit: String(updated.unit || 'unidade'),
                current_quantity: resolveCurrentQuantity(updated),
                minimum_level: Number(updated.minimum_level || 0),
                status: getVariantStockStatus(resolveCurrentQuantity(updated), updated.minimum_level),
                sale_price: resolved.parent?.sale_price ?? null,
                cost_price: resolved.parent?.cost_price ?? null,
                is_for_sale: resolved.parent?.is_for_sale !== false,
                is_active: updated.is_active !== false,
                last_updated: updated.last_updated || updated.$updatedAt || '',
                last_checked: '',
                notes: String(updated.notes || ''),
              }
            : mapItem(updated);
        return json(res, 200, { sucesso: true, item });
      } catch (e) {
        console.error('[inventory] update_item:', e);
        return json(res, 500, { sucesso: false, erro: apiErro(e, 'save') });
      }
    }

    if (action === 'adjust') {
      if (!STOCK_MOVES_COL) {
        return json(res, 503, { sucesso: false, erro: 'STOCK_MOVES_COL não configurado' });
      }
      const variantId = String(
        req.body.variant_id || req.body.item_estoque_id || req.body.item_id || ''
      ).trim();
      const quantityChange = Number(req.body.quantity_change ?? req.body.quantidade);
      const subtype = String(req.body.subtype || '').trim();
      const note = String(req.body.note || req.body.observacao || '').trim();
      if (!variantId) return json(res, 400, { sucesso: false, erro: 'variant_id obrigatório' });
      if (!isAdjustmentSubtype(subtype)) return json(res, 400, { sucesso: false, erro: 'subtype inválido' });

      try {
        const out = await executeInventoryAdjustment(databases, {
          dbId: DB_ID,
          stockItemsCol: STOCK_ITEMS_COL,
          stockMovesCol: STOCK_MOVES_COL,
          variantId,
          quantityChange,
          subtype,
          note,
          actorUserId: me.$id,
          actorName: String(me.name || me.email || 'Usuário').trim(),
          academy_id: academyId,
        });
        if (!out.ok) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 200, {
          sucesso: true,
          quantity_before: out.quantity_before,
          quantity_after: out.quantity_after,
          variant_label: out.variant_label,
          product_name: out.product_name,
          movimento_id: out.movimento_id,
          saldos: out.saldos,
        });
      } catch (e) {
        console.error('[inventory] adjust:', e);
        return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
      }
    }

    if (action === 'correct_entry') {
      if (!STOCK_MOVES_COL) {
        return json(res, 503, { sucesso: false, erro: 'STOCK_MOVES_COL não configurado' });
      }
      const canAdmin = await isAcademyOwnerOrAdminUser(academyDoc, me);
      if (!canAdmin) {
        return json(res, 403, { ok: false, sucesso: false, erro: 'forbidden' });
      }

      const move_id = String(req.body.move_id || '').trim();
      const correction = String(req.body.correction || '').trim().toLowerCase();
      if (!move_id) return json(res, 400, { ok: false, sucesso: false, erro: 'move_id_required' });

      let academyFull = academyDoc;
      if (ACADEMIES_COL) {
        try {
          academyFull = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        } catch {
          academyFull = academyDoc;
        }
      }

      try {
        const out = await executeStockEntryCorrection(databases, {
          dbId: DB_ID,
          stockMovesCol: STOCK_MOVES_COL,
          stockItemsCol: STOCK_ITEMS_COL,
          moveId: move_id,
          correction,
          newPurchasePrice: req.body.new_purchase_price,
          newPaymentMethod: req.body.new_payment_method,
          newQuantity: req.body.new_quantity,
          note: req.body.note,
          academyId,
          academyDoc: academyFull,
          me,
        });
        if (!out.ok) {
          return json(res, out.status || 400, {
            ok: false,
            sucesso: false,
            erro: out.error,
            partial: out.partial,
            steps_completed: out.steps_completed,
          });
        }
        return json(res, 200, { ok: true, sucesso: true, ...out });
      } catch (e) {
        console.error('[inventory] correct_entry:', e);
        return json(res, 500, { ok: false, sucesso: false, erro: apiErro(e, 'action') });
      }
    }

    if (action === 'move') {
      if (!STOCK_MOVES_COL) {
        return json(res, 503, { sucesso: false, erro: 'STOCK_MOVES_COL não configurado' });
      }
      const {
        item_estoque_id,
        tipo,
        quantidade,
        motivo,
        referencia_id,
        status_par,
        purchase_price,
        payment_method,
      } = req.body;

      let academyFull = academyDoc;
      if (ACADEMIES_COL && purchase_price != null) {
        try {
          academyFull = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        } catch {
          academyFull = academyDoc;
        }
      }

      try {
        const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, item_estoque_id);
        const stockCol = resolved?.collection || STOCK_ITEMS_COL;
        const out = await executeInventoryMove(databases, {
          dbId: DB_ID,
          stockItemsCol: stockCol,
          stockMovesCol: STOCK_MOVES_COL,
          itemEstoqueId: item_estoque_id,
          tipo,
          quantidade: Number(quantidade),
          motivo,
          referencia_id,
          usuario_id: me.$id,
          status_par,
          purchase_price,
          payment_method,
          academy_id: academyId,
          academyDoc: academyFull,
        });
        if (!out.ok) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 200, { sucesso: true, ...out });
      } catch (e) {
        console.error('[inventory] move:', e);
        return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
      }
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
