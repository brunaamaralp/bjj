import { ID, Permission, Query, Role } from 'node-appwrite';
import { mapStockProductDoc } from '../../src/lib/stockProducts.js';
import {
  mapParentProductDoc,
  mapVariantDoc,
  buildParentCatalogRows,
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
  normalizeVariantsInput,
  variantComboKey,
  variantLabelForRow,
  normalizeVariantEditRow,
} from '../../src/lib/productCatalog.js';
import { executeInventoryMove } from './inventoryMoveHandler.js';

export const PRODUCTS_COL =
  process.env.VITE_APPWRITE_PRODUCTS_COLLECTION_ID || process.env.PRODUCTS_COL || '';
export const PRODUCT_VARIANTS_COL =
  process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID || process.env.PRODUCT_VARIANTS_COL || '';

export function isParentVariantCatalogEnabled() {
  return Boolean(PRODUCTS_COL && PRODUCT_VARIANTS_COL);
}

const DOC_PERMS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

function parseOptionalPrice(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function buildParentPayload(body, academyId) {
  const name = String(body.name || body.nome || '').trim().slice(0, 128);
  if (!name) return { error: 'nome obrigatório' };
  const typeRaw = String(body.type || '').trim().toLowerCase();
  const type =
    typeRaw === 'supply' || typeRaw === 'insumo'
      ? 'supply'
      : typeRaw === 'rental' || typeRaw === 'aluguel'
        ? 'rental'
        : 'sale';
  const isForSale = body.is_for_sale !== false && type !== 'supply';

  return {
    payload: {
      name,
      description: String(body.description || body.descricao || '').trim().slice(0, 512),
      category: String(body.category || body.categoria || 'Sem categoria').trim().slice(0, 64) || 'Sem categoria',
      sale_price: parseOptionalPrice(body.sale_price),
      cost_price: parseOptionalPrice(body.cost_price),
      type,
      is_for_sale: isForSale,
      is_active: body.is_active !== false,
      image_url: String(body.image_url || '').trim().slice(0, 512),
      academy_id: academyId,
      created_at: new Date().toISOString(),
    },
  };
}

async function listLegacyStockItems(databases, dbId, stockItemsCol, academyId) {
  const queries = [Query.equal('academy_id', academyId), Query.limit(500)];
  let list;
  try {
    list = await databases.listDocuments(dbId, stockItemsCol, queries);
  } catch {
    list = await databases.listDocuments(dbId, stockItemsCol, [Query.limit(500)]);
  }
  return (list.documents || []).filter(
    (d) => !d.academy_id || String(d.academy_id) === academyId
  );
}

async function listParents(databases, dbId, academyId) {
  const list = await databases.listDocuments(dbId, PRODUCTS_COL, [
    Query.equal('academy_id', academyId),
    Query.limit(500),
  ]);
  return (list.documents || []).map(mapParentProductDoc);
}

async function listVariantsForAcademy(databases, dbId, academyId) {
  const list = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, [
    Query.equal('academy_id', academyId),
    Query.limit(500),
  ]);
  return list.documents || [];
}

export async function resolveStockDocument(databases, dbId, stockItemsCol, itemId) {
  const id = String(itemId || '').trim();
  if (!id) return null;

  if (isParentVariantCatalogEnabled()) {
    try {
      const variant = await databases.getDocument(dbId, PRODUCT_VARIANTS_COL, id);
      const parent = variant.product_id
        ? await databases.getDocument(dbId, PRODUCTS_COL, variant.product_id).catch(() => null)
        : null;
      return { collection: PRODUCT_VARIANTS_COL, doc: variant, parent: parent ? mapParentProductDoc(parent) : null };
    } catch {
      void 0;
    }
  }

  if (stockItemsCol) {
    const item = await databases.getDocument(dbId, stockItemsCol, id);
    return { collection: stockItemsCol, doc: item, parent: null };
  }

  return null;
}

export async function listCatalog(databases, dbId, stockItemsCol, academyId) {
  if (!isParentVariantCatalogEnabled()) {
    const legacy = await listLegacyStockItems(databases, dbId, stockItemsCol, academyId);
    const variants = legacy.filter((d) => d.migrated !== true).map(mapStockProductDoc);
    return { catalog_mode: 'legacy', products: [], variants };
  }

  const unmigrated = await countUnmigratedLegacy(databases, dbId, stockItemsCol, academyId);
  const parents = await listParents(databases, dbId, academyId);
  const variantDocs = await listVariantsForAcademy(databases, dbId, academyId);
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const variants = variantDocs.map((d) => mapVariantDoc(d, parentById.get(String(d.product_id || ''))));

  return {
    catalog_mode: 'parent_variant',
    products: buildParentCatalogRows(parents, variants),
    variants,
    needs_migration: unmigrated > 0,
  };
}

export async function countUnmigratedLegacy(databases, dbId, stockItemsCol, academyId) {
  const legacy = await listLegacyStockItems(databases, dbId, stockItemsCol, academyId);
  return legacy.filter((d) => d.migrated !== true).length;
}

export async function migrateLegacyStockItems(databases, dbId, stockItemsCol, stockMovesCol, academyId, me) {
  if (!isParentVariantCatalogEnabled()) {
    return { error: 'Coleções products/product_variants não configuradas', status: 503 };
  }

  const legacy = await listLegacyStockItems(databases, dbId, stockItemsCol, academyId);
  const pending = legacy.filter((d) => d.migrated !== true);
  if (!pending.length) {
    return { migrated_groups: 0, migrated_variants: 0, skipped: 0 };
  }

  const groups = new Map();
  for (const doc of pending) {
    const mapped = mapStockProductDoc(doc);
    const base = parseBaseNameFromLegacyNome(mapped.nome) || mapped.nome;
    const key = `${base}\0${mapped.categoria}\0${mapped.sale_price ?? ''}\0${mapped.is_for_sale ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ doc, mapped });
  }

  let migratedVariants = 0;

  for (const items of groups.values()) {
    const first = items[0].mapped;
    const firstDoc = items[0].doc;
    const baseName = parseBaseNameFromLegacyNome(first.nome) || first.nome;

    const parentDoc = await databases.createDocument(
      dbId,
      PRODUCTS_COL,
      ID.unique(),
      {
        name: baseName,
        description: first.descricao || '',
        category: first.categoria || 'Sem categoria',
        sale_price: first.sale_price,
        cost_price: first.cost_price,
        type: first.is_for_sale ? 'sale' : 'supply',
        is_for_sale: first.is_for_sale !== false,
        is_active: first.is_active !== false,
        image_url: first.image_url || '',
        academy_id: academyId,
        created_at: firstDoc.$createdAt || new Date().toISOString(),
      },
      DOC_PERMS
    );

    for (const { doc, mapped } of items) {
      const size = parseLegacyVariantSize(doc);
      const qty = mapped.current_quantity;
      const variantDoc = await databases.createDocument(
        dbId,
        PRODUCT_VARIANTS_COL,
        ID.unique(),
        {
          product_id: parentDoc.$id,
          size,
          color: '',
          sku: mapped.sku || size,
          current_quantity: qty,
          minimum_level: mapped.minimum_level || 0,
          unit: mapped.unit || 'unidade',
          academy_id: academyId,
          legacy_stock_item_id: doc.$id,
          is_active: mapped.is_active !== false,
          last_updated: new Date().toISOString(),
        },
        DOC_PERMS
      );
      migratedVariants += 1;

      try {
        await databases.updateDocument(dbId, stockItemsCol, doc.$id, {
          migrated: true,
          last_updated: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[migrate] mark migrated', doc.$id, e?.message || e);
      }

      void variantDoc;
    }
  }

  return {
    migrated_groups: groups.size,
    migrated_variants: migratedVariants,
    skipped: 0,
  };
}

export async function createProductWithVariants(
  databases,
  {
    dbId,
    stockItemsCol,
    stockMovesCol,
    academyId,
    academyDoc,
    me,
    body,
  }
) {
  if (!isParentVariantCatalogEnabled()) {
    return { error: 'Catálogo pai/variante não configurado', status: 503 };
  }

  const built = buildParentPayload(body, academyId);
  if (built.error) return { error: built.error, status: 400 };

  const variants = normalizeVariantsInput(body.variants);
  if (!variants.length) return { error: 'Ao menos uma variante é obrigatória', status: 400 };

  const parentDoc = await databases.createDocument(
    dbId,
    PRODUCTS_COL,
    ID.unique(),
    built.payload,
    DOC_PERMS
  );
  const parent = mapParentProductDoc(parentDoc);
  const createdVariants = [];

  for (const v of variants) {
    const variantDoc = await databases.createDocument(
      dbId,
      PRODUCT_VARIANTS_COL,
      ID.unique(),
      {
        product_id: parentDoc.$id,
        size: v.size,
        color: v.color,
        sku: v.sku || v.size,
        current_quantity: 0,
        minimum_level: v.minimum_level,
        unit: String(body.unit || 'unidade').trim().slice(0, 32) || 'unidade',
        academy_id: academyId,
        is_active: true,
        last_updated: new Date().toISOString(),
      },
      DOC_PERMS
    );

    if (v.initial_quantity > 0 && stockMovesCol) {
      const move = await executeInventoryMove(databases, {
        dbId,
        stockItemsCol: PRODUCT_VARIANTS_COL,
        stockMovesCol,
        itemEstoqueId: variantDoc.$id,
        tipo: 'entrada',
        quantidade: v.initial_quantity,
        motivo: 'cadastro_inicial',
        usuario_id: me.$id,
        academy_id: academyId,
        academyDoc,
      });
      if (!move.ok) {
        return { error: move.error || 'Erro no saldo inicial', status: move.status || 400 };
      }
    }

    const refreshed = await databases.getDocument(dbId, PRODUCT_VARIANTS_COL, variantDoc.$id);
    createdVariants.push(mapVariantDoc(refreshed, parent));
  }

  return {
    product: {
      ...parent,
      variants: createdVariants,
      total_quantity: createdVariants.reduce((n, x) => n + x.current_quantity, 0),
      variant_count: createdVariants.length,
      lifecycle: createdVariants.some((x) => x.lifecycle === 'ativo') ? 'ativo' : 'sem_estoque',
    },
    variants: createdVariants,
  };
}

function resolveSkuValue(sku, size, fallbackSku) {
  const s = String(sku || '').trim().slice(0, 64);
  if (s) return s;
  const fb = String(fallbackSku || '').trim();
  if (fb) return fb;
  return String(size || 'Único').trim().slice(0, 64) || 'Único';
}

async function listVariantsByProduct(databases, dbId, productId) {
  const list = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, [
    Query.equal('product_id', productId),
    Query.limit(100),
  ]);
  return list.documents || [];
}

async function skuExistsInAcademy(databases, dbId, academyId, sku, excludeVariantId) {
  const normalized = String(sku || '').trim();
  if (!normalized) return false;
  const list = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, [
    Query.equal('academy_id', academyId),
    Query.limit(500),
  ]);
  return (list.documents || []).some(
    (d) =>
      String(d.sku || '').trim().toLowerCase() === normalized.toLowerCase() &&
      String(d.$id) !== String(excludeVariantId || '')
  );
}

/**
 * Salva variantes do produto pai (PATCH/POST/DELETE independentes).
 * @returns {{ saved: number, errors: Array<{ label: string, message: string, code?: string, variant_id?: string }>, variants?: object[] }}
 */
export async function saveProductVariantsBatch(
  databases,
  {
    dbId,
    stockMovesCol,
    academyId,
    academyDoc,
    me,
    productId,
    rows,
    delete_variant_ids: deleteVariantIds = [],
    unit = 'unidade',
  }
) {
  if (!isParentVariantCatalogEnabled()) {
    return { error: 'Catálogo pai/variante não configurado', status: 503 };
  }

  const pid = String(productId || '').trim();
  if (!pid) return { error: 'product_id obrigatório', status: 400 };

  const parentDoc = await databases.getDocument(dbId, PRODUCTS_COL, pid);
  if (String(parentDoc.academy_id || '') !== academyId) {
    return { error: 'academy_mismatch', status: 403 };
  }
  const parent = mapParentProductDoc(parentDoc);

  const existing = await listVariantsByProduct(databases, dbId, pid);
  const existingById = new Map(existing.map((d) => [d.$id, d]));

  const errors = [];
  let saved = 0;

  const activeRows = rows || [];
  const comboSeen = new Map();
  for (let i = 0; i < activeRows.length; i++) {
    const norm = normalizeVariantEditRow(activeRows[i]);
    const key = variantComboKey(norm.size, norm.color);
    if (comboSeen.has(key)) {
      return {
        error: 'duplicate_combo',
        status: 400,
        duplicate_indexes: [comboSeen.get(key), i],
        erro: 'Combinação já existe',
      };
    }
    comboSeen.set(key, i);
  }

  for (const delId of deleteVariantIds) {
    const id = String(delId || '').trim();
    if (!id || !existingById.has(id)) continue;
    const doc = existingById.get(id);
    const label = variantLabelForRow({ size: doc.size, color: doc.color });
    const qty = Number(doc.current_quantity) || 0;
    if (qty > 0) {
      errors.push({
        variant_id: id,
        label,
        code: 'has_stock',
        message: 'Zere o saldo antes de excluir',
      });
      continue;
    }
    try {
      await databases.deleteDocument(dbId, PRODUCT_VARIANTS_COL, id);
      saved += 1;
    } catch (e) {
      errors.push({
        variant_id: id,
        label,
        code: 'delete_failed',
        message: String(e?.message || e),
      });
    }
  }

  for (const row of activeRows) {
    const label = variantLabelForRow(row);
    const norm = normalizeVariantEditRow(row);

    const sku = resolveSkuValue(norm.sku, norm.size, null);
    const excludeId = row.id || null;
    if (await skuExistsInAcademy(databases, dbId, academyId, sku, excludeId)) {
      errors.push({
        variant_id: row.id || null,
        label,
        code: 'sku_conflict',
        message: 'SKU já usado nesta academia',
      });
      continue;
    }

    if (row.id && existingById.has(row.id)) {
      const prev = existingById.get(row.id);
      try {
        await databases.updateDocument(dbId, PRODUCT_VARIANTS_COL, row.id, {
          size: norm.size,
          color: norm.color,
          sku: sku || prev.sku || norm.size,
          minimum_level: norm.minimum_level,
          last_updated: new Date().toISOString(),
        });
        saved += 1;
      } catch (e) {
        errors.push({
          variant_id: row.id,
          label,
          code: 'update_failed',
          message: String(e?.message || e),
        });
      }
      continue;
    }

    if (!row.id) {
      try {
        const variantDoc = await databases.createDocument(
          dbId,
          PRODUCT_VARIANTS_COL,
          ID.unique(),
          {
            product_id: pid,
            size: norm.size,
            color: norm.color,
            sku,
            current_quantity: 0,
            minimum_level: norm.minimum_level,
            unit: String(unit || 'unidade').trim().slice(0, 32) || 'unidade',
            academy_id: academyId,
            is_active: true,
            last_updated: new Date().toISOString(),
          },
          DOC_PERMS
        );

        if (norm.initial_quantity > 0 && stockMovesCol) {
          const move = await executeInventoryMove(databases, {
            dbId,
            stockItemsCol: PRODUCT_VARIANTS_COL,
            stockMovesCol,
            itemEstoqueId: variantDoc.$id,
            tipo: 'entrada',
            quantidade: norm.initial_quantity,
            motivo: 'cadastro_inicial',
            usuario_id: me.$id,
            academy_id: academyId,
            academyDoc,
          });
          if (!move.ok) {
            errors.push({
              variant_id: variantDoc.$id,
              label,
              code: 'initial_stock_failed',
              message: move.error || 'Erro no saldo inicial',
            });
            continue;
          }
        }
        saved += 1;
      } catch (e) {
        errors.push({
          variant_id: null,
          label,
          code: 'create_failed',
          message: String(e?.message || e),
        });
      }
    }
  }

  const variantDocs = await listVariantsByProduct(databases, dbId, pid);
  const variants = variantDocs.map((d) => mapVariantDoc(d, parent));

  return {
    saved,
    errors,
    variants,
    product: buildParentCatalogRows([parent], variants)[0],
  };
}

export async function updateParentProduct(databases, dbId, academyId, body) {
  const productId = String(body.product_id || body.id || '').trim();
  if (!productId) return { error: 'product_id obrigatório', status: 400 };

  const existing = await databases.getDocument(dbId, PRODUCTS_COL, productId);
  if (String(existing.academy_id || '') !== academyId) {
    return { error: 'academy_mismatch', status: 403 };
  }

  const built = buildParentPayload({ ...body, nome: body.name || body.nome || existing.name }, academyId);
  if (built.error) return { error: built.error, status: 400 };

  const updated = await databases.updateDocument(dbId, PRODUCTS_COL, productId, built.payload);
  const variantDocs = await databases.listDocuments(dbId, PRODUCT_VARIANTS_COL, [
    Query.equal('product_id', productId),
    Query.limit(100),
  ]);
  const parent = mapParentProductDoc(updated);
  const variants = (variantDocs.documents || []).map((d) => mapVariantDoc(d, parent));
  return {
    product: buildParentCatalogRows([parent], variants)[0],
    variants,
  };
}
