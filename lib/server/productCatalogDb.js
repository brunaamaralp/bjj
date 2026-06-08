import { ID, Permission, Query, Role } from 'node-appwrite';
import { mapStockProductDoc } from '../../src/lib/stockProducts.js';
import {
  mapParentProductDoc,
  mapVariantDoc,
  buildParentCatalogRows,
  legacyStockItemsAsParents,
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

  const payload = {
    name,
    description: String(body.description || body.descricao || '').trim().slice(0, 512),
    category: String(body.category || body.categoria || 'Sem categoria').trim().slice(0, 64) || 'Sem categoria',
    sale_price: parseOptionalPrice(body.sale_price),
    cost_price: parseOptionalPrice(body.cost_price),
    type,
    is_for_sale: isForSale,
    is_active: body.is_active !== false,
    image_url: String(body.image_url || '').trim().slice(0, 512),
    supplier: String(body.supplier || '').trim().slice(0, 120),
    academy_id: academyId,
    created_at: new Date().toISOString(),
  };

  return { payload };
}

function effectivePricesFromVariantDoc(variant, parent) {
  const priceOverride = parseOptionalPrice(variant?.price_override);
  const costOverride = parseOptionalPrice(variant?.cost_override);
  const parentSale = parent?.sale_price ?? parseOptionalPrice(variant?.sale_price);
  const parentCost = parent?.cost_price ?? parseOptionalPrice(variant?.cost_price);
  return {
    suggested_price: priceOverride ?? parentSale ?? null,
    suggested_cost: costOverride ?? parentCost ?? null,
    price_override: priceOverride,
    cost_override: costOverride,
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
      const parentMapped = parent ? mapParentProductDoc(parent) : null;
      const pricing = effectivePricesFromVariantDoc(variant, parentMapped);
      return {
        collection: PRODUCT_VARIANTS_COL,
        doc: variant,
        parent: parentMapped,
        suggested_price: pricing.suggested_price,
        suggested_cost: pricing.suggested_cost,
      };
    } catch {
      void 0;
    }
  }

  if (stockItemsCol) {
    try {
      const item = await databases.getDocument(dbId, stockItemsCol, id);
      const legacySale = parseOptionalPrice(item.sale_price ?? item.preco_venda);
      const legacyCost = parseOptionalPrice(item.cost_price ?? item.preco_custo);
      return {
        collection: stockItemsCol,
        doc: item,
        parent: null,
        suggested_price: legacySale,
        suggested_cost: legacyCost,
      };
    } catch {
      void 0;
    }
  }

  if (isParentVariantCatalogEnabled() && PRODUCTS_COL) {
    try {
      const parent = await databases.getDocument(dbId, PRODUCTS_COL, id);
      return { collection: null, doc: parent, parentProductOnly: true };
    } catch {
      void 0;
    }
  }

  return null;
}

/** Inclui itens legados (STOCK_ITEMS) ainda não migrados no catálogo pai/variante. */
export function appendUnmigratedLegacyCatalog(products, variants, legacyDocs, variantDocs = []) {
  const linkedLegacyIds = new Set(
    (variantDocs || [])
      .map((d) => String(d.legacy_stock_item_id || '').trim())
      .filter(Boolean)
  );
  const pending = (legacyDocs || []).filter(
    (d) => d.migrated !== true && !linkedLegacyIds.has(String(d.$id || '').trim())
  );
  if (!pending.length) {
    return { products: products || [], variants: variants || [] };
  }

  const legacyMapped = pending.map(mapStockProductDoc);
  const legacyParents = legacyStockItemsAsParents(legacyMapped);
  const nextProducts = [...(products || []), ...legacyParents];
  const nextVariants = [...(variants || [])];
  for (const parent of legacyParents) {
    for (const v of parent.variants || []) {
      nextVariants.push(v);
    }
  }
  return { products: nextProducts, variants: nextVariants };
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

  const legacyDocs = stockItemsCol ? await listLegacyStockItems(databases, dbId, stockItemsCol, academyId) : [];
  const legacyImageById = new Map(
    legacyDocs.map((d) => [d.$id, String(d.image_url || d.image || '').trim()])
  );

  const variants = variantDocs
    .filter((d) => {
      const pid = String(d.product_id || '').trim();
      return !pid || parentById.has(pid);
    })
    .map((d) => {
    const v = mapVariantDoc(d, parentById.get(String(d.product_id || '')));
    if (!v.image_url) {
      const legacyId = String(d.legacy_stock_item_id || '').trim();
      if (legacyId && legacyImageById.has(legacyId)) {
        v.image_url = legacyImageById.get(legacyId) || '';
      }
    }
    return v;
  });

  let products = buildParentCatalogRows(parents, variants);
  if (unmigrated > 0 && legacyDocs.length) {
    ({ products, variants } = appendUnmigratedLegacyCatalog(products, variants, legacyDocs, variantDocs));
  }

  return {
    catalog_mode: 'parent_variant',
    products,
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

    const migratedComboSeen = new Set();
    for (const { doc, mapped } of items) {
      const size = parseLegacyVariantSize(doc);
      const comboKey = variantComboKey(size, '');
      if (migratedComboSeen.has(comboKey)) continue;
      migratedComboSeen.add(comboKey);
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

  const comboSeen = new Map();
  for (let i = 0; i < variants.length; i++) {
    const key = variantComboKey(variants[i].size, variants[i].color);
    if (comboSeen.has(key)) {
      return {
        error: 'duplicate_combo',
        status: 400,
        duplicate_indexes: [comboSeen.get(key), i],
        erro: 'Combinação tamanho/cor duplicada no cadastro',
      };
    }
    comboSeen.set(key, i);
  }

  let parentDoc;
  try {
    parentDoc = await databases.createDocument(
      dbId,
      PRODUCTS_COL,
      ID.unique(),
      built.payload,
      DOC_PERMS
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute') && msg.includes('supplier')) {
      const lean = { ...built.payload };
      delete lean.supplier;
      parentDoc = await databases.createDocument(dbId, PRODUCTS_COL, ID.unique(), lean, DOC_PERMS);
    } else {
      throw e;
    }
  }
  const parent = mapParentProductDoc(parentDoc);
  const createdVariants = [];

  for (const v of variants) {
    const createPatch = {
      product_id: parentDoc.$id,
      size: v.size,
      color: v.color,
      sku: v.sku,
      current_quantity: 0,
      minimum_level: v.minimum_level,
      unit: String(body.unit || 'unidade').trim().slice(0, 32) || 'unidade',
      academy_id: academyId,
      is_active: true,
      last_updated: new Date().toISOString(),
    };
    const priceOverride = parseOptionalPrice(v.price_override);
    if (priceOverride != null) createPatch.price_override = priceOverride;

    let variantDoc;
    try {
      variantDoc = await databases.createDocument(
        dbId,
        PRODUCT_VARIANTS_COL,
        ID.unique(),
        createPatch,
        DOC_PERMS
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown attribute') && msg.includes('price_override')) {
        const lean = { ...createPatch };
        delete lean.price_override;
        variantDoc = await databases.createDocument(
          dbId,
          PRODUCT_VARIANTS_COL,
          ID.unique(),
          lean,
          DOC_PERMS
        );
      } else {
        throw e;
      }
    }

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
  const deleteIdSet = new Set(
    (deleteVariantIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  );

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

  const existingComboByKey = new Map();
  for (const doc of existing) {
    if (deleteIdSet.has(String(doc.$id))) continue;
    const key = variantComboKey(doc.size, doc.color);
    if (!existingComboByKey.has(key)) existingComboByKey.set(key, doc.$id);
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

    const sku = norm.sku;
    const excludeId = row.id || null;
    if (sku && (await skuExistsInAcademy(databases, dbId, academyId, sku, excludeId))) {
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
      const updatePatch = {
        size: norm.size,
        color: norm.color,
        sku,
        minimum_level: norm.minimum_level,
        last_updated: new Date().toISOString(),
      };
      const priceOverride = parseOptionalPrice(row.price_override);
      const costOverride = parseOptionalPrice(row.cost_override);
      if (priceOverride != null) updatePatch.price_override = priceOverride;
      if (costOverride != null) updatePatch.cost_override = costOverride;
      const supplier = String(row.supplier || '').trim();
      if (supplier) updatePatch.supplier = supplier.slice(0, 120);
      if (row.is_active === false) updatePatch.is_active = false;
      else if (row.is_active === true) updatePatch.is_active = true;

      try {
        await databases.updateDocument(dbId, PRODUCT_VARIANTS_COL, row.id, updatePatch);
        saved += 1;
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('Unknown attribute')) {
          const lean = { ...updatePatch };
          for (const key of [
            'price_override',
            'cost_override',
            'supplier',
            'is_active',
          ]) {
            if (!msg.includes(key)) continue;
            delete lean[key];
          }
          try {
            await databases.updateDocument(dbId, PRODUCT_VARIANTS_COL, row.id, lean);
            saved += 1;
            continue;
          } catch (e2) {
            errors.push({
              variant_id: row.id,
              label,
              code: 'update_failed',
              message: String(e2?.message || e2),
            });
            continue;
          }
        }
        errors.push({
          variant_id: row.id,
          label,
          code: 'update_failed',
          message: msg,
        });
      }
      continue;
    }

    if (!row.id) {
      const createKey = variantComboKey(norm.size, norm.color);
      if (existingComboByKey.has(createKey)) {
        errors.push({
          variant_id: null,
          label,
          code: 'duplicate_combo',
          message: 'Combinação tamanho/cor já existe neste produto',
        });
        continue;
      }
      try {
        const createPatch = {
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
        };
        const priceOverride = parseOptionalPrice(row.price_override);
        const costOverride = parseOptionalPrice(row.cost_override);
        if (priceOverride != null) createPatch.price_override = priceOverride;
        if (costOverride != null) createPatch.cost_override = costOverride;
        const supplier = String(row.supplier || '').trim();
        if (supplier) createPatch.supplier = supplier.slice(0, 120);

        let variantDoc;
        try {
          variantDoc = await databases.createDocument(
            dbId,
            PRODUCT_VARIANTS_COL,
            ID.unique(),
            createPatch,
            DOC_PERMS
          );
        } catch (e) {
          const msg = String(e?.message || '');
          if (!msg.includes('Unknown attribute')) throw e;
          const lean = { ...createPatch };
          for (const key of ['price_override', 'cost_override', 'supplier']) {
            if (msg.includes(key)) delete lean[key];
          }
          variantDoc = await databases.createDocument(
            dbId,
            PRODUCT_VARIANTS_COL,
            ID.unique(),
            lean,
            DOC_PERMS
          );
        }

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
        existingComboByKey.set(createKey, variantDoc.$id);
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

  let updated;
  try {
    updated = await databases.updateDocument(dbId, PRODUCTS_COL, productId, built.payload);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute') && msg.includes('supplier')) {
      const lean = { ...built.payload };
      delete lean.supplier;
      updated = await databases.updateDocument(dbId, PRODUCTS_COL, productId, lean);
    } else {
      throw e;
    }
  }
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
