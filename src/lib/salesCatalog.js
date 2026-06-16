import { mapStockProductDoc } from './stockProducts.js';
import { legacyStockItemsAsParents } from './productCatalog.js';
import {
  aggregatePoolTotals,
  hasDualPoolFields,
  normalizeProductType,
  productTypeShowsRentalPools,
  productTypeShowsSalePools,
  rentalAvailable,
  saleQuantity,
} from './dualStockPools.js';
import { availableQuantityForLineKind, normalizeLineKind } from './saleLineKind.js';

/** Enriquece produto já mapeado (API) ou documento bruto para o picker de vendas. */
export function enrichCatalogProduct(p, parentType = null) {
  const base = p?.id != null && p?.$id == null ? p : mapStockProductDoc(p);
  const type = normalizeProductType(parentType || base.type || 'sale');
  const min = base.minimum_level;
  const legacyQty = Number(base.current_quantity) || 0;
  const saleQty = hasDualPoolFields(base) ? saleQuantity(base) : type === 'rental' ? 0 : legacyQty;
  const rentalQty = hasDualPoolFields(base) ? rentalAvailable(base) : type === 'rental' ? legacyQty : 0;
  const qtyForLevel = hasDualPoolFields(base) ? saleQty + rentalQty : legacyQty;
  let stockLevel = 'ok';
  if (qtyForLevel === 0) stockLevel = 'out';
  else if (min > 0 && qtyForLevel <= min) stockLevel = 'low';

  const canSell = productTypeShowsSalePools(type) && saleQty > 0;
  const canRent = productTypeShowsRentalPools(type) && rentalQty > 0;

  return {
    ...base,
    type,
    sale_quantity: saleQty,
    rental_available: rentalQty,
    stockLevel,
    canSell,
    canRent,
    canAdd: canSell || canRent,
    canAddSale: canSell,
    canAddRental: canRent,
  };
}

/** Produto no catálogo de vendas (inclui esgotados, desabilitados na UI). */
export function mapCatalogProduct(doc) {
  return enrichCatalogProduct(doc);
}

/** Variantes elegíveis para venda (inclui esgotadas; exclui inativas e uso interno). */
export function catalogProductsForSale(products) {
  return (products || []).filter((p) => p.is_for_sale !== false && p.is_active !== false);
}

function saleVariantsFromRows(variants) {
  return catalogProductsForSale((variants || []).map((v) => enrichCatalogProduct(v)));
}

/** Rótulo de tamanho/cor/sku para picker e carrinho. */
export function variantOptionLabel(variant) {
  const size = String(variant?.Tamanho ?? variant?.size ?? variant?.sku ?? '').trim();
  const color = String(variant?.color ?? '').trim();
  const parts = [size, color].filter(Boolean);
  return parts.join(' / ') || 'Único';
}

export function parentNeedsVariantPicker(parent) {
  return (parent?.variants || []).length > 1;
}

function normCode(raw) {
  return String(raw || '').trim().toLowerCase();
}

function variantSku(v) {
  return normCode(v?.sku);
}

/** Busca por SKU, ID de variante ou SKU do produto pai (scanner / digitação). */
export function findCatalogVariantByCode(products, rawCode) {
  const code = normCode(rawCode);
  if (!code) return { kind: 'not_found' };

  const variantSkuHits = [];
  const variantIdHits = [];

  for (const parent of products || []) {
    for (const variant of parent.variants || []) {
      if (String(variant.id).toLowerCase() === code) {
        variantIdHits.push({ parent, variant });
      }
      const sku = variantSku(variant);
      if (sku && sku !== 'único' && sku === code) {
        variantSkuHits.push({ parent, variant });
      }
    }
  }

  if (variantSkuHits.length > 1) {
    return { kind: 'ambiguous', matches: variantSkuHits };
  }
  if (variantSkuHits.length === 1) {
    const { parent, variant } = variantSkuHits[0];
    return { kind: 'variant', parent, variant };
  }
  if (variantIdHits.length > 1) {
    return { kind: 'ambiguous', matches: variantIdHits };
  }
  if (variantIdHits.length === 1) {
    const { parent, variant } = variantIdHits[0];
    return { kind: 'variant', parent, variant };
  }

  const parentSkuHits = [];
  for (const parent of products || []) {
    const parentSku = normCode(parent.sku);
    if (parentSku && parentSku !== 'único' && parentSku === code) {
      parentSkuHits.push(parent);
    }
  }

  if (parentSkuHits.length > 1) {
    return { kind: 'ambiguous', matches: parentSkuHits.map((parent) => ({ parent })) };
  }
  if (parentSkuHits.length === 1) {
    const parent = parentSkuHits[0];
    const vars = parent.variants || [];
    if (vars.length === 1) {
      return { kind: 'variant', parent, variant: vars[0] };
    }
    if (vars.length > 1) {
      return { kind: 'needs_picker', parent };
    }
    return { kind: 'not_found' };
  }

  return { kind: 'not_found' };
}

/** Localiza produto pai e variante no catálogo agrupado. */
export function findCatalogVariant(products, stockId) {
  const id = String(stockId || '').trim();
  if (!id) return null;
  for (const parent of products || []) {
    if (String(parent.id) === id) {
      const variant = parent._singleVariant || parent.variants?.[0] || null;
      return variant ? { parent, variant } : null;
    }
    const variant = (parent.variants || []).find((v) => String(v.id) === id);
    if (variant) return { parent, variant };
  }
  return null;
}

/** Opções de variante para linha do carrinho (inclui esgotadas para exibir seleção). */
export function cartVariantOptions(parent) {
  if (!parent || (parent.variants || []).length <= 1) return null;
  return parent.variants;
}

export function cartVariantOptionsForLineKind(parent, lineKind = 'sale') {
  const opts = cartVariantOptions(parent);
  if (!opts) return null;
  const kind = normalizeLineKind(lineKind);
  return opts.map((v) => ({
    ...v,
    disponivel_for_line: catalogLineAvailability(v, parent, kind),
    canAdd_for_line: variantCanAddForLineKind(v, parent, kind),
  }));
}

export function catalogLineAvailability(variant, parent, lineKind = 'sale') {
  const parentType = parent?.type || variant?.type || 'sale';
  return availableQuantityForLineKind(variant, lineKind, parentType);
}

export function variantCanAddForLineKind(variant, parent, lineKind = 'sale') {
  return catalogLineAvailability(variant, parent, lineKind) > 0;
}

export function parentShowsDualPickActions(parent) {
  const type = normalizeProductType(parent?.type);
  if (type === 'both') return Boolean(parent?.canSell || parent?.canRent);
  return Boolean(parent?.canSell && parent?.canRent);
}

export function defaultLineKindForParent(parent) {
  const type = normalizeProductType(parent?.type);
  return type === 'rental' ? 'rental' : 'sale';
}

export function patchCartLineFromCatalog(line, parent) {
  if (!line || !parent) return null;
  const variant = (parent.variants || []).find(
    (v) => String(v.id) === String(line.item_estoque_id)
  );
  if (!variant) return null;
  const lineKind = normalizeLineKind(line.line_kind);
  const avail = catalogLineAvailability(variant, parent, lineKind);
  return {
    variant_options: cartVariantOptions(parent),
    disponivel: avail,
    expected_quantity: avail,
  };
}

/** Agrupa variantes pelo produto pai para o catálogo de vendas. */
/** Enriquece linha agrupada (pai + variantes) para o picker de vendas. */
export function enrichSalesParentRow(parent) {
  const parentType = normalizeProductType(parent.type || 'sale');
  const vars = (parent.variants || []).map((v) => enrichCatalogProduct(v, parentType));
  const poolTotals = aggregatePoolTotals(vars, parentType);
  const totalQty = poolTotals.total_available;
  const canSell = vars.some((x) => x.canSell);
  const canRent = vars.some((x) => x.canRent);
  const canAdd = canSell || canRent;
  const stockLevel = vars.some((x) => x.stockLevel === 'ok')
    ? 'ok'
    : vars.some((x) => x.stockLevel === 'low')
      ? 'low'
      : 'out';
  return {
    ...parent,
    type: parentType,
    rental_price: parent.rental_price ?? null,
    variants: vars,
    variant_count: vars.length,
    display_label: String(parent.display_label || parent.nome || '').trim(),
    image_url: String(parent.image_url || vars.find((v) => v.image_url)?.image_url || '').trim(),
    current_quantity: totalQty,
    total_sale_quantity: poolTotals.total_sale_quantity,
    total_rental_available: poolTotals.total_rental_available,
    total_rental_out: poolTotals.total_rental_out,
    canSell,
    canRent,
    canAdd,
    stockLevel,
    _singleVariant: vars.length === 1 ? vars[0] : null,
  };
}

export function catalogParentsFromVariants(variants) {
  const list = saleVariantsFromRows(variants);
  const byParent = new Map();

  for (const v of list) {
    const enriched = v;
    const pid = String(v.product_id || enriched.id || '').trim() || enriched.id;
    if (!byParent.has(pid)) {
      byParent.set(pid, {
        id: pid,
        nome: enriched.nome,
        categoria: enriched.categoria,
        sale_price: enriched.sale_price,
        image_url: enriched.image_url,
        variants: [],
      });
    }
    byParent.get(pid).variants.push(enriched);
  }

  return Array.from(byParent.values())
    .map((parent) => {
      const vars = parent.variants.sort((a, b) =>
        a.display_label.localeCompare(b.display_label, 'pt-BR')
      );
      return enrichSalesParentRow({ ...parent, variants: vars });
    })
    .sort((a, b) => a.display_label.localeCompare(b.display_label, 'pt-BR'));
}

function parentEligibleForCatalog(parent) {
  if (!parent || parent.is_for_sale === false) return false;
  const type = normalizeProductType(parent.type || 'sale');
  return type !== 'supply' && type !== 'insumo';
}

function parentEligibleForSale(parent) {
  return parentEligibleForCatalog(parent);
}

function parentsFromNestedCatalogProducts(products) {
  return (products || [])
    .filter(parentEligibleForSale)
    .map((p) => {
      const variants = saleVariantsFromRows(p.variants || []);
      if (!variants.length) return null;
      return enrichSalesParentRow({ ...p, variants });
    })
    .filter(Boolean)
    .sort((a, b) =>
      String(a.display_label || a.nome).localeCompare(String(b.display_label || b.nome), 'pt-BR')
    );
}

function mergeSalesParents(primary, secondary) {
  const byId = new Map();
  for (const parent of [...(primary || []), ...(secondary || [])]) {
    const id = String(parent?.id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    const nextCount = (parent.variants || []).length;
    const prevCount = (prev?.variants || []).length;
    if (!prev || nextCount >= prevCount) byId.set(id, parent);
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.display_label || a.nome).localeCompare(String(b.display_label || b.nome), 'pt-BR')
  );
}

/** Normaliza resposta de GET /api/products para o catálogo de vendas. */
export function normalizeSalesCatalogFromApi(data) {
  const catalogMode = data?.catalog_mode || 'legacy';
  const flatVariants = Array.isArray(data?.variants) ? data.variants : [];
  const rawProducts = Array.isArray(data?.products) ? data.products : [];

  if (catalogMode === 'parent_variant') {
    const fromNested = parentsFromNestedCatalogProducts(rawProducts);
    const fromFlat = flatVariants.length ? catalogParentsFromVariants(flatVariants) : [];
    const merged = mergeSalesParents(fromNested, fromFlat);
    if (merged.length > 0) return merged;

    const legacyLike = rawProducts.length && !rawProducts.some((p) => (p?.variants || []).length > 0);
    if (legacyLike) {
      return legacyStockItemsAsParents(saleVariantsFromRows(rawProducts))
        .map(enrichSalesParentRow)
        .sort((a, b) =>
          String(a.display_label || a.nome).localeCompare(String(b.display_label || b.nome), 'pt-BR')
        );
    }
    return [];
  }

  const rawList = flatVariants.length ? flatVariants : rawProducts;
  const forSale = saleVariantsFromRows(rawList);
  return legacyStockItemsAsParents(forSale)
    .map(enrichSalesParentRow)
    .sort((a, b) =>
      String(a.display_label || a.nome).localeCompare(String(b.display_label || b.nome), 'pt-BR')
    );
}

export function groupByCategory(products) {
  const map = new Map();
  for (const p of products) {
    const cat = String(p.categoria || 'Sem categoria').trim() || 'Sem categoria';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(p);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([categoria, items]) => ({
      categoria,
      items: items.sort((a, b) =>
        String(a.display_label || a.nome).localeCompare(String(b.display_label || b.nome), 'pt-BR')
      ),
    }));
}

export function filterCatalogProducts(products, { search, category }) {
  const q = String(search || '').trim().toLowerCase();
  return (products || []).filter((p) => {
    if (category && category !== 'all' && p.categoria !== category) return false;
    if (!q) return true;
    const variantHay = (p.variants || [])
      .map((v) => `${v.nome} ${v.Tamanho} ${v.color} ${v.sku} ${v.display_label}`)
      .join(' ');
    const hay = `${p.nome} ${p.categoria} ${p.descricao} ${p.display_label} ${variantHay}`.toLowerCase();
    return hay.includes(q);
  });
}

export function filterCatalogParents(parents, opts) {
  return filterCatalogProducts(parents, opts);
}

export function catalogStockBadgeLabel(parent) {
  const type = normalizeProductType(parent?.type);
  if (type === 'both' || parentShowsDualPickActions(parent)) {
    const sale = parent?.total_sale_quantity ?? 0;
    const rental = parent?.total_rental_available ?? 0;
    if (parent.stockLevel === 'out' && sale === 0 && rental === 0) return 'Esgotado';
    if (parent.stockLevel === 'low') return `Baixo · ${sale} venda · ${rental} aluguel`;
    return `${sale} venda · ${rental} aluguel`;
  }
  if (type === 'rental') {
    const rental = parent?.total_rental_available ?? parent?.current_quantity ?? 0;
    if (parent.stockLevel === 'out') return 'Esgotado';
    if (parent.stockLevel === 'low') return `Baixo · ${rental}`;
    return `Aluguel disp. ${rental}`;
  }
  if (parent.stockLevel === 'out') return 'Esgotado';
  if (parent.stockLevel === 'low') return `Baixo · ${parent.current_quantity}`;
  return `Disp. ${parent.current_quantity}`;
}

export function suggestUnitPrice(product, { collaborator, lineKind = 'sale', parent = null } = {}) {
  const kind = normalizeLineKind(lineKind);
  const rentalPrice = Number(parent?.rental_price ?? product?.rental_price);
  if (kind === 'rental') {
    if (Number.isFinite(rentalPrice) && rentalPrice > 0) {
      return { price: rentalPrice, warning: null };
    }
    return { price: null, warning: 'Preço de aluguel não cadastrado.' };
  }
  if (collaborator) {
    if (product.cost_price != null && Number.isFinite(product.cost_price)) {
      return { price: product.cost_price, warning: null };
    }
    if (product.sale_price != null && Number.isFinite(product.sale_price)) {
      return {
        price: product.sale_price,
        warning: 'Preço de custo não cadastrado — usando preço de venda.',
      };
    }
    return { price: null, warning: 'Preço de custo não cadastrado.' };
  }
  if (product.sale_price != null && Number.isFinite(product.sale_price)) {
    return { price: product.sale_price, warning: null };
  }
  return { price: null, warning: null };
}
