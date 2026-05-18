import { mapStockProductDoc } from './stockProducts.js';

/** Produto no catálogo de vendas (inclui esgotados, desabilitados na UI). */
export function mapCatalogProduct(doc) {
  const p = mapStockProductDoc(doc);
  const min = p.minimum_level;
  const qty = p.current_quantity;
  let stockLevel = 'ok';
  if (qty === 0) stockLevel = 'out';
  else if (min > 0 && qty <= min) stockLevel = 'low';

  return {
    ...p,
    stockLevel,
    canAdd: qty > 0,
  };
}

export function catalogProductsForSale(products) {
  return (products || []).filter((p) => p.is_for_sale && p.is_active);
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
      items: items.sort((a, b) => a.display_label.localeCompare(b.display_label, 'pt-BR')),
    }));
}

export function filterCatalogProducts(products, { search, category }) {
  const q = String(search || '').trim().toLowerCase();
  return (products || []).filter((p) => {
    if (category && category !== 'all' && p.categoria !== category) return false;
    if (!q) return true;
    const hay = `${p.nome} ${p.categoria} ${p.Tamanho} ${p.sku} ${p.descricao} ${p.display_label}`.toLowerCase();
    return hay.includes(q);
  });
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
