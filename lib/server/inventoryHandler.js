import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { academyHasInventoryModule } from '../../src/lib/stockSettings.js';
import { executeInventoryMove, executeStockItemCheck } from './inventoryMoveHandler.js';
import { resolveCurrentQuantity, computeStockStatus, itemDisplayName, itemCategory } from '../../src/lib/stockInventory.js';

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
    status: computeStockStatus(qty, min),
    sale_price: Number.isFinite(salePrice) ? salePrice : null,
    cost_price: Number.isFinite(costPrice) ? costPrice : null,
    is_for_sale: doc.is_for_sale !== false,
    is_active: doc.is_active !== false,
    last_updated: doc.last_updated || doc.$updatedAt || '',
    last_checked: doc.last_checked || '',
    notes: doc.notes || '',
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

  if (!academyHasInventoryModule(academyDoc)) {
    return json(res, 403, { sucesso: false, erro: 'Módulo de estoque desativado' });
  }

  if (method === 'GET') {
    try {
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
        .map(mapItem);
      return json(res, 200, { sucesso: true, items });
    } catch (e) {
      console.error('[inventory] list:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar estoque' });
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
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro na conferência' });
      }
    }

    if (action === 'update_item') {
      const itemId = String(req.body.item_estoque_id || req.body.item_id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_estoque_id obrigatório' });
      try {
        const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, itemId);
        if (item.academy_id && String(item.academy_id) !== academyId) {
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
        const updated = await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, itemId, patch);
        return json(res, 200, { sucesso: true, item: mapItem(updated) });
      } catch (e) {
        console.error('[inventory] update_item:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar item' });
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
        const out = await executeInventoryMove(databases, {
          dbId: DB_ID,
          stockItemsCol: STOCK_ITEMS_COL,
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
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro na movimentação' });
      }
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
