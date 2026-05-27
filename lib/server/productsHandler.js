import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { academyHasProductsAccess } from '../../src/lib/stockSettings.js';
import { mapStockProductDoc, buildProductPayloadFromBody, sanitizeStockItemDocument } from './stockProductMap.js';
import { executeInventoryMove, syncConsolidatedRestockForAcademy } from './inventoryMoveHandler.js';
import {
  isParentVariantCatalogEnabled,
  listCatalog,
  migrateLegacyStockItems,
  createProductWithVariants,
  updateParentProduct,
  saveProductVariantsBatch,
  resolveStockDocument,
  PRODUCTS_COL,
  PRODUCT_VARIANTS_COL,
} from './productCatalogDb.js';
import { mapVariantDoc, mapParentProductDoc } from '../../src/lib/productCatalog.js';
import {
  groupImportRowsByProductName,
  buildParentCreateBodyFromImportRows,
  importRowToSingleCreateBody,
} from '../../src/lib/productImport.js';

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
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';

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

async function countSaleItemsForProduct(itemId, academyId) {
  const id = String(itemId || '').trim();
  if (!id) return 0;

  if (SALE_ITEMS_COL && SALE_ITEMS_COL !== STOCK_ITEMS_COL) {
    try {
      const res = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
        Query.equal('item_estoque_id', [id]),
        Query.limit(1),
      ]);
      const n = Number(res.total) || (res.documents || []).length;
      if (n > 0) return n;
    } catch (e) {
      console.warn('[products] countSaleItems:', e?.message || e);
    }
  }

  if (!SALES_COL) return 0;

  const aid = String(academyId || '').trim();
  if (!aid) return 0;

  try {
    const page = await databases.listDocuments(DB_ID, SALES_COL, [
      Query.equal('academyId', [aid]),
      Query.limit(100),
    ]);
    for (const sale of page.documents || []) {
      const raw = sale.itens_snapshot_json || sale.itens_snapshot;
      if (!raw) continue;
      let lines = [];
      try {
        lines = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        lines = [];
      }
      if (!Array.isArray(lines)) continue;
      if (lines.some((ln) => String(ln?.item_estoque_id || '') === id)) return 1;
    }
  } catch (e) {
    console.warn('[products] countSaleItems snapshot:', e?.message || e);
  }

  return 0;
}

async function hasStockMovesForItem(itemId) {
  if (!STOCK_MOVES_COL || STOCK_MOVES_COL === STOCK_ITEMS_COL) return false;
  const id = String(itemId || '').trim();
  if (!id) return false;
  try {
    const list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, [
      Query.equal('item_estoque_id', [id]),
      Query.limit(1),
    ]);
    return (list.documents || []).length > 0;
  } catch (e) {
    console.warn('[products] hasStockMoves:', e?.message || e);
    return false;
  }
}

async function findParentDocByName(databases, dbId, academyId, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle || !PRODUCTS_COL) return null;
  const list = await databases.listDocuments(dbId, PRODUCTS_COL, [
    Query.equal('academy_id', academyId),
    Query.limit(500),
  ]);
  return (
    (list.documents || []).find(
      (d) => String(d.name || d.nome || '').trim().toLowerCase() === needle
    ) || null
  );
}

async function listVariantsForParent(databases, dbId, productId) {
  const list = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, [
    Query.equal('product_id', productId),
    Query.limit(100),
  ]);
  return list.documents || [];
}

async function checkParentProductDelete(databases, dbId, academyId, productId) {
  const parent = await databases.getDocument(dbId, PRODUCTS_COL, productId);
  if (String(parent.academy_id || '') !== academyId) {
    return { error: 'academy_mismatch', status: 403 };
  }

  const variants = await listVariantsForParent(databases, dbId, productId);
  let has_sales = false;
  let has_stock_moves = false;
  let total_quantity = 0;

  for (const v of variants) {
    const vid = v.$id;
    const legacyId = v.legacy_stock_item_id || vid;
    const saleCount = Math.max(
      await countSaleItemsForProduct(legacyId, academyId),
      await countSaleItemsForProduct(vid, academyId)
    );
    if (saleCount > 0) has_sales = true;
    if (await hasStockMovesForItem(vid)) has_stock_moves = true;
    total_quantity += Number(v.current_quantity) || 0;
  }

  return {
    has_sales,
    has_stock_moves,
    can_delete: !has_sales && !has_stock_moves && total_quantity === 0,
    sale_count: has_sales ? 1 : 0,
    current_quantity: total_quantity,
    variant_count: variants.length,
  };
}

async function deleteParentProduct(databases, dbId, academyId, productId) {
  const check = await checkParentProductDelete(databases, dbId, academyId, productId);
  if (check.error) return check;
  if (check.has_sales) {
    return {
      error:
        'Produto com vendas registradas não pode ser excluído. Desative-o em vez de excluir.',
      status: 409,
      has_sales: true,
    };
  }
  if (check.has_stock_moves || check.current_quantity > 0) {
    return {
      error:
        'Produto com movimentações ou saldo em estoque não pode ser excluído. Desative-o ou zere o saldo antes.',
      status: 409,
      has_stock_moves: check.has_stock_moves,
      current_quantity: check.current_quantity,
    };
  }

  const variants = await listVariantsForParent(databases, dbId, productId);
  let variantsDeleted = 0;

  for (const v of variants) {
    await deleteStockMovesForItem(v.$id);
    await databases.deleteDocument(dbId, PRODUCT_VARIANTS_COL, v.$id);
    variantsDeleted += 1;
  }

  await databases.deleteDocument(dbId, PRODUCTS_COL, productId);

  try {
    await syncConsolidatedRestockForAcademy(databases, dbId, academyId, PRODUCT_VARIANTS_COL);
  } catch (syncErr) {
    console.warn('[products] restock sync after delete_product:', syncErr?.message || syncErr);
  }

  return { deleted: true, variantsDeleted, product_id: productId };
}

async function deleteStockMovesForItem(itemId) {
  if (!STOCK_MOVES_COL || STOCK_MOVES_COL === STOCK_ITEMS_COL) return { deleted: 0, errors: 0 };
  const id = String(itemId || '').trim();
  if (!id) return { deleted: 0, errors: 0 };

  let cursor = null;
  let deleted = 0;
  let errors = 0;

  for (;;) {
    const queries = [Query.equal('item_estoque_id', [id]), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let list;
    try {
      list = await databases.listDocuments(DB_ID, STOCK_MOVES_COL, queries);
    } catch (e) {
      console.warn('[products] list moves for delete:', e?.message || e);
      break;
    }
    const docs = list.documents || [];
    for (const doc of docs) {
      try {
        await databases.deleteDocument(DB_ID, STOCK_MOVES_COL, doc.$id);
        deleted += 1;
      } catch (e) {
        errors += 1;
        console.warn('[products] delete move', doc.$id, e?.message || e);
      }
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1].$id;
  }

  return { deleted, errors };
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
  if (STOCK_MOVES_COL && STOCK_MOVES_COL === STOCK_ITEMS_COL) {
    return json(res, 503, {
      sucesso: false,
      erro:
        'Configuração inválida: coleção de movimentações igual à de produtos. Corrija STOCK_MOVES_COL / VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID.',
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
      const catalog = await listCatalog(databases, DB_ID, STOCK_ITEMS_COL, academyId);
      if (catalog.catalog_mode === 'legacy') {
        const products = catalog.variants;
        return json(res, 200, { sucesso: true, catalog_mode: 'legacy', products, variants: products });
      }
      return json(res, 200, {
        sucesso: true,
        catalog_mode: 'parent_variant',
        products: catalog.products,
        variants: catalog.variants,
        needs_migration: Boolean(catalog.needs_migration),
      });
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

    if (action === 'migrate') {
      if (!isParentVariantCatalogEnabled()) {
        return json(res, 503, { sucesso: false, erro: 'Coleções products/product_variants não configuradas' });
      }
      try {
        const result = await migrateLegacyStockItems(
          databases,
          DB_ID,
          STOCK_ITEMS_COL,
          STOCK_MOVES_COL,
          academyId,
          me
        );
        if (result.error) return json(res, result.status || 500, { sucesso: false, erro: result.error });
        const catalog = await listCatalog(databases, DB_ID, STOCK_ITEMS_COL, academyId);
        return json(res, 200, {
          sucesso: true,
          ...result,
          products: catalog.products,
          variants: catalog.variants,
          catalog_mode: 'parent_variant',
        });
      } catch (e) {
        console.error('[products] migrate:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro na migração' });
      }
    }

    if (action === 'import_batch' && isParentVariantCatalogEnabled()) {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      if (!rows.length) {
        return json(res, 400, { sucesso: false, erro: 'rows obrigatório' });
      }
      try {
        const groups = groupImportRowsByProductName(rows);
        let parentsCreated = 0;
        let variantsCreated = 0;
        const products = [];
        const errors = [];

        for (const group of groups) {
          const body = buildParentCreateBodyFromImportRows(group);
          const out = await createProductWithVariants(databases, {
            dbId: DB_ID,
            stockItemsCol: STOCK_ITEMS_COL,
            stockMovesCol: STOCK_MOVES_COL,
            academyId,
            academyDoc,
            me,
            body,
          });
          if (out.error) {
            errors.push({ nome: body.nome, erro: out.error });
            continue;
          }
          parentsCreated += 1;
          variantsCreated += (out.variants || []).length;
          products.push(out.product);
        }

        return json(res, 201, {
          sucesso: true,
          parentsCreated,
          variantsCreated,
          products,
          errors,
          catalog_mode: 'parent_variant',
        });
      } catch (e) {
        console.error('[products] import_batch:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro na importação em lote' });
      }
    }

    if (action === 'create' && isParentVariantCatalogEnabled() && Array.isArray(req.body.variants)) {
      try {
        const out = await createProductWithVariants(databases, {
          dbId: DB_ID,
          stockItemsCol: STOCK_ITEMS_COL,
          stockMovesCol: STOCK_MOVES_COL,
          academyId,
          academyDoc,
          me,
          body: req.body,
        });
        if (out.error) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 201, { sucesso: true, product: out.product, variants: out.variants });
      } catch (e) {
        console.error('[products] create parent:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar produto' });
      }
    }

    if (action === 'create' && isParentVariantCatalogEnabled() && !Array.isArray(req.body.variants)) {
      const nome = String(req.body.nome || req.body.name || '').trim();
      if (nome) {
        try {
          const createBody = importRowToSingleCreateBody(req.body);
          const existingParent = await findParentDocByName(databases, DB_ID, academyId, nome);

          if (existingParent) {
            const variantRow = createBody.variants[0];
            const out = await saveProductVariantsBatch(databases, {
              dbId: DB_ID,
              stockMovesCol: STOCK_MOVES_COL,
              academyId,
              academyDoc,
              me,
              productId: existingParent.$id,
              rows: [{ ...variantRow, id: null }],
              unit: createBody.unit || 'unidade',
            });
            if (out.error === 'duplicate_combo') {
              return json(res, 400, {
                sucesso: false,
                erro: out.erro || 'Combinação já existe',
                code: 'duplicate_combo',
              });
            }
            if (out.error) return json(res, out.status || 400, { sucesso: false, erro: out.error });
            const parent = mapParentProductDoc(existingParent);
            return json(res, 201, {
              sucesso: true,
              product: out.product || parent,
              variants: out.variants,
              variant_added: true,
              catalog_mode: 'parent_variant',
            });
          }

          const out = await createProductWithVariants(databases, {
            dbId: DB_ID,
            stockItemsCol: STOCK_ITEMS_COL,
            stockMovesCol: STOCK_MOVES_COL,
            academyId,
            academyDoc,
            me,
            body: createBody,
          });
          if (out.error) return json(res, out.status || 400, { sucesso: false, erro: out.error });
          return json(res, 201, {
            sucesso: true,
            product: out.product,
            variants: out.variants,
            catalog_mode: 'parent_variant',
          });
        } catch (e) {
          console.error('[products] create import row:', e);
          return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar produto' });
        }
      }
    }

    if (action === 'save_variants' && isParentVariantCatalogEnabled()) {
      try {
        const out = await saveProductVariantsBatch(databases, {
          dbId: DB_ID,
          stockMovesCol: STOCK_MOVES_COL,
          academyId,
          academyDoc,
          me,
          productId: req.body.product_id,
          rows: req.body.variants || [],
          delete_variant_ids: req.body.delete_variant_ids || [],
          unit: req.body.unit || 'unidade',
        });
        if (out.error === 'duplicate_combo') {
          return json(res, 400, {
            sucesso: false,
            erro: out.erro || 'Combinação já existe',
            code: 'duplicate_combo',
            duplicate_indexes: out.duplicate_indexes,
          });
        }
        if (out.error) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 200, {
          sucesso: true,
          saved: out.saved,
          errors: out.errors,
          product: out.product,
          variants: out.variants,
        });
      } catch (e) {
        console.error('[products] save_variants:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao salvar variantes' });
      }
    }

    if (action === 'update' && isParentVariantCatalogEnabled() && req.body.product_id) {
      try {
        const out = await updateParentProduct(databases, DB_ID, academyId, req.body);
        if (out.error) return json(res, out.status || 400, { sucesso: false, erro: out.error });
        return json(res, 200, { sucesso: true, product: out.product, variants: out.variants });
      } catch (e) {
        console.error('[products] update parent:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar produto' });
      }
    }

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
      const productId = String(req.body.product_id || '').trim();
      const itemId = String(req.body.item_id || req.body.variant_id || req.body.id || '').trim();

      if (productId && isParentVariantCatalogEnabled()) {
        try {
          await databases.updateDocument(DB_ID, PRODUCTS_COL, productId, {
            is_active: false,
          });
          const vars = await databases.listDocuments(DB_ID, PRODUCT_VARIANTS_COL, [
            Query.equal('product_id', productId),
            Query.limit(100),
          ]);
          for (const v of vars.documents || []) {
            await databases.updateDocument(DB_ID, PRODUCT_VARIANTS_COL, v.$id, {
              is_active: false,
              last_updated: new Date().toISOString(),
            });
          }
          const parent = mapParentProductDoc(
            await databases.getDocument(DB_ID, PRODUCTS_COL, productId)
          );
          return json(res, 200, { sucesso: true, product: parent });
        } catch (e) {
          console.error('[products] deactivate parent:', e);
          return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao desativar produto' });
        }
      }

      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_id obrigatório' });

      const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
      if (!resolved) return json(res, 404, { sucesso: false, erro: 'not_found' });
      if (resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'academy_mismatch' });
      }

      try {
        const col = resolved.collection;
        const updated = await databases.updateDocument(DB_ID, col, itemId, {
          is_active: false,
          last_updated: new Date().toISOString(),
        });
        const product =
          col === PRODUCT_VARIANTS_COL
            ? mapVariantDoc(updated, resolved.parent)
            : mapStockProductDoc(updated);
        return json(res, 200, { sucesso: true, product });
      } catch (e) {
        console.error('[products] deactivate:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao desativar produto' });
      }
    }

    if (action === 'check_delete_product' && isParentVariantCatalogEnabled()) {
      const productId = String(req.body.product_id || '').trim();
      if (!productId) return json(res, 400, { sucesso: false, erro: 'product_id obrigatório' });
      try {
        const check = await checkParentProductDelete(databases, DB_ID, academyId, productId);
        if (check.error) return json(res, check.status || 403, { sucesso: false, erro: check.error });
        return json(res, 200, {
          sucesso: true,
          has_sales: check.has_sales,
          has_stock_moves: check.has_stock_moves,
          sale_count: check.sale_count,
          can_delete: check.can_delete,
          current_quantity: check.current_quantity,
          variant_count: check.variant_count,
        });
      } catch (e) {
        console.error('[products] check_delete_product:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao verificar produto' });
      }
    }

    if (action === 'delete_product' && isParentVariantCatalogEnabled()) {
      const productId = String(req.body.product_id || '').trim();
      if (!productId) return json(res, 400, { sucesso: false, erro: 'product_id obrigatório' });
      try {
        const out = await deleteParentProduct(databases, DB_ID, academyId, productId);
        if (out.error) {
          return json(res, out.status || 400, {
            sucesso: false,
            erro: out.error,
            has_sales: Boolean(out.has_sales),
            has_stock_moves: Boolean(out.has_stock_moves),
          });
        }
        return json(res, 200, {
          sucesso: true,
          deleted: out.deleted,
          variantsDeleted: out.variantsDeleted,
          product_id: out.product_id,
        });
      } catch (e) {
        console.error('[products] delete_product:', e);
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao excluir produto' });
      }
    }

    if (action === 'check_delete') {
      const itemId = String(req.body.item_id || req.body.variant_id || req.body.id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_id obrigatório' });

      const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
      if (!resolved) return json(res, 404, { sucesso: false, erro: 'not_found' });
      if (resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'academy_mismatch' });
      }

      const legacyId = resolved.doc.legacy_stock_item_id || itemId;
      const saleCount = await countSaleItemsForProduct(legacyId, academyId);
      const saleCountVariant = await countSaleItemsForProduct(itemId, academyId);
      const totalSales = Math.max(saleCount, saleCountVariant);
      const product =
        resolved.collection === PRODUCT_VARIANTS_COL
          ? mapVariantDoc(resolved.doc, resolved.parent)
          : mapStockProductDoc(resolved.doc);
      return json(res, 200, {
        sucesso: true,
        has_sales: totalSales > 0,
        sale_count: totalSales,
        can_delete: totalSales === 0,
        current_quantity: product.current_quantity,
      });
    }

    if (action === 'delete') {
      const itemId = String(req.body.item_id || req.body.variant_id || req.body.id || '').trim();
      if (!itemId) return json(res, 400, { sucesso: false, erro: 'item_id obrigatório' });

      const resolved = await resolveStockDocument(databases, DB_ID, STOCK_ITEMS_COL, itemId);
      if (!resolved) return json(res, 404, { sucesso: false, erro: 'not_found' });
      if (resolved.doc.academy_id && String(resolved.doc.academy_id) !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'academy_mismatch' });
      }

      const legacyId = resolved.doc.legacy_stock_item_id || itemId;
      const saleCount = Math.max(
        await countSaleItemsForProduct(legacyId, academyId),
        await countSaleItemsForProduct(itemId, academyId)
      );
      if (saleCount > 0) {
        return json(res, 409, {
          sucesso: false,
          has_sales: true,
          erro:
            'Produto com vendas registradas não pode ser excluído. Desative-o em vez de excluir.',
        });
      }

      try {
        const col = resolved.collection;
        await deleteStockMovesForItem(itemId);
        await databases.deleteDocument(DB_ID, col, itemId);
        const stockColForSync = isParentVariantCatalogEnabled() ? PRODUCT_VARIANTS_COL : STOCK_ITEMS_COL;
        try {
          await syncConsolidatedRestockForAcademy(databases, DB_ID, academyId, stockColForSync);
        } catch (syncErr) {
          console.warn('[products] restock sync after delete:', syncErr?.message || syncErr);
        }
        return json(res, 200, { sucesso: true, item_id: itemId });
      } catch (e) {
        console.error('[products] delete:', e);
        const msg = String(e?.message || e || '');
        if (/not found|404/i.test(msg)) {
          return json(res, 200, { sucesso: true, item_id: itemId, already_deleted: true });
        }
        return json(res, 500, { sucesso: false, erro: msg || 'Erro ao excluir produto' });
      }
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
