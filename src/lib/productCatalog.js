import { getVariantStockStatus, resolveCurrentQuantity } from './stockInventory.js';
import { centsToNumber, maskFromNumber, parseMaskToCents } from './moneyBr.js';
import {
  aggregatePoolTotals,
  buildVariantPoolFields,
  normalizeProductType,
  productTypeShowsRentalPools,
  productTypeShowsSalePools,
  rentalAvailable,
  rentalOut,
  saleQuantity,
} from './dualStockPools.js';

const SEP = ' · ';

/** Nome base a partir de documento legado (nome pode conter " · tamanho"). */
export function parseBaseNameFromLegacyNome(nome) {
  const raw = String(nome || '').trim();
  if (!raw) return '';
  const idx = raw.indexOf(SEP);
  if (idx > 0) return raw.slice(0, idx).trim();
  return raw;
}

/** Tamanho/variação a partir de legado: campo Tamanho ou sufixo após " · ". */
export function parseLegacyVariantSize(doc) {
  const tam = String(doc?.Tamanho ?? doc?.tamanho ?? '').trim();
  if (tam) return tam;
  const nome = String(doc?.nome || '').trim();
  const idx = nome.indexOf(SEP);
  if (idx > 0) return nome.slice(idx + SEP.length).trim() || 'Único';
  const sku = String(doc?.sku || '').trim();
  if (sku && sku !== 'Único') return sku;
  return 'Único';
}

export function variantDisplayLabel(parentName, variant) {
  const base = String(parentName || '').trim();
  const size = String(variant?.size ?? variant?.Tamanho ?? '').trim();
  const color = String(variant?.color ?? '').trim();
  const parts = [];
  if (size) parts.push(size);
  if (color) parts.push(color);
  if (!parts.length) return base;
  return `${base}${SEP}${parts.join(' / ')}`;
}

function parseOptionalPrice(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function mapParentProductDoc(doc) {
  const salePrice = parseOptionalPrice(doc.sale_price);
  const costPrice = parseOptionalPrice(doc.cost_price);
  const rentalPrice = parseOptionalPrice(doc.rental_price);
  const type = normalizeProductType(doc.type || 'sale');
  return {
    id: doc.$id,
    nome: String(doc.name || doc.nome || '').trim(),
    descricao: String(doc.description || doc.descricao || '').trim(),
    categoria: String(doc.category || doc.categoria || 'Sem categoria').trim() || 'Sem categoria',
    sale_price: salePrice,
    cost_price: costPrice,
    rental_price: rentalPrice,
    type,
    is_for_sale: doc.is_for_sale !== false && type !== 'supply',
    is_active: doc.is_active !== false,
    image_url: String(doc.image_url || doc.image || doc.photo_url || '').trim(),
    supplier: String(doc.supplier || '').trim(),
    academy_id: String(doc.academy_id || '').trim(),
    created_at: doc.created_at || doc.$createdAt || '',
  };
}

export function mapVariantDoc(doc, parent) {
  const qty = resolveCurrentQuantity(doc);
  const min = Math.max(0, Number(doc.minimum_level ?? doc.min_quantity ?? 0));
  const parentName = parent?.nome || String(doc.parent_name || '').trim();
  const size = String(doc.size ?? doc.Tamanho ?? '').trim();
  const color = String(doc.color ?? '').trim();
  const priceOverride =
    doc.price_override != null && doc.price_override !== ''
      ? parseOptionalPrice(doc.price_override)
      : null;
  const costOverride =
    doc.cost_override != null && doc.cost_override !== ''
      ? parseOptionalPrice(doc.cost_override)
      : null;
  const isActive = parent?.is_active !== false && doc.is_active !== false;

  let lifecycle = 'ativo';
  if (!isActive) lifecycle = 'inativo';
  else if (qty === 0) lifecycle = 'sem_estoque';

  const row = {
    id: doc.$id,
    product_id: String(doc.product_id || parent?.id || '').trim(),
    nome: parentName,
    descricao: parent?.descricao || '',
    categoria: parent?.categoria || 'Sem categoria',
    sale_price: priceOverride ?? parent?.sale_price ?? null,
    cost_price: costOverride ?? parent?.cost_price ?? null,
    price_override: priceOverride,
    cost_override: costOverride,
    is_for_sale: parent?.is_for_sale !== false,
    is_active: isActive,
    image_url:
      parent?.image_url ||
      String(doc.image_url || doc.image || doc.photo_url || '').trim(),
    type: parent?.type || 'sale',
    size,
    color,
    Tamanho: size,
    sku: String(doc.sku || '').trim(),
    unit: String(doc.unit || 'unidade').trim() || 'unidade',
    current_quantity: qty,
    sale_quantity: saleQuantity(doc),
    rental_available: rentalAvailable(doc),
    rental_out: rentalOut(doc),
    minimum_level: min,
    status: getVariantStockStatus(qty, min),
    lifecycle,
    average_cost: Number(doc.average_cost ?? 0) || 0,
    last_purchase_cost: Number(doc.last_purchase_cost ?? 0) || 0,
    legacy_stock_item_id: String(doc.legacy_stock_item_id || '').trim() || null,
    notes: String(doc.notes || '').trim(),
    last_updated: doc.last_updated || doc.$updatedAt || '',
    display_label: variantDisplayLabel(parentName, { size, color }),
  };
  return row;
}

/** Agrupa variantes sob o produto pai para listagem. */
export function buildParentCatalogRows(parents, variants) {
  const byParent = new Map();
  for (const v of variants || []) {
    const pid = v.product_id;
    if (!pid) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(v);
  }

  return (parents || []).map((p) => {
    const vars = (byParent.get(p.id) || []).slice().sort((a, b) =>
      String(a.display_label).localeCompare(String(b.display_label), 'pt-BR')
    );
    const poolTotals = aggregatePoolTotals(vars, p.type);
    const total_quantity = poolTotals.total_quantity;
    const anyActive = vars.some((v) => v.lifecycle === 'ativo');
    const allInactive = vars.length > 0 && vars.every((v) => v.lifecycle === 'inativo');
    const allOut = vars.length > 0 && vars.every((v) => v.lifecycle === 'sem_estoque');

    let lifecycle = 'ativo';
    if (!p.is_active || allInactive) lifecycle = 'inativo';
    else if (allOut) lifecycle = 'sem_estoque';
    else if (!anyActive && vars.length > 0) lifecycle = 'sem_estoque';

    return {
      ...p,
      variants: vars,
      total_quantity,
      total_sale_quantity: poolTotals.total_sale_quantity,
      total_rental_available: poolTotals.total_rental_available,
      total_rental_out: poolTotals.total_rental_out,
      lifecycle,
      variant_count: vars.length,
    };
  });
}

/** Agrupa documentos legados STOCK_ITEMS como “pais” virtuais (1 variante = 1 doc). */
export function legacyStockItemsAsParents(mappedItems) {
  const groups = new Map();

  for (const item of mappedItems || []) {
    const base = parseBaseNameFromLegacyNome(item.nome) || item.nome;
    const key = `${base}\0${item.categoria || ''}\0${item.sale_price ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const parents = [];
  for (const items of groups.values()) {
    const first = items[0];
    const baseName = parseBaseNameFromLegacyNome(first.nome) || first.nome;
    const variants = items.map((it) => ({
      ...it,
      product_id: `legacy-group:${first.id}`,
      size: parseLegacyVariantSize(it),
      color: '',
      display_label:
        it.display_label ||
        variantDisplayLabel(baseName, { size: parseLegacyVariantSize(it) }),
    }));
    const total_quantity = variants.reduce((n, v) => n + Number(v.current_quantity || 0), 0);
    const allOut = variants.every((v) => v.lifecycle === 'sem_estoque');
    const allInactive = variants.every((v) => v.lifecycle === 'inativo');

    let lifecycle = 'ativo';
    if (allInactive) lifecycle = 'inativo';
    else if (allOut) lifecycle = 'sem_estoque';

    parents.push({
      id: variants.length === 1 ? first.id : `legacy-group:${first.id}`,
      nome: baseName,
      descricao: first.descricao,
      categoria: first.categoria,
      sale_price: first.sale_price,
      cost_price: first.cost_price,
      type: first.is_for_sale ? 'sale' : 'supply',
      is_for_sale: first.is_for_sale,
      is_active: variants.some((v) => v.is_active),
      image_url: first.image_url,
      variants,
      total_quantity,
      lifecycle,
      variant_count: variants.length,
      _legacy: true,
    });
  }

  return parents.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filterParentCatalog(parents, { search, category, statusFilter, typeFilter }) {
  const q = String(search || '').trim().toLowerCase();
  return (parents || []).filter((p) => {
    if (category && category !== 'all' && String(p.categoria) !== category) return false;
    if (typeFilter === 'for_sale' && !p.is_for_sale) return false;
    if (typeFilter === 'internal' && p.is_for_sale) return false;
    if (statusFilter === 'ativo' && p.lifecycle !== 'ativo') return false;
    if (statusFilter === 'inativo' && p.lifecycle !== 'inativo') return false;
    if (statusFilter === 'sem_estoque' && p.lifecycle !== 'sem_estoque') return false;
    if (q) {
      const hay = [
        p.nome,
        p.categoria,
        p.descricao,
        p.supplier,
        ...(p.variants || []).flatMap((v) => [v.size, v.color, v.sku, v.display_label]),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function emptyVariantRow() {
  return {
    size: '',
    color: '',
    initial_quantity: '0',
    initial_sale_quantity: '0',
    initial_rental_quantity: '0',
    minimum_level: '0',
    sku: '',
    priceOverrideMask: '',
  };
}

/** Linhas de variantes para duplicar um produto (sem ids, saldo zerado). */
export function duplicateVariantRowsFromProduct(product) {
  const list = product?.variants || [];
  if (!list.length) return [emptyVariantRow()];
  return list.map((v) => ({
    size: v.size || v.Tamanho || '',
    color: v.color || '',
    initial_quantity: '0',
    initial_sale_quantity: '0',
    initial_rental_quantity: '0',
    minimum_level: String(v.minimum_level ?? 0),
    sku: '',
  }));
}

/** Chave normalizada para combinação tamanho + cor. */
export function variantComboKey(size, color) {
  const s = String(size ?? '').trim().toLowerCase() || 'único';
  const c = String(color ?? '').trim().toLowerCase();
  return `${s}\0${c}`;
}

/** Índices de linhas com combinação duplicada (tamanho + cor). */
export function findDuplicateVariantIndexes(rows, { skipPendingDelete = true } = {}) {
  const dup = new Set();
  const seen = new Map();
  (rows || []).forEach((row, idx) => {
    if (row._deleted || row._removed) return;
    if (skipPendingDelete && row._pendingDelete) return;
    const key = variantComboKey(row.size, row.color);
    if (seen.has(key)) {
      dup.add(idx);
      dup.add(seen.get(key));
    } else {
      seen.set(key, idx);
    }
  });
  return dup;
}

/** Detecta combinações tamanho+cor repetidas entre variantes já persistidas. */
export function findDuplicateVariantIds(variants) {
  const dupIds = new Set();
  const seen = new Map();
  for (const v of variants || []) {
    const id = v?.id;
    if (!id) continue;
    const key = variantComboKey(v.size ?? v.Tamanho, v.color);
    if (seen.has(key)) {
      dupIds.add(id);
      dupIds.add(seen.get(key));
    } else {
      seen.set(key, id);
    }
  }
  return dupIds;
}

export function variantLabelForRow(row) {
  const size = String(row?.size || '').trim() || 'Único';
  const color = String(row?.color || '').trim();
  return color ? `${size} / ${color}` : size;
}

export function emptyEditVariantRow() {
  return {
    id: null,
    size: '',
    color: '',
    sku: '',
    minimum_level: '0',
    initial_quantity: '0',
    priceOverrideMask: '',
    costOverrideMask: '',
    supplier: '',
    is_active: true,
    current_quantity: 0,
    lifecycle: 'ativo',
    _isNew: true,
    _dirty: true,
    _deleted: false,
    _error: '',
    _duplicate: false,
    _pendingDelete: false,
    _savedSuccess: false,
    _initial: null,
  };
}

export function variantLifecycleLabel(lifecycle) {
  const key = String(lifecycle || 'ativo').toLowerCase();
  if (key === 'inativo') return 'Inativo';
  if (key === 'sem_estoque') return 'Sem estoque';
  return 'Ativo';
}

export function variantRowsFromProduct(product) {
  const list = product?.variants || [];
  if (!list.length) return [];
  return list.map((v) => {
    const size = v.size || v.Tamanho || '';
    const color = v.color || '';
    const sku = v.sku || '';
    const minimum_level = String(v.minimum_level ?? 0);
    const priceOverride =
      v.price_override != null && v.price_override !== '' ? Number(v.price_override) : null;
    const costOverride =
      v.cost_override != null && v.cost_override !== '' ? Number(v.cost_override) : null;
    const is_active = v.is_active !== false && String(v.lifecycle || '') !== 'inativo';
    return {
      id: v.id,
      size,
      color,
      sku,
      minimum_level,
      initial_quantity: '0',
      priceOverrideMask: priceOverride != null ? maskFromNumber(priceOverride) : '',
      costOverrideMask: costOverride != null ? maskFromNumber(costOverride) : '',
      supplier: String(v.supplier || '').trim(),
      is_active,
      current_quantity: Number(v.current_quantity) || 0,
      sale_quantity: saleQuantity(v),
      rental_available: rentalAvailable(v),
      rental_out: rentalOut(v),
      lifecycle: v.lifecycle || 'ativo',
      _isNew: false,
      _dirty: false,
      _deleted: false,
      _error: '',
      _duplicate: false,
      _pendingDelete: false,
      _initial: {
        size,
        color,
        sku,
        minimum_level,
        priceOverrideMask: priceOverride != null ? maskFromNumber(priceOverride) : '',
        costOverrideMask: costOverride != null ? maskFromNumber(costOverride) : '',
        supplier: String(v.supplier || '').trim(),
        is_active,
      },
    };
  });
}

export function variantRowIsDirty(row) {
  if (row._isNew || !row._initial) return Boolean(row._dirty);
  const init = row._initial;
  return (
    String(row.minimum_level) !== String(init.minimum_level) ||
    String(row.sku || '').trim() !== String(init.sku || '').trim() ||
    String(row.priceOverrideMask || '') !== String(init.priceOverrideMask || '') ||
    String(row.costOverrideMask || '') !== String(init.costOverrideMask || '') ||
    String(row.supplier || '').trim() !== String(init.supplier || '').trim() ||
    Boolean(row.is_active) !== Boolean(init.is_active)
  );
}

function maskToOptionalPrice(mask) {
  const raw = String(mask ?? '').trim();
  if (!raw) return null;
  const cents = parseMaskToCents(raw);
  if (cents == null) return null;
  return centsToNumber(cents);
}

/** Linhas novas ou alteradas para `save_variants` (existentes intactas ficam de fora). */
export function buildVariantsSavePayload(editVariants) {
  const payload = [];
  for (const r of editVariants || []) {
    if (r._removed) continue;
    const norm = normalizeVariantEditRow(r);
    const price_override = maskToOptionalPrice(r.priceOverrideMask);
    const cost_override = maskToOptionalPrice(r.costOverrideMask);
    const supplier = String(r.supplier || '').trim().slice(0, 120);

    if (r._isNew) {
      payload.push({
        id: null,
        size: norm.size,
        color: norm.color,
        sku: norm.sku,
        minimum_level: norm.minimum_level,
        initial_quantity: norm.initial_quantity,
        price_override,
        cost_override,
        supplier: supplier || undefined,
      });
      continue;
    }

    if (!r.id || !variantRowIsDirty(r)) continue;
    const init = r._initial || {};
    payload.push({
      id: r.id,
      size: String(init.size ?? norm.size).trim() || norm.size,
      color: String(init.color ?? norm.color).trim(),
      sku: norm.sku,
      minimum_level: norm.minimum_level,
      is_active: r.is_active !== false,
      price_override,
      cost_override,
      supplier: supplier || undefined,
    });
  }
  return payload;
}

export function hasVariantsToSave(editVariants, pendingDeleteIds = []) {
  if (pendingDeleteIds.length > 0) return true;
  return (editVariants || []).some(
    (r) => !r._removed && !r._pendingDelete && (r._isNew || variantRowIsDirty(r))
  );
}

export function normalizeVariantEditRow(row) {
  const size = String(row.size ?? '').trim().slice(0, 16) || 'Único';
  const color = String(row.color ?? '').trim().slice(0, 32);
  const sku = String(row.sku ?? '').trim().slice(0, 64);
  const minimum_level = Math.max(0, Math.trunc(Number(row.minimum_level) || 0));
  const initial_quantity = Math.max(0, Math.trunc(Number(row.initial_quantity) || 0));
  const initial_sale_quantity = Math.max(0, Math.trunc(Number(row.initial_sale_quantity) || 0));
  const initial_rental_quantity = Math.max(0, Math.trunc(Number(row.initial_rental_quantity) || 0));
  return {
    size,
    color,
    sku,
    minimum_level,
    initial_quantity,
    initial_sale_quantity,
    initial_rental_quantity,
  };
}


export function normalizeVariantsInput(rows, parentType = 'sale') {
  const type = normalizeProductType(parentType);
  const out = [];
  for (const row of rows || []) {
    const size = String(row.size ?? row.Tamanho ?? '').trim().slice(0, 16) || 'Único';
    const color = String(row.color ?? '').trim().slice(0, 32);
    const sku = String(row.sku ?? '').trim().slice(0, 64);
    const initial_quantity = Math.max(0, Math.trunc(Number(row.initial_quantity) || 0));
    const initial_sale_quantity = Math.max(
      0,
      Math.trunc(Number(row.initial_sale_quantity ?? row.initial_quantity) || 0)
    );
    const initial_rental_quantity = Math.max(
      0,
      Math.trunc(Number(row.initial_rental_quantity ?? row.initial_quantity) || 0)
    );
    const minimum_level = Math.max(0, Math.trunc(Number(row.minimum_level) || 0));
    const price_override = maskToOptionalPrice(row.priceOverrideMask);
    const pools = buildVariantPoolFields({
      parentType: type,
      initial_quantity,
      initial_sale_quantity,
      initial_rental_quantity,
    });
    const entry = {
      size,
      color,
      sku,
      initial_quantity,
      initial_sale_quantity,
      initial_rental_quantity,
      minimum_level,
      sale_quantity: pools.sale_quantity,
      rental_available: pools.rental_available,
      rental_out: pools.rental_out,
      current_quantity: pools.current_quantity,
    };
    if (price_override != null) entry.price_override = price_override;
    out.push(entry);
  }
  return out;
}

export { productTypeShowsRentalPools, productTypeShowsSalePools };

/** Localiza o produto-pai na listagem a partir do id do pai ou de uma variante. */
export function findParentByProductOrVariantId(products, id) {
  const needle = String(id || '').trim();
  if (!needle) return null;
  const direct = (products || []).find((p) => p.id === needle);
  if (direct) return direct;
  for (const p of products || []) {
    if ((p.variants || []).some((v) => v.id === needle)) return p;
  }
  return null;
}
