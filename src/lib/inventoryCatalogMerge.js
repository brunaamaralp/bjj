import {
  aggregateParentStockStatus,
  getVariantStockStatus,
} from './stockInventory.js';
import {
  legacyStockItemsAsParents,
  parseLegacyVariantSize,
  variantDisplayLabel,
} from './productCatalog.js';

/** Rótulo de tamanho/cor igual à página Produtos. */
export function variantSizeLabel(v) {
  return [v?.size || v?.Tamanho, v?.color].filter(Boolean).join(' / ') || 'Único';
}

function enrichVariant(v, inv) {
  const size =
    String(v.size || v.Tamanho || inv?.Tamanho || inv?.size || '').trim() ||
    (inv ? parseLegacyVariantSize(inv) : '') ||
    parseLegacyVariantSize(v);
  const color = String(v.color || inv?.color || '').trim();
  const qty = inv?.current_quantity ?? v.current_quantity;
  const min = inv?.minimum_level ?? v.minimum_level;
  return {
    ...v,
    size,
    Tamanho: size,
    color,
    current_quantity: qty,
    minimum_level: min,
    status: getVariantStockStatus(qty, min),
    unit: inv?.unit ?? v.unit,
    average_cost: inv?.average_cost ?? v.average_cost,
    last_purchase_cost: inv?.last_purchase_cost ?? v.last_purchase_cost,
    image_url: String(inv?.image_url || v.image_url || '').trim(),
    display_label: variantDisplayLabel(v.nome || inv?.parent_nome, { size, color }),
  };
}

/**
 * Mescla catálogo de produtos (pai + variantes) com saldos da API de inventário.
 * Mesma árvore usada em Produtos, com quantidades atualizadas.
 */
export function mergeCatalogWithInventoryItems(parentProducts, inventoryItems) {
  const invById = new Map();
  for (const it of inventoryItems || []) {
    invById.set(String(it.id), it);
  }

  const catalogParentIds = new Set(
    (parentProducts || []).map((p) => String(p.id || '').trim()).filter(Boolean)
  );

  const matchedIds = new Set();
  let parents = (parentProducts || []).map((parent) => {
    const variants = (parent.variants || []).map((v) => {
      const id = String(v.id);
      matchedIds.add(id);
      return enrichVariant(v, invById.get(id));
    });
    const total_quantity = variants.reduce((n, x) => n + Number(x.current_quantity || 0), 0);
    const statuses = variants.map((x) => x.status);
    return {
      ...parent,
      nome: String(parent.nome || '').trim(),
      variants,
      total_quantity,
      variant_count: variants.length,
      hasVariants: variants.length > 1,
      status: aggregateParentStockStatus(statuses),
      image_url: String(parent.image_url || variants[0]?.image_url || '').trim(),
    };
  });

  const orphans = (inventoryItems || []).filter((it) => {
    const id = String(it.id);
    if (matchedIds.has(id)) return false;
    const pid = String(it.product_id || '').trim();
    if (pid && catalogParentIds.size > 0 && !catalogParentIds.has(pid)) return false;
    return true;
  });
  if (orphans.length) {
    const legacy = legacyStockItemsAsParents(orphans);
    for (const row of legacy) {
      const variants = (row.variants || []).map((v) => enrichVariant(v, invById.get(String(v.id))));
      const statuses = variants.map((x) => x.status);
      parents.push({
        ...row,
        variants,
        total_quantity: variants.reduce((n, x) => n + Number(x.current_quantity || 0), 0),
        variant_count: variants.length,
        hasVariants: variants.length > 1,
        status: aggregateParentStockStatus(statuses),
      });
    }
  }

  if (!parents.length && orphans.length) {
    parents = legacyStockItemsAsParents(orphans).map((row) => {
      const variants = (row.variants || []).map((v) => enrichVariant(v, invById.get(String(v.id))));
      const statuses = variants.map((x) => x.status);
      return {
        ...row,
        variants,
        total_quantity: variants.reduce((n, x) => n + Number(x.current_quantity || 0), 0),
        variant_count: variants.length,
        hasVariants: variants.length > 1,
        status: aggregateParentStockStatus(statuses),
      };
    });
  }

  return parents.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filterInventoryParents(
  parents,
  { search = '', category = 'all', statusFilter = 'all', forSaleOnly = false } = {}
) {
  const q = String(search || '').trim().toLowerCase();
  return (parents || []).filter((p) => {
    if (category !== 'all' && String(p.categoria || '') !== category) return false;
    if (forSaleOnly && p.is_for_sale === false) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!q) return true;
    const hay = [
      p.nome,
      p.categoria,
      ...(p.variants || []).flatMap((v) => [
        variantSizeLabel(v),
        v.sku,
        v.size,
        v.Tamanho,
        v.color,
        v.display_label,
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function parentSizeSummary(parent) {
  const vars = parent.variants || [];
  if (vars.length <= 1) return variantSizeLabel(vars[0]);
  return vars.map((v) => variantSizeLabel(v)).join(', ');
}
