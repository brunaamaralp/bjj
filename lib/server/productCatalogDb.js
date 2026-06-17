import { ID, Permission, Query, Role } from 'node-appwrite';
import { mapStockProductDoc } from '../../src/lib/stockProducts.js';
import {
  mapParentProductDoc,
  mapVariantDoc,
  buildParentCatalogRows,
  stubParentsForOrphanVariants,
  legacyStockItemsAsParents,
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
  normalizeVariantsInput,
  variantComboKey,
  variantLabelForRow,
  normalizeVariantEditRow,
} from '../../src/lib/productCatalog.js';
import {
  buildVariantPoolFields,
  normalizeProductType,
  totalPhysicalQuantity,
} from '../../src/lib/dualStockPools.js';
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

const PARENT_OPTIONAL_ATTRS = [
  'description',
  'sale_price',
  'cost_price',
  'rental_price',
  'type',
  'image_url',
  'supplier',
  'created_at',
];

const VARIANT_OPTIONAL_ATTRS = [
  'price_override',
  'cost_override',
  'supplier',
  'is_active',
  'sku',
  'minimum_level',
  'notes',
  'legacy_stock_item_id',
  'sale_quantity',
  'rental_available',
  'rental_out',
];

function pruneNullishFields(payload, keys) {
  const out = { ...payload };
  for (const key of keys) {
    if (out[key] == null) delete out[key];
  }
  return out;
}

function compactParentPayload(payload, { isUpdate } = {}) {
  const out = { ...payload };
  if (isUpdate) {
    delete out.created_at;
    delete out.academy_id;
  }
  return pruneNullishFields(out, ['sale_price', 'cost_price', 'rental_price']);
}

async function writeDocumentWithOptionalStrip(writeFn, payload, optionalAttrs) {
  let current = { ...payload };
  const maxAttempts = optionalAttrs.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await writeFn(current);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/unknown attribute/i.test(msg)) throw e;
      const next = { ...current };
      let stripped = false;
      for (const key of optionalAttrs) {
        if (key in next) {
          delete next[key];
          stripped = true;
          break;
        }
      }
      if (!stripped) throw e;
      current = next;
    }
  }
  return writeFn(current);
}

async function createParentDocument(databases, dbId, payload) {
  return writeDocumentWithOptionalStrip(
    (data) => databases.createDocument(dbId, PRODUCTS_COL, ID.unique(), data, DOC_PERMS),
    compactParentPayload(payload, { isUpdate: false }),
    PARENT_OPTIONAL_ATTRS
  );
}

async function updateParentDocument(databases, dbId, productId, payload) {
  return writeDocumentWithOptionalStrip(
    (data) => databases.updateDocument(dbId, PRODUCTS_COL, productId, data),
    compactParentPayload(payload, { isUpdate: true }),
    PARENT_OPTIONAL_ATTRS
  );
}

async function createVariantDocument(databases, dbId, payload) {
  return writeDocumentWithOptionalStrip(
    (data) => databases.createDocument(dbId, PRODUCT_VARIANTS_COL, ID.unique(), data, DOC_PERMS),
    pruneNullishFields(payload, ['price_override', 'cost_override']),
    VARIANT_OPTIONAL_ATTRS
  );
}

async function updateVariantDocument(databases, dbId, variantId, payload) {
  return writeDocumentWithOptionalStrip(
    (data) => databases.updateDocument(dbId, PRODUCT_VARIANTS_COL, variantId, data),
    pruneNullishFields(payload, ['price_override', 'cost_override']),
    VARIANT_OPTIONAL_ATTRS
  );
}

function parseOptionalPrice(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function buildParentPayload(body, academyId) {
  const name = String(body.name || body.nome || '').trim().slice(0, 128);
  if (!name) return { error: 'nome obrigatório' };
  const type = normalizeProductType(body.type);
  const isForSale = body.is_for_sale !== false && type !== 'supply';

  const payload = {
    name,
    description: String(body.description || body.descricao || '').trim().slice(0, 512),
    category: String(body.category || body.categoria || 'Sem categoria').trim().slice(0, 64) || 'Sem categoria',
    sale_price: parseOptionalPrice(body.sale_price),
    cost_price: parseOptionalPrice(body.cost_price),
    rental_price: parseOptionalPrice(body.rental_price),
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

/** Inclui itens legados (STOCK_ITEMS) sem variante vinculada no catálogo pai/variante. */
export function appendUnmigratedLegacyCatalog(products, variants, legacyDocs) {
  const pending = legacyDocs || [];
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
    // Sem catálogo pai/variante, migrated é irrelevante — exibir todo o legado.
    const variants = legacy.map(mapStockProductDoc);
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

  let variants = variantDocs.map((d) => {
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
  const orphanStubs = stubParentsForOrphanVariants(variants, parentById);
  if (orphanStubs.length) {
    const orphanRows = buildParentCatalogRows(orphanStubs, variants);
    const existingIds = new Set(products.map((p) => p.id));
    products = [...products, ...orphanRows.filter((p) => !existingIds.has(p.id))];
  }

  const linkedLegacyIds = new Set(
    (variantDocs || [])
      .map((d) => String(d.legacy_stock_item_id || '').trim())
      .filter(Boolean)
  );
  const unlinkedLegacy = legacyDocs.filter(
    (d) => !linkedLegacyIds.has(String(d.$id || '').trim())
  );
  if (unlinkedLegacy.length) {
    ({ products, variants } = appendUnmigratedLegacyCatalog(products, variants, unlinkedLegacy));
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
      const pools = buildVariantPoolFields({
        parentType: first.is_for_sale ? 'sale' : 'supply',
        initial_quantity: qty,
      });
      const variantDoc = await databases.createDocument(
        dbId,
        PRODUCT_VARIANTS_COL,
        ID.unique(),
        {
          product_id: parentDoc.$id,
          size,
          color: '',
          sku: mapped.sku || size,
          current_quantity: pools.current_quantity,
          sale_quantity: pools.sale_quantity,
          rental_available: pools.rental_available,
          rental_out: pools.rental_out,
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

  const variants = normalizeVariantsInput(body.variants, built.payload.type);
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

  const parentDoc = await createParentDocument(databases, dbId, built.payload);
  const parent = mapParentProductDoc(parentDoc);
  const createdVariants = [];

  for (const v of variants) {
    const pools = buildVariantPoolFields({
      parentType: built.payload.type,
      initial_quantity: v.initial_quantity,
      initial_sale_quantity: v.initial_sale_quantity,
      initial_rental_quantity: v.initial_rental_quantity,
      sale_quantity: v.sale_quantity,
      rental_available: v.rental_available,
      rental_out: v.rental_out,
    });
    const createPatch = {
      product_id: parentDoc.$id,
      size: v.size,
      color: v.color,
      sku: v.sku,
      current_quantity: pools.current_quantity,
      sale_quantity: pools.sale_quantity,
      rental_available: pools.rental_available,
      rental_out: pools.rental_out,
      minimum_level: v.minimum_level,
      unit: String(body.unit || 'unidade').trim().slice(0, 32) || 'unidade',
      academy_id: academyId,
      is_active: true,
      last_updated: new Date().toISOString(),
    };
    const priceOverride = parseOptionalPrice(v.price_override);
    if (priceOverride != null) createPatch.price_override = priceOverride;

    const variantDoc = await createVariantDocument(databases, dbId, createPatch);

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

  let parentDoc;
  try {
    parentDoc = await databases.getDocument(dbId, PRODUCTS_COL, pid);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/not found|404/i.test(msg)) {
      return { error: 'Produto não encontrado. Converta o cadastro legado antes de editar tamanhos.', status: 404 };
    }
    throw e;
  }
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
    const physical = totalPhysicalQuantity(doc);
    const qty = physical != null ? physical : Number(doc.current_quantity) || 0;
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
        await updateVariantDocument(databases, dbId, row.id, updatePatch);
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
        const pools = buildVariantPoolFields({
          parentType: parent.type,
          initial_quantity: norm.initial_quantity,
          initial_sale_quantity: norm.initial_sale_quantity,
          initial_rental_quantity: norm.initial_rental_quantity,
        });
        const createPatch = {
          product_id: pid,
          size: norm.size,
          color: norm.color,
          sku,
          current_quantity: pools.current_quantity,
          sale_quantity: pools.sale_quantity,
          rental_available: pools.rental_available,
          rental_out: pools.rental_out,
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

        const variantDoc = await createVariantDocument(databases, dbId, createPatch);

        if (norm.initial_quantity > 0 && stockMovesCol && pools.sale_quantity + pools.rental_available === 0) {
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

  let existing;
  try {
    existing = await databases.getDocument(dbId, PRODUCTS_COL, productId);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/not found|404/i.test(msg)) {
      return { error: 'Produto não encontrado', status: 404 };
    }
    throw e;
  }
  if (String(existing.academy_id || '') !== academyId) {
    return { error: 'academy_mismatch', status: 403 };
  }

  const built = buildParentPayload({ ...body, nome: body.name || body.nome || existing.name }, academyId);
  if (built.error) return { error: built.error, status: 400 };

  const updated = await updateParentDocument(databases, dbId, productId, built.payload);
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
