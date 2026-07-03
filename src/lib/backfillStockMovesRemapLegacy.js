/**
 * Plano de remapeamento stock_moves.item_estoque_id → product_variants.$id
 * via variant.legacy_stock_item_id (Fase 1 backfill).
 */

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

/**
 * @param {object[]} variants
 * @param {object[]} moves
 * @param {object} [opts]
 * @param {Set<string>} [opts.variantIds] IDs do catálogo atual (opcional, pula moves já no catálogo)
 */
export function buildLegacyStockMoveRemapPlan(variants, moves, opts = {}) {
  const variantIds = opts.variantIds || new Set((variants || []).map((v) => String(v.$id || v.id || '').trim()));
  const byLegacy = indexVariantsByLegacyId(variants);

  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];

  for (const move of moves || []) {
    const moveId = String(move.$id || move.id || '').trim();
    const oldId = String(move.item_estoque_id || '').trim();
    if (!moveId || !oldId) continue;

    if (variantIds.has(oldId)) {
      skipped.push({ move_id: moveId, reason: 'already_on_variant', item_estoque_id: oldId });
      continue;
    }

    const matches = byLegacy.get(oldId);
    if (!matches?.length) {
      continue;
    }

    if (matches.length > 1) {
      skipped.push({
        move_id: moveId,
        reason: 'ambiguous_legacy',
        item_estoque_id: oldId,
        variant_ids: matches.map((v) => String(v.$id || v.id || '')),
      });
      continue;
    }

    const variant = matches[0];
    const newId = String(variant.$id || variant.id || '').trim();
    if (!newId || newId === oldId) continue;

    plan.push({
      move_id: moveId,
      from_item_estoque_id: oldId,
      to_item_estoque_id: newId,
      legacy_stock_item_id: oldId,
      variant_product_id: String(variant.product_id || '').trim(),
      variant_size: String(variant.size || variant.Tamanho || '').trim(),
      variant_color: String(variant.color || '').trim(),
      tipo: String(move.tipo || '').trim(),
      quantidade: move.quantidade,
      created_at: move.$createdAt || move.created_at || '',
    });
  }

  return { plan, skipped };
}

export function summarizeLegacyRemapPlan(plan, skipped = []) {
  const uniqueVariants = new Set((plan || []).map((p) => p.to_item_estoque_id));
  const uniqueLegacy = new Set((plan || []).map((p) => p.from_item_estoque_id));
  return {
    moves_to_remap: (plan || []).length,
    variants_affected: uniqueVariants.size,
    legacy_ids_affected: uniqueLegacy.size,
    skipped_total: (skipped || []).length,
    skipped_already_on_variant: (skipped || []).filter((s) => s.reason === 'already_on_variant').length,
    skipped_ambiguous: (skipped || []).filter((s) => s.reason === 'ambiguous_legacy').length,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} plan */
export function formatLegacyRemapPlanCsv(plan) {
  const headers = [
    'move_id',
    'from_item_estoque_id',
    'to_item_estoque_id',
    'legacy_stock_item_id',
    'variant_product_id',
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
