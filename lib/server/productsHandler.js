import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { academyHasProductsAccess } from '../../src/lib/stockSettings.js';
import { mapStockProductDoc, buildProductPayloadFromBody, sanitizeStockItemDocument } from './stockProductMap.js';
import { executeInventoryMove } from './inventoryMoveHandler.js';

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
const SALE_ITEMS_COL =
  process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function listAcademyProducts(academyId) {
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
  return (list.documents || [])
    .filter((d) => !d.academy_id || String(d.academy_id) === academyId)
    .map(mapStockProductDoc);
}

async function getAcademyItem(itemId, academyId) {
  const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, itemId);
  if (item.academy_id && String(item.academy_id) !== academyId) {
    return { error: 'academy_mismatch', status: 403 };
  }
  return { item };
}

export default async function productsHandler(req, res) {
  const method = req.method?.toUpperCase();

  if (!DB_ID || !STOCK_ITEMS_COL) {
    return json(res, 503, { sucesso: false, erro: 'Produtos não configurados no servidor' });
  }
  if (STOCK_MOVES_COL && STOCK_MOVES_COL === STOCK_ITEMS_COL) {
    return json(res, 503, {
      sucesso: false,
      erro: 'Configuração inválida: IDs de estoque e movimentação não podem ser iguais',
    });
  }
  if (SALE_ITEMS_COL && SALE_ITEMS_COL === STOCK_ITEMS_COL) {
    return json(res, 503, {
      sucesso: false,
      erro:
        'Configuração inválida: VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID aponta para a coleção de itens de venda (SALE_ITEMS). item_estoque_id pertence a vendas, não a produtos.',
    });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  if (!academyHasProductsAccess(academyDoc)) {
    return json(res, 403, { sucesso: false, erro: 'Módulo de produtos desativado' });
  }

  if (method === 'GET') {
    try {
      const products = await listAcademyProducts(academyId);
      return json(res, 200, { sucesso: true, products });
    } catch (e) {
      console.error('[products] list:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar produtos' });
    }
  }

  if (method === 'POST') {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json') || !req.body || typeof req.body !== 'object') {
      return json(res, 400, { sucesso: false, erro: 'Body JSON obrigatório' });
    }

    const action = String(req.body.action || 'create').toLowerCase();

    if (action === 'create') {
      const built = buildProductPayloadFromBody(req.body, { isCreate: true });
      if (built.error) return json(res, 400, { sucesso: false, erro: built.error });

      try {
        const doc = await databases.createDocument(
          DB_ID,
          STOCK_ITEMS_COL,
          ID.unique(),
          sanitizeStockItemDocument({ ...built.payload, academy_id: academyId }),
          [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
        );

        let moveResult = null;
        if (built.initial_quantity > 0) {
          if (!STOCK_MOVES_COL) {
            return json(res, 503, { sucesso: false, erro: 'Movimentações não configuradas' });
          }
          const out = await executeInventoryMove(databases, {
            dbId: DB_ID,
            stockItemsCol: STOCK_ITEMS_COL,
            stockMovesCol: STOCK_MOVES_COL,
            itemEstoqueId: doc.$id,
            tipo: 'entrada',
            quantidade: built.initial_quantity,
            motivo: 'cadastro_inicial',
            usuario_id: me.$id,
            academy_id: academyId,
            academyDoc,
          });
          if (!out.ok) {
            return json(res, out.status || 400, { sucesso: false, erro: out.error || 'Erro no saldo inicial' });
          }
          moveResult = out;
        }

        const refreshed = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, doc.$id);
        return json(res, 201, {
          sucesso: true,
          product: mapStockProductDoc(refreshed),
          move: moveResult,
        });
      } catch (e) {
        console.error('[products] create:', e);
        const msg = String(e?.message || e || '');
        if (/item_estoque_id/i.test(msg)) {
          return json(res, 400, {
            sucesso: false,
            erro:
              'A coleção de produtos (STOCK_ITEMS) está com o atributo item_estoque_id, que pertence a itens de venda. Remova esse atributo da coleção de estoque no Appwrite ou corrija VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID.',
          });
        }
        return json(res, 500, { sucesso: false, erro: msg || 'Erro ao criar produto' });
      }
    }

    if (action === 'update') {
      const itemId = String(req.body.item_id || req.body.id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_id obrigatório' });

      const got = await getAcademyItem(itemId, academyId);
      if (got.error) return json(res, got.status || 403, { sucesso: false, erro: got.error });

      const built = buildProductPayloadFromBody(req.body, { isCreate: false });
      if (built.error) return json(res, 400, { sucesso: false, erro: built.error });

      try {
        const updated = await databases.updateDocument(
          DB_ID,
          STOCK_ITEMS_COL,
          itemId,
          sanitizeStockItemDocument(built.payload)
        );
        return json(res, 200, { sucesso: true, product: mapStockProductDoc(updated) });
      } catch (e) {
        console.error('[products] update:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar produto' });
      }
    }

    if (action === 'deactivate') {
      const itemId = String(req.body.item_id || req.body.id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_id obrigatório' });

      const got = await getAcademyItem(itemId, academyId);
      if (got.error) return json(res, got.status || 403, { sucesso: false, erro: got.error });

      try {
        const updated = await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, itemId, {
          is_active: false,
          last_updated: new Date().toISOString(),
        });
        return json(res, 200, { sucesso: true, product: mapStockProductDoc(updated) });
      } catch (e) {
        console.error('[products] deactivate:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao desativar produto' });
      }
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
