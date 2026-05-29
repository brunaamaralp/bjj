import { mapStockProductDoc } from './stockProducts.js';
import { legacyStockItemsAsParents } from './productCatalog.js';

/** Enriquece produto já mapeado (API) ou documento bruto para o picker de vendas. */
export function enrichCatalogProduct(p) {
  const base = p?.id != null && p?.$id == null ? p : mapStockProductDoc(p);
  const min = base.minimum_level;
  const qty = base.current_quantity;
  let stockLevel = 'ok';
  if (qty === 0) stockLevel = 'out';
  else if (min > 0 && qty <= min) stockLevel = 'low';

  return {
    ...base,
    stockLevel,
    canAdd: qty > 0,
  };
}

/** Produto no catálogo de vendas (inclui esgotados, desabilitados na UI). */
export function mapCatalogProduct(doc) {
  return enrichCatalogProduct(doc);
}

export function catalogProductsForSale(products) {
  return (products || []).filter((p) => p.is_for_sale && p.is_active);
}

/** Agrupa variantes pelo produto pai para o catálogo de vendas. */
/** Enriquece linha agrupada (pai + variantes) para o picker de vendas. */
export function enrichSalesParentRow(parent) {
  const vars = (parent.variants || []).map((v) => enrichCatalogProduct(v));
  const totalQty = vars.reduce((n, x) => n + Number(x.current_quantity || 0), 0);
  const canAdd = vars.some((x) => x.canAdd);
  const stockLevel = vars.some((x) => x.stockLevel === 'ok')
    ? 'ok'
    : vars.some((x) => x.stockLevel === 'low')
      ? 'low'
      : 'out';
  return {
    ...parent,
    variants: vars,
    variant_count: vars.length,
    display_label: String(parent.display_label || parent.nome || '').trim(),
    current_quantity: totalQty,
    canAdd,
    stockLevel,
    _singleVariant: vars.length === 1 ? vars[0] : null,
  };
}

export function catalogParentsFromVariants(variants) {
  const list = catalogProductsForSale(variants);
  const byParent = new Map();

  for (const v of list) {
    const enriched = enrichCatalogProduct(v);
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

/** Normaliza resposta de GET /api/products para o catálogo de vendas. */
export function normalizeSalesCatalogFromApi(data) {
  const catalogMode = data?.catalog_mode || 'legacy';
  const rawList = data?.variants || data?.products || [];

  if (catalogMode === 'parent_variant') {
    if (
      Array.isArray(data?.products) &&
      data.products.length > 0 &&
      Array.isArray(data.products[0]?.variants)
    ) {
      const parents = data.products
        .filter((p) => p.is_for_sale !== false && p.is_active !== false)
        .map((p) => ({
          ...p,
          variants: catalogProductsForSale(p.variants || []),
        }))
        .filter((p) => p.variants.length > 0);
      return parents
        .map(enrichSalesParentRow)
        .sort((a, b) => a.display_label.localeCompare(b.display_label, 'pt-BR'));
    }
    return catalogParentsFromVariants(rawList);
  }

  const mapped = rawList.map((v) => (v?.id != null && v?.$id == null ? v : mapStockProductDoc(v)));
  const forSale = catalogProductsForSale(mapped);
  return legacyStockItemsAsParents(forSale)
    .map(enrichSalesParentRow)
    .sort((a, b) => a.display_label.localeCompare(b.display_label, 'pt-BR'));
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

export function suggestUnitPrice(product, { collaborator }) {
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
