import { normalizeParentNameKey, variantComboKey, variantLabelForRow } from '../../src/lib/productCatalog.js';
import {
  hasDualPoolFields,
  rentalAvailable,
  rentalOut,
  saleQuantity,
} from '../../src/lib/dualStockPools.js';

export function parentDisplayName(doc) {
  return String(doc?.name || doc?.nome || '').trim();
}

export function parentCreatedAt(doc) {
  return String(doc?.created_at || doc?.$createdAt || '');
}

/** Contagem de variantes por product_id. */
export function buildVariantCountByParent(variantDocs) {
  const map = new Map();
  for (const v of variantDocs || []) {
    const pid = String(v.product_id || '').trim();
    if (!pid) continue;
    map.set(pid, (map.get(pid) || 0) + 1);
  }
  return map;
}

/** Ordena pais: mais variantes primeiro; empate → mais antigo. */
export function compareParentsForCanonical(a, b, variantCountByParent) {
  const aCount = variantCountByParent.get(String(a.$id || '')) || 0;
  const bCount = variantCountByParent.get(String(b.$id || '')) || 0;
  if (aCount !== bCount) return bCount - aCount;

  const aCreated = parentCreatedAt(a);
  const bCreated = parentCreatedAt(b);
  if (aCreated && bCreated && aCreated !== bCreated) {
    return aCreated < bCreated ? -1 : 1;
  }

  return String(a.$id || '').localeCompare(String(b.$id || ''));
}

/**
 * Planeja exclusão de produtos pai duplicados sem variantes.
 * Só remove pais vazios quando existe outro pai com o mesmo nome na mesma academia.
 * Pais duplicados que ainda têm variantes ficam em `warnings` (revisão manual).
 */
export function planDuplicateParentCleanup(
  parentDocs,
  variantDocs,
  { includeSoloEmpty = false } = {}
) {
  const variantCountByParent = buildVariantCountByParent(variantDocs);
  const byAcademyAndName = new Map();

  for (const p of parentDocs || []) {
    const academyId = String(p.academy_id || '').trim();
    const nameKey = normalizeParentNameKey(parentDisplayName(p));
    if (!nameKey) continue;
    const groupKey = `${academyId}\0${nameKey}`;
    if (!byAcademyAndName.has(groupKey)) byAcademyAndName.set(groupKey, []);
    byAcademyAndName.get(groupKey).push(p);
  }

  const toDelete = [];
  const warnings = [];
  const groups = [];

  for (const parents of byAcademyAndName.values()) {
    const sorted = [...parents].sort((a, b) =>
      compareParentsForCanonical(a, b, variantCountByParent)
    );
    const canonical = sorted[0];
    const academyId = String(canonical.academy_id || '').trim();
    const nameKey = normalizeParentNameKey(parentDisplayName(canonical));

    const groupReport = {
      academy_id: academyId,
      name_key: nameKey,
      display_name: parentDisplayName(canonical),
      parent_count: parents.length,
      keep_id: canonical.$id,
      keep_variant_count: variantCountByParent.get(canonical.$id) || 0,
      delete_ids: [],
      duplicate_with_variants: [],
    };

    if (parents.length === 1) {
      const soloCount = variantCountByParent.get(canonical.$id) || 0;
      if (includeSoloEmpty && soloCount === 0) {
        groupReport.delete_ids.push(canonical.$id);
        toDelete.push({
          id: canonical.$id,
          academy_id: academyId,
          name: parentDisplayName(canonical),
          reason: 'solo_empty',
          canonical_id: canonical.$id,
        });
      }
      groups.push(groupReport);
      continue;
    }

    for (const p of parents) {
      if (String(p.$id) === String(canonical.$id)) continue;

      const pid = String(p.$id || '');
      const variantCount = variantCountByParent.get(pid) || 0;

      if (variantCount === 0) {
        groupReport.delete_ids.push(pid);
        toDelete.push({
          id: pid,
          academy_id: academyId,
          name: parentDisplayName(p),
          reason: 'duplicate_empty',
          canonical_id: canonical.$id,
        });
        continue;
      }

      const warning = {
        id: pid,
        academy_id: academyId,
        name: parentDisplayName(p),
        variant_count: variantCount,
        canonical_id: canonical.$id,
      };
      groupReport.duplicate_with_variants.push(warning);
      warnings.push({
        ...warning,
        code: 'duplicate_with_variants',
        message:
          'Pai duplicado ainda tem variantes — não será excluído automaticamente. Mescle ou mova variantes antes.',
      });
    }

    groups.push(groupReport);
  }

  const duplicateGroups = groups.filter((g) => g.parent_count > 1);

  return {
    toDelete,
    warnings,
    groups,
    stats: {
      parent_total: (parentDocs || []).length,
      variant_total: (variantDocs || []).length,
      duplicate_name_groups: duplicateGroups.length,
      parents_to_delete: toDelete.length,
      warnings: warnings.length,
    },
  };
}

export function groupVariantsByParent(variantDocs) {
  const map = new Map();
  for (const v of variantDocs || []) {
    const pid = String(v.product_id || '').trim();
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(v);
  }
  return map;
}

export function variantComboLabel(variant) {
  return variantLabelForRow({
    size: variant?.size ?? variant?.Tamanho,
    color: variant?.color,
  });
}

/** Soma saldos da variante fonte na variante alvo (mesma combinação tamanho/cor). */
export function buildMergeQtyPatch(target, source) {
  const patch = { last_updated: new Date().toISOString() };

  if (hasDualPoolFields(target) || hasDualPoolFields(source)) {
    const sale = saleQuantity(target) + saleQuantity(source);
    const rental = rentalAvailable(target) + rentalAvailable(source);
    const out = rentalOut(target) + rentalOut(source);
    patch.sale_quantity = sale;
    patch.rental_available = rental;
    patch.rental_out = out;
    patch.current_quantity = sale + rental + out;
  } else {
    patch.current_quantity =
      (Number(target.current_quantity) || 0) + (Number(source.current_quantity) || 0);
  }

  patch.minimum_level = Math.max(
    Number(target.minimum_level) || 0,
    Number(source.minimum_level) || 0
  );

  return patch;
}

/**
 * Planeja fusão de variantes de pais duplicados no pai canônico.
 * - Combinação nova no canônico → move (atualiza product_id)
 * - Combinação já existente → soma saldo e remove variante fonte (se sem vendas)
 */
export function planDuplicateParentMerge(
  parentDocs,
  variantDocs,
  { saleCountsByVariantId = new Map(), includeSoloEmpty = false } = {}
) {
  const cleanup = planDuplicateParentCleanup(parentDocs, variantDocs, { includeSoloEmpty });
  const variantsByParent = groupVariantsByParent(variantDocs);

  const moves = [];
  const merges = [];
  const deleteVariants = [];
  const deleteParents = [...cleanup.toDelete.map((p) => ({ ...p, reason: p.reason }))];
  const conflicts = [];
  const parentsBlocked = new Set();

  for (const group of cleanup.groups) {
    if (group.parent_count <= 1) continue;

    const canonicalId = String(group.keep_id || '');
    const canonicalByCombo = new Map();
    for (const v of variantsByParent.get(canonicalId) || []) {
      const key = variantComboKey(v.size ?? v.Tamanho, v.color);
      if (!canonicalByCombo.has(key)) canonicalByCombo.set(key, v);
    }

    for (const dup of group.duplicate_with_variants) {
      const dupId = String(dup.id || '');
      let dupBlocked = false;

      for (const v of variantsByParent.get(dupId) || []) {
        const vid = String(v.$id || '');
        const key = variantComboKey(v.size ?? v.Tamanho, v.color);
        const sales = Number(saleCountsByVariantId.get(vid) || 0);

        const existing = canonicalByCombo.get(key);
        if (!existing) {
          moves.push({
            action: 'move',
            variant_id: vid,
            from_parent_id: dupId,
            to_parent_id: canonicalId,
            combo: key,
            label: variantComboLabel(v),
            display_name: group.display_name,
          });
          canonicalByCombo.set(key, { ...v, product_id: canonicalId });
          continue;
        }

        const targetId = String(existing.$id || '');
        if (sales > 0) {
          dupBlocked = true;
          conflicts.push({
            code: 'has_sales',
            variant_id: vid,
            target_variant_id: targetId,
            from_parent_id: dupId,
            to_parent_id: canonicalId,
            sales_count: sales,
            label: variantComboLabel(v),
            display_name: group.display_name,
            message: 'Variante duplicada tem vendas — não será fundida automaticamente',
          });
          continue;
        }

        const patch = buildMergeQtyPatch(existing, v);
        merges.push({
          action: 'merge_qty',
          source_variant_id: vid,
          target_variant_id: targetId,
          from_parent_id: dupId,
          to_parent_id: canonicalId,
          combo: key,
          label: variantComboLabel(v),
          display_name: group.display_name,
          patch,
        });
        deleteVariants.push({
          variant_id: vid,
          target_variant_id: targetId,
          from_parent_id: dupId,
          reason: 'merged_into',
        });
        canonicalByCombo.set(key, { ...existing, ...patch });
      }

      if (dupBlocked) {
        parentsBlocked.add(dupId);
        continue;
      }

      deleteParents.push({
        id: dupId,
        canonical_id: canonicalId,
        name: dup.name || group.display_name,
        reason: 'duplicate_merged',
      });
    }
  }

  return {
    moves,
    merges,
    deleteVariants,
    deleteParents,
    conflicts,
    parentsBlocked: Array.from(parentsBlocked),
    groups: cleanup.groups.filter((g) => g.parent_count > 1),
    stats: {
      ...cleanup.stats,
      variants_to_move: moves.length,
      variants_to_merge: merges.length,
      variants_to_delete: deleteVariants.length,
      parents_to_delete_after_merge: deleteParents.length,
      conflicts: conflicts.length,
      parents_blocked: parentsBlocked.size,
    },
  };
}
