/**
 * Fase 2b — Remapeamento terciário de stock_moves órfãos e resolução de stock ids legados.
 * Complementa secondary: fuzzy stock_items, size-set de produtos antigos, match por tamanho sem cor.
 */
import {
  normalizeParentNameKey,
  parseBaseNameFromLegacyNome,
  parseLegacyVariantSize,
} from './productCatalog.js';
import {
  bootstrapOldProductToNewProduct,
  indexVariantsByLegacyId,
  indexVariantsByProductCombo,
  normText,
  variantComboKey,
} from './backfillStockMovesRemapSecondary.js';

export function normStockSize(size) {
  const x = normText(size);
  if (!x || x === 'único' || x === 'unico' || x === 'un' || x === 'u') return '';
  return x;
}

/** @param {object[]} oldVariants */
export function buildOldProductSizeSets(oldVariants) {
  const map = new Map();
  for (const ov of oldVariants || []) {
    const pid = String(ov.product_id || '').trim();
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid).add(normStockSize(ov.size));
  }
  return map;
}

/** @param {object[]} variants */
export function buildNewProductSizeSets(variants) {
  const map = new Map();
  for (const v of variants || []) {
    const pid = String(v.product_id || '').trim();
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid).add(normStockSize(v.size || v.Tamanho));
  }
  return map;
}

function jaccardSizeSets(a, b) {
  if (!a?.size || !b?.size) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 0;
}

/**
 * Ponte old product_id → new product_id via legacy_stock_item_id em qualquer variante antiga.
 * @param {object[]} oldVariants
 * @param {Map<string, object[]>} legacyByStockId
 */
export function buildOldProductBridgeViaLegacy(oldVariants, legacyByStockId) {
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
 * @param {object[]} variants
 * @param {string} productId
 * @param {string} size
 * @param {string} [color]
 */
export function matchVariantsByProductSize(variants, productId, size, color = '') {
  const pid = String(productId || '').trim();
  const wantSize = normStockSize(size);
  const wantColor = normText(color);
  return (variants || []).filter((v) => {
    if (String(v.product_id || '') !== pid) return false;
    const vs = normStockSize(v.size || v.Tamanho);
    if (wantSize !== vs) return false;
    if (!wantColor) return true;
    return normText(v.color) === wantColor;
  });
}

function pickUnique(matches, tiebreakLegacyId, stockId) {
  if (!matches?.length) return null;
  if (matches.length === 1) return matches[0];
  if (stockId) {
    const viaLegacy = matches.filter(
      (v) => String(v.legacy_stock_item_id || '').trim() === stockId
    );
    if (viaLegacy.length === 1) return viaLegacy[0];
  }
  return null;
}

/**
 * @param {string} stockId
 * @param {object} ctx
 */
export function resolveOrphanStockId(stockId, ctx = {}) {
  const id = String(stockId || '').trim();
  if (!id) return null;

  const {
    variants = [],
    oldVariants = [],
    stockItems = [],
    products = [],
    variantIds,
    legacyByStockId,
    oldProductBridge,
    oldProductSizeSets,
    newProductSizeSets,
    oldVariantById,
    stockItemById,
    productNameById,
    oldProductToNew,
  } = ctx;

  const known = variantIds || new Set((variants || []).map((v) => String(v.$id || v.id || '').trim()));
  if (known.has(id)) return { id, method: 'direct' };

  const byLegacy = legacyByStockId || indexVariantsByLegacyId(variants);
  const directLegacy = byLegacy.get(id) || [];
  if (directLegacy.length === 1) {
    return { id: String(directLegacy[0].$id || directLegacy[0].id || ''), method: 'legacy_stock_item_id' };
  }

  const ov = (oldVariantById || new Map()).get(id) || (oldVariants || []).find((o) => o.$id === id || o.id === id);
  if (ov) {
    const oldPid = String(ov.product_id || '').trim();
    const productIds = ctx.productIds || new Set((products || []).map((p) => String(p.$id || p.id || '')));

    if (oldPid && productIds.has(oldPid)) {
      const matches = matchVariantsByProductSize(variants, oldPid, ov.size, ov.color);
      const picked = pickUnique(matches, null, id);
      if (picked) {
        return { id: String(picked.$id || picked.id || ''), method: 'same_product_id_size' };
      }
    }

    const bridge = oldProductBridge || buildOldProductBridgeViaLegacy(oldVariants, byLegacy);
    const boot = oldProductToNew || bootstrapOldProductToNewProduct(oldVariants, byLegacy);

    for (const newPid of [bridge.get(oldPid), boot.get(oldPid)].filter(Boolean)) {
      const matches = matchVariantsByProductSize(variants, newPid, ov.size, ov.color);
      const picked = pickUnique(matches, null, id);
      if (picked) {
        return { id: String(picked.$id || picked.id || ''), method: 'old_product_bridge_size' };
      }
    }

    const oldSets = oldProductSizeSets || buildOldProductSizeSets(oldVariants);
    const newSets = newProductSizeSets || buildNewProductSizeSets(variants);
    const oldSet = oldSets.get(oldPid) || new Set();
    if (oldSet.size >= 2) {
      let bestPid = null;
      let bestScore = 0;
      for (const [newPid, newSet] of newSets) {
        const score = jaccardSizeSets(oldSet, newSet);
        if (score > bestScore) {
          bestScore = score;
          bestPid = newPid;
        }
      }
      if (bestPid && bestScore >= 0.5) {
        const matches = matchVariantsByProductSize(variants, bestPid, ov.size, ov.color);
        const picked = pickUnique(matches, null, id);
        if (picked) {
          return {
            id: String(picked.$id || picked.id || ''),
            method: 'old_product_size_set',
            score: bestScore,
          };
        }
      }
    }

    const sku = normText(ov.sku);
    const wantSize = normStockSize(ov.size);
    if (sku && wantSize) {
      const skuMatches = variants.filter(
        (v) => normText(v.sku) === sku && normStockSize(v.size || v.Tamanho) === wantSize
      );
      const picked = pickUnique(skuMatches, null, id);
      if (picked) return { id: String(picked.$id || picked.id || ''), method: 'old_variant_sku_size' };
    }
  }

  const stockItem = (stockItemById || new Map()).get(id);
  if (stockItem) {
    const baseName = parseBaseNameFromLegacyNome(stockItem.nome || stockItem.name);
    const size = parseLegacyVariantSize(stockItem);
    const nameKey = normalizeParentNameKey(baseName);
    const names = productNameById || new Map((products || []).map((p) => [String(p.$id || p.id || ''), String(p.name || p.nome || '').trim()]));

    const fuzzy = (variants || []).filter((v) => {
      const parent = normText(names.get(String(v.product_id || '')) || '');
      const vSize = normStockSize(v.size || v.Tamanho);
      const wantSize = normStockSize(size);
      if (wantSize && vSize && vSize !== wantSize) return false;
      if (!nameKey || !parent) return false;
      return parent.includes(nameKey) || nameKey.includes(parent) || parent.startsWith(nameKey) || nameKey.startsWith(parent);
    });
    const picked = pickUnique(fuzzy, null, id);
    if (picked) {
      return { id: String(picked.$id || picked.id || ''), method: 'stock_item_fuzzy_prefix' };
    }
  }

  return null;
}

/**
 * @param {object} ctx
 */
export function buildTertiaryStockMoveRemapPlan(ctx) {
  const variants = ctx.variants || [];
  const moves = ctx.moves || [];
  const variantIds = ctx.variantIds || new Set(variants.map((v) => String(v.$id || v.id || '').trim()));

  const legacyByStockId = indexVariantsByLegacyId(variants);
  const resolverCtx = {
    variants,
    oldVariants: ctx.oldVariants || [],
    stockItems: ctx.stockItems || [],
    products: ctx.products || [],
    variantIds,
    legacyByStockId,
    oldProductBridge: buildOldProductBridgeViaLegacy(ctx.oldVariants, legacyByStockId),
    oldProductSizeSets: buildOldProductSizeSets(ctx.oldVariants),
    newProductSizeSets: buildNewProductSizeSets(variants),
    oldVariantById: new Map((ctx.oldVariants || []).map((d) => [String(d.$id || d.id || ''), d])),
    stockItemById: new Map((ctx.stockItems || []).map((d) => [String(d.$id || d.id || ''), d])),
    productNameById: new Map(
      (ctx.products || []).map((p) => [String(p.$id || p.id || ''), String(p.name || p.nome || '').trim()])
    ),
    productIds: new Set((ctx.products || []).map((p) => String(p.$id || p.id || ''))),
    oldProductToNew: bootstrapOldProductToNewProduct(ctx.oldVariants, legacyByStockId),
  };

  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];
  /** @type {object[]} */
  const unmatched = [];

  for (const move of moves) {
    const moveId = String(move.$id || move.id || '').trim();
    const oldId = String(move.item_estoque_id || '').trim();
    if (!moveId || !oldId) continue;

    if (variantIds.has(oldId)) {
      skipped.push({ move_id: moveId, reason: 'already_on_variant', item_estoque_id: oldId });
      continue;
    }

    const resolved = resolveOrphanStockId(oldId, resolverCtx);
    if (!resolved?.id || !variantIds.has(resolved.id)) {
      unmatched.push({ move_id: moveId, item_estoque_id: oldId });
      continue;
    }
    if (resolved.id === oldId) continue;

    plan.push({
      move_id: moveId,
      from_item_estoque_id: oldId,
      to_item_estoque_id: resolved.id,
      match_method: resolved.method,
      tipo: String(move.tipo || '').trim(),
      quantidade: move.quantidade,
      created_at: move.$createdAt || move.created_at || '',
    });
  }

  return { plan, skipped, unmatched, resolverCtx };
}

export function buildStockIdResolverContextExtended(variants, oldVariants = [], stockItems = [], products = []) {
  const legacyByStockId = indexVariantsByLegacyId(variants);
  return {
    variantIds: new Set((variants || []).map((v) => String(v.$id || v.id || '').trim())),
    legacyByStockId,
    variantByProductCombo: indexVariantsByProductCombo(variants),
    oldVariantById: new Map((oldVariants || []).map((d) => [String(d.$id || d.id || ''), d])),
    stockItemById: new Map((stockItems || []).map((d) => [String(d.$id || d.id || ''), d])),
    productNameById: new Map(
      (products || []).map((p) => [String(p.$id || p.id || ''), String(p.name || p.nome || '').trim()])
    ),
    oldProductToNew: bootstrapOldProductToNewProduct(oldVariants, legacyByStockId),
    variants,
    oldVariants,
    stockItems,
    products,
  };
}

export function summarizeTertiaryRemapPlan(plan, skipped = [], unmatched = []) {
  const byMethod = {};
  for (const row of plan || []) {
    byMethod[row.match_method] = (byMethod[row.match_method] || 0) + 1;
  }
  return {
    moves_to_remap: (plan || []).length,
    variants_affected: new Set((plan || []).map((p) => p.to_item_estoque_id)).size,
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
export function formatTertiaryRemapPlanCsv(plan) {
  const headers = ['move_id', 'from_item_estoque_id', 'to_item_estoque_id', 'match_method', 'tipo', 'quantidade', 'created_at'];
  const lines = [headers.join(',')];
  for (const row of plan || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Movimentos órfãos que não puderam ser remapeados — arquivar como avulso (delta 0). */
export function buildOrphanArchivePlan(unmatchedMoves) {
  return (unmatchedMoves || []).map((move) => ({
    move_id: String(move.$id || move.id || move.move_id || '').trim(),
    item_estoque_id: String(move.item_estoque_id || '').trim(),
    previous_tipo: String(move.tipo || '').trim(),
    previous_motivo: String(move.motivo || '').trim(),
  }));
}

export function isOrphanArchivedMove(move) {
  return String(move?.motivo || '').trim() === 'orphan_archived_audit';
}
