import { getVariantStockStatus, resolveCurrentQuantity } from './stockInventory.js';

export const VARIANT_SIZE_PRESETS = ['P', 'M', 'G', 'GG', 'XGG'];

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
  return {
    id: doc.$id,
    nome: String(doc.name || doc.nome || '').trim(),
    descricao: String(doc.description || doc.descricao || '').trim(),
    categoria: String(doc.category || doc.categoria || 'Sem categoria').trim() || 'Sem categoria',
    sale_price: salePrice,
    cost_price: costPrice,
    type: String(doc.type || 'sale').trim() || 'sale',
    is_for_sale: doc.is_for_sale !== false && String(doc.type || 'sale') !== 'supply',
    is_active: doc.is_active !== false,
    image_url: String(doc.image_url || '').trim(),
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
    sale_price: parent?.sale_price ?? null,
    cost_price: parent?.cost_price ?? null,
    is_for_sale: parent?.is_for_sale !== false,
    is_active: isActive,
    image_url: parent?.image_url || '',
    type: parent?.type || 'sale',
    size,
    color,
    Tamanho: size,
    sku: String(doc.sku || '').trim(),
    unit: String(doc.unit || 'unidade').trim() || 'unidade',
    current_quantity: qty,
    minimum_level: min,
    status: getVariantStockStatus(qty, min),
    lifecycle,
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
    const total_quantity = vars.reduce((n, v) => n + Number(v.current_quantity || 0), 0);
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
  return { size: '', color: '', initial_quantity: '0', minimum_level: '0', sku: '' };
}

/** Chave normalizada para combinação tamanho + cor. */
export function variantComboKey(size, color) {
  const s = String(size ?? '').trim().toLowerCase() || 'único';
  const c = String(color ?? '').trim().toLowerCase();
  return `${s}\0${c}`;
}

/** Índices de linhas com combinação duplicada (tamanho + cor). */
export function findDuplicateVariantIndexes(rows) {
  const dup = new Set();
  const seen = new Map();
  (rows || []).forEach((row, idx) => {
    if (row._deleted) return;
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
    current_quantity: 0,
    _isNew: true,
    _deleted: false,
    _error: '',
    _duplicate: false,
  };
}

export function variantRowsFromProduct(product) {
  const list = product?.variants || [];
  if (!list.length) return [emptyEditVariantRow()];
  return list.map((v) => ({
    id: v.id,
    size: v.size || v.Tamanho || '',
    color: v.color || '',
    sku: v.sku || '',
    minimum_level: String(v.minimum_level ?? 0),
    initial_quantity: '0',
    current_quantity: Number(v.current_quantity) || 0,
    _isNew: false,
    _deleted: false,
    _error: '',
    _duplicate: false,
  }));
}

export function normalizeVariantEditRow(row) {
  const size = String(row.size ?? '').trim().slice(0, 16) || 'Único';
  const color = String(row.color ?? '').trim().slice(0, 32);
  const sku = String(row.sku ?? '').trim().slice(0, 64);
  const minimum_level = Math.max(0, Math.trunc(Number(row.minimum_level) || 0));
  const initial_quantity = Math.max(0, Math.trunc(Number(row.initial_quantity) || 0));
  return { size, color, sku, minimum_level, initial_quantity };
}


export function normalizeVariantsInput(rows) {
  const out = [];
  for (const row of rows || []) {
    const size = String(row.size ?? row.Tamanho ?? '').trim().slice(0, 16) || 'Único';
    const color = String(row.color ?? '').trim().slice(0, 32);
    const sku = String(row.sku ?? '').trim().slice(0, 64);
    const initial_quantity = Math.max(0, Math.trunc(Number(row.initial_quantity) || 0));
    const minimum_level = Math.max(0, Math.trunc(Number(row.minimum_level) || 0));
    out.push({ size, color, sku, initial_quantity, minimum_level });
  }
  return out;
}

export function applyDefaultSizePresets(existingRows = []) {
  const active = (existingRows || []).filter((r) => !r._deleted);
  const existingSizes = new Set(
    active.map((r) => String(r.size || '').trim().toUpperCase()).filter(Boolean)
  );
  const added = VARIANT_SIZE_PRESETS.filter((s) => !existingSizes.has(s.toUpperCase())).map((size) => ({
    ...emptyEditVariantRow(),
    size,
    initial_quantity: '0',
    minimum_level: '0',
  }));
  return [...(existingRows || []), ...added];
}
