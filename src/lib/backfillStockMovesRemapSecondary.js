/**
 * Fase 2 — Remapeamento secundário de stock_moves órfãos:
 * variantes antigas, stock_items legado, produto+tamanho via bootstrap.
 */
import {
  normalizeParentNameKey,
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
} from './productCatalog.js';

export function normText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function variantComboKey(size, color) {
  return `${normText(size)}|${normText(color)}`;
}

/** @param {object[]} variants */
export function indexVariantsByLegacyId(variants) {
  const map = new Map();
  for (const v of variants || []) {
    const legacyId = String(v.legacy_stock_item_id || v.legacyStockItemId || '').trim();
    if (!legacyId) continue;
    if (!map.has(legacyId)) map.set(legacyId, []);
    map.get(legacyId).push(v);
  }
  return map;
}

/** @param {object[]} variants */
export function indexVariantsByProductCombo(variants) {
  const map = new Map();
  for (const v of variants || []) {
    const key = `${String(v.product_id || '')}\0${variantComboKey(v.size || v.Tamanho, v.color)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v);
  }
  return map;
}

/** @param {object[]} oldVariants @param {Map<string, object[]>} legacyByStockId */
export function bootstrapOldProductToNewProduct(oldVariants, legacyByStockId) {
  const map = new Map();
  for (const ov of oldVariants || []) {
    const leg = String(ov.legacy_stock_item_id || '').trim();
    if (!leg) continue;
    const matches = legacyByStockId.get(leg) || [];
    if (matches.length !== 1) continue;
    const oldPid = String(ov.product_id || '').trim();
    const newPid = String(matches[0].product_id || '').trim();
    if (!oldPid || !newPid) continue;
    if (!map.has(oldPid)) map.set(oldPid, new Set());
    map.get(oldPid).add(newPid);
  }
  const resolved = new Map();
  for (const [oldPid, newPids] of map) {
    if (newPids.size === 1) resolved.set(oldPid, [...newPids][0]);
  }
  return resolved;
}

/**
 * @param {object} ctx
 * @param {object[]} ctx.variants
 * @param {object[]} ctx.moves
 * @param {object[]} [ctx.oldVariants]
 * @param {object[]} [ctx.stockItems]
 * @param {object[]} [ctx.products]
 * @param {Set<string>} [ctx.variantIds]
 */
export function buildSecondaryStockMoveRemapPlan(ctx) {
  const variants = ctx.variants || [];
  const moves = ctx.moves || [];
  const oldVariants = ctx.oldVariants || [];
  const stockItems = ctx.stockItems || [];
  const products = ctx.products || [];

  const variantIds = ctx.variantIds || new Set(variants.map((v) => String(v.$id || v.id || '').trim()));
  const legacyByStockId = indexVariantsByLegacyId(variants);
  const variantByProductCombo = indexVariantsByProductCombo(variants);
  const oldVariantById = new Map(oldVariants.map((d) => [String(d.$id || d.id || ''), d]));
  const stockItemById = new Map(stockItems.map((d) => [String(d.$id || d.id || ''), d]));
  const oldProductToNew = bootstrapOldProductToNewProduct(oldVariants, legacyByStockId);

  const productNameById = new Map(
    products.map((p) => [String(p.$id || p.id || ''), String(p.name || p.nome || '').trim()])
  );
  const productsByNameKey = new Map();
  for (const p of products) {
    const key = normalizeParentNameKey(p.name || p.nome);
    if (!key) continue;
    if (!productsByNameKey.has(key)) productsByNameKey.set(key, []);
    productsByNameKey.get(key).push(p);
  }

  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];
  /** @type {object[]} */
  const unmatched = [];

  const pickUnique = (matches, reason, meta) => {
    if (!matches?.length) return null;
    if (matches.length > 1) {
      skipped.push({
        ...meta,
        reason,
        variant_ids: matches.map((v) => String(v.$id || v.id || '')),
      });
      return null;
    }
    return matches[0];
  };

  const resolveTarget = (oldId, move, meta) => {
    const direct = legacyByStockId.get(oldId) || [];
    const viaDirect = pickUnique(direct, 'ambiguous_direct_legacy', { ...meta, item_estoque_id: oldId });
    if (viaDirect) {
      return { variant: viaDirect, match_method: 'direct_legacy' };
    }

    const oldVar = oldVariantById.get(oldId);
    if (oldVar) {
      const leg = String(oldVar.legacy_stock_item_id || '').trim();
      if (leg) {
        const viaLeg = pickUnique(legacyByStockId.get(leg) || [], 'ambiguous_old_variant_legacy', {
          ...meta,
          item_estoque_id: oldId,
          via_legacy_stock_item_id: leg,
        });
        if (viaLeg) return { variant: viaLeg, match_method: 'old_variant_via_legacy' };
      }

      const comboKey = `${String(oldVar.product_id || '')}\0${variantComboKey(oldVar.size, oldVar.color)}`;
      const viaCombo = pickUnique(variantByProductCombo.get(comboKey) || [], 'ambiguous_old_variant_combo', {
        ...meta,
        item_estoque_id: oldId,
      });
      if (viaCombo) return { variant: viaCombo, match_method: 'old_variant_product_combo' };

      const bootNewPid = oldProductToNew.get(String(oldVar.product_id || '').trim());
      if (bootNewPid) {
        const bootKey = `${bootNewPid}\0${variantComboKey(oldVar.size, oldVar.color)}`;
        const viaBoot = pickUnique(variantByProductCombo.get(bootKey) || [], 'ambiguous_bootstrapped_product', {
          ...meta,
          item_estoque_id: oldId,
          bootstrapped_product_id: bootNewPid,
        });
        if (viaBoot) return { variant: viaBoot, match_method: 'old_variant_bootstrapped_product' };
      }

      const sku = normText(oldVar.sku);
      const size = normText(oldVar.size);
      if (sku && size) {
        const skuMatches = variants.filter(
          (v) => normText(v.sku) === sku && normText(v.size || v.Tamanho) === size
        );
        const viaSku = pickUnique(skuMatches, 'ambiguous_sku_size', { ...meta, item_estoque_id: oldId });
        if (viaSku) return { variant: viaSku, match_method: 'old_variant_sku_size' };
      }
    }

    const stockItem = stockItemById.get(oldId);
    if (stockItem) {
      const baseName = parseBaseNameFromLegacyNome(stockItem.nome || stockItem.name);
      const size = parseLegacyVariantSize(stockItem);
      const nameKey = normalizeParentNameKey(baseName);
      const parentMatches = productsByNameKey.get(nameKey) || [];

      if (parentMatches.length === 1) {
        const pid = String(parentMatches[0].$id || parentMatches[0].id || '');
        const key = `${pid}\0${variantComboKey(size, '')}`;
        const viaParsed = pickUnique(variantByProductCombo.get(key) || [], 'ambiguous_stock_item_name_size', {
          ...meta,
          item_estoque_id: oldId,
          parsed_base: baseName,
          parsed_size: size,
        });
        if (viaParsed) return { variant: viaParsed, match_method: 'stock_item_name_size' };
      } else if (parentMatches.length > 1) {
        skipped.push({
          ...meta,
          reason: 'ambiguous_stock_item_parent',
          item_estoque_id: oldId,
          parsed_base: baseName,
        });
      }

      if (nameKey) {
        const fuzzy = variants.filter((v) => {
          const parent = normText(productNameById.get(String(v.product_id || '')) || '');
          const vSize = normText(v.size || v.Tamanho);
          if (size && size !== 'único' && vSize && vSize !== size) return false;
          return parent.includes(nameKey) || nameKey.includes(parent);
        });
        const viaFuzzy = pickUnique(fuzzy, 'ambiguous_stock_item_fuzzy', {
          ...meta,
          item_estoque_id: oldId,
          parsed_base: baseName,
        });
        if (viaFuzzy) return { variant: viaFuzzy, match_method: 'stock_item_fuzzy' };
      }
    }

    return null;
  };

  for (const move of moves) {
    const moveId = String(move.$id || move.id || '').trim();
    const oldId = String(move.item_estoque_id || '').trim();
    if (!moveId || !oldId) continue;

    if (variantIds.has(oldId)) {
      skipped.push({ move_id: moveId, reason: 'already_on_variant', item_estoque_id: oldId });
      continue;
    }

    const meta = { move_id: moveId };
    const resolved = resolveTarget(oldId, move, meta);
    if (!resolved) {
      unmatched.push({
        move_id: moveId,
        item_estoque_id: oldId,
        in_old_variants: oldVariantById.has(oldId),
        in_stock_items: stockItemById.has(oldId),
      });
      continue;
    }

    const variant = resolved.variant;
    const newId = String(variant.$id || variant.id || '').trim();
    if (!newId || newId === oldId) continue;

    plan.push({
      move_id: moveId,
      from_item_estoque_id: oldId,
      to_item_estoque_id: newId,
      match_method: resolved.match_method,
      variant_product_id: String(variant.product_id || '').trim(),
      variant_product_name: productNameById.get(String(variant.product_id || '')) || '',
      variant_size: String(variant.size || variant.Tamanho || '').trim(),
      tipo: String(move.tipo || '').trim(),
      quantidade: move.quantidade,
      created_at: move.$createdAt || move.created_at || '',
    });
  }

  return { plan, skipped, unmatched };
}

export function summarizeSecondaryRemapPlan(plan, skipped = [], unmatched = []) {
  const byMethod = {};
  for (const row of plan || []) {
    byMethod[row.match_method] = (byMethod[row.match_method] || 0) + 1;
  }
  return {
    moves_to_remap: (plan || []).length,
    variants_affected: new Set((plan || []).map((p) => p.to_item_estoque_id)).size,
    from_ids_affected: new Set((plan || []).map((p) => p.from_item_estoque_id)).size,
    by_method: byMethod,
    skipped_total: (skipped || []).length,
    unmatched_total: (unmatched || []).length,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} plan */
export function formatSecondaryRemapPlanCsv(plan) {
  const headers = [
    'move_id',
    'from_item_estoque_id',
    'to_item_estoque_id',
    'match_method',
    'variant_product_id',
    'variant_product_name',
    'variant_size',
    'tipo',
    'quantidade',
    'created_at',
  ];
  const lines = [headers.join(',')];
  for (const row of plan || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
