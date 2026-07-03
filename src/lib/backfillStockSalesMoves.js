/**
 * Fase 4 — Movimentos sintéticos de saída para vendas concluídas sem stock_move.
 * Grava apenas stock_moves (não altera current_quantity).
 */
import {
  findSaleItemsMissingStockMove,
  indexStockMovesByItemId,
  indexStockMoveKeysBySaleId,
} from './auditStockBalance.js';
import {
  bootstrapOldProductToNewProduct,
  indexVariantsByLegacyId,
  indexVariantsByProductCombo,
  variantComboKey,
} from './backfillStockMovesRemapSecondary.js';
import { resolveOrphanStockId } from './backfillStockMovesRemapTertiary.js';
import {
  movementKindForLineKind,
  normalizeLineKind,
  stockMoveMotivoForLineKind,
  stockMoveTipoForLineKind,
} from './saleLineKind.js';
import { stockMoveTipoForSchemaWrite } from '../../lib/server/stockMoveFields.js';

export { stockMoveTipoForSchemaWrite };

export const SALE_MOVE_BACKFILL_MOTIVO = 'venda_audit_backfill';
export const SALE_MOVE_BACKFILL_SOURCE = 'audit_backfill';

function saleHasOutboundMove(movesByItem, stockIds, saleId) {
  for (const stockId of stockIds) {
    const itemMoves = movesByItem.get(stockId) || [];
    const found = itemMoves.some((m) => {
      const tipo = String(m.tipo || '').toLowerCase();
      const ref = String(m.sale_id || m.referencia_id || '').trim();
      return (tipo === 'saida_venda' || tipo === 'saida_aluguel' || tipo === 'saida') && ref === saleId;
    });
    if (found) return true;
  }
  return false;
}

export function isSaleMoveBackfillMove(move) {
  const source = String(move?.source || '').trim();
  const motivo = String(move?.motivo || '').trim();
  return source === SALE_MOVE_BACKFILL_SOURCE || motivo === SALE_MOVE_BACKFILL_MOTIVO;
}

/**
 * @param {string} stockId
 * @param {object} ctx
 */
export function resolveStockIdToVariant(stockId, ctx) {
  const id = String(stockId || '').trim();
  if (!id) return null;
  if (ctx.variantIds?.has(id)) return { id, method: 'direct' };

  const legacyMatches = ctx.legacyByStockId?.get(id) || [];
  if (legacyMatches.length === 1) {
    return { id: String(legacyMatches[0].$id || legacyMatches[0].id || ''), method: 'legacy_stock_item_id' };
  }

  const oldVar = ctx.oldVariantById?.get(id);
  if (oldVar) {
    const leg = String(oldVar.legacy_stock_item_id || '').trim();
    if (leg) {
      const viaLeg = ctx.legacyByStockId?.get(leg) || [];
      if (viaLeg.length === 1) {
        return { id: String(viaLeg[0].$id || viaLeg[0].id || ''), method: 'old_variant_via_legacy' };
      }
    }
    const bootPid = ctx.oldProductToNew?.get(String(oldVar.product_id || '').trim());
    if (bootPid) {
      const key = `${bootPid}\0${variantComboKey(oldVar.size, oldVar.color)}`;
      const combo = ctx.variantByProductCombo?.get(key) || [];
      if (combo.length === 1) {
        return { id: String(combo[0].$id || combo[0].id || ''), method: 'old_variant_bootstrapped' };
      }
    }
  }

  const tertiary = resolveOrphanStockId(id, ctx);
  if (tertiary?.id && ctx.variantIds?.has(tertiary.id)) {
    return tertiary;
  }

  return null;
}

export function buildStockIdResolverContext(variants, oldVariants = [], stockItems = [], products = []) {
  const variantIds = new Set((variants || []).map((v) => String(v.$id || v.id || '').trim()));
  const legacyByStockId = indexVariantsByLegacyId(variants);
  const variantByProductCombo = indexVariantsByProductCombo(variants);
  const oldVariantById = new Map((oldVariants || []).map((d) => [String(d.$id || d.id || ''), d]));
  const oldProductToNew = bootstrapOldProductToNewProduct(oldVariants, legacyByStockId);
  return {
    variantIds,
    legacyByStockId,
    variantByProductCombo,
    oldVariantById,
    oldProductToNew,
    variants,
    oldVariants,
    stockItems,
    products,
    stockItemById: new Map((stockItems || []).map((d) => [String(d.$id || d.id || ''), d])),
    productNameById: new Map(
      (products || []).map((p) => [String(p.$id || p.id || ''), String(p.name || p.nome || '').trim()])
    ),
  };
}

/**
 * @param {object[]} saleItems
 * @param {object[]} moves
 * @param {object} ctx resolver context from buildStockIdResolverContext + academyId
 */
export function buildSaleStockMoveBackfillPlan(saleItems, moves, ctx = {}) {
  const movesByItem = indexStockMovesByItemId(moves);
  const moveKeysBySale = indexStockMoveKeysBySaleId(moves);
  const missing = findSaleItemsMissingStockMove(saleItems, moveKeysBySale, movesByItem);

  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];

  for (const row of missing) {
    const saleId = String(row.sale_id || '').trim();
    const saleItemId = String(row.sale_item_id || '').trim();
    const rawStockId = String(row.item_estoque_id || '').trim();
    const qty = Math.trunc(Number(row.quantidade) || 0);

    if (!saleId || !saleItemId || !rawStockId) {
      skipped.push({ sale_item_id: saleItemId, reason: 'incomplete_row' });
      continue;
    }
    if (qty <= 0) {
      skipped.push({ sale_item_id: saleItemId, reason: 'zero_quantity' });
      continue;
    }

    const resolved = resolveStockIdToVariant(rawStockId, ctx);
    if (!resolved?.id || !ctx.variantIds?.has(resolved.id)) {
      skipped.push({
        sale_item_id: saleItemId,
        sale_id: saleId,
        item_estoque_id: rawStockId,
        reason: 'unknown_stock_id',
      });
      continue;
    }

    const stockIdsToCheck = new Set([rawStockId, resolved.id].filter(Boolean));
    if (saleHasOutboundMove(movesByItem, stockIdsToCheck, saleId)) {
      skipped.push({ sale_item_id: saleItemId, sale_id: saleId, reason: 'already_has_outbound' });
      continue;
    }

    const lineKind = normalizeLineKind(row.line_kind);
    const granularTipo = stockMoveTipoForLineKind(lineKind);
    plan.push({
      sale_id: saleId,
      sale_item_id: saleItemId,
      item_estoque_id: resolved.id,
      original_item_estoque_id: rawStockId !== resolved.id ? rawStockId : '',
      stock_resolve_method: resolved.method,
      quantidade: qty,
      line_kind: lineKind,
      academy_id: String(ctx.academyId || '').trim(),
      tipo: stockMoveTipoForSchemaWrite(granularTipo),
      tipo_granular: granularTipo,
      motivo: SALE_MOVE_BACKFILL_MOTIVO,
    });
  }

  return { plan, skipped, missing_count: missing.length };
}

export function summarizeSaleStockMoveBackfillPlan(plan, skipped = []) {
  const units = (plan || []).reduce((n, row) => n + Math.trunc(Number(row.quantidade) || 0), 0);
  const byMethod = {};
  for (const row of plan || []) {
    const m = row.stock_resolve_method || 'direct';
    byMethod[m] = (byMethod[m] || 0) + 1;
  }
  return {
    lines_to_backfill: (plan || []).length,
    total_units: units,
    sales_affected: new Set((plan || []).map((p) => p.sale_id)).size,
    by_resolve_method: byMethod,
    skipped_total: (skipped || []).length,
    skipped_unknown_stock: (skipped || []).filter((s) => s.reason === 'unknown_stock_id').length,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} plan */
export function formatSaleStockMoveBackfillCsv(plan) {
  const headers = [
    'sale_id',
    'sale_item_id',
    'item_estoque_id',
    'original_item_estoque_id',
    'stock_resolve_method',
    'tipo',
    'quantidade',
    'line_kind',
    'academy_id',
  ];
  const lines = [headers.join(',')];
  for (const row of plan || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Payload para createDocument (sem mutar estoque). */
export function buildSaleStockMoveBackfillPayload(planRow) {
  const lineKind = normalizeLineKind(planRow.line_kind);
  return {
    academy_id: String(planRow.academy_id || '').trim(),
    item_estoque_id: planRow.item_estoque_id,
    tipo: planRow.tipo || stockMoveTipoForSchemaWrite(stockMoveTipoForLineKind(lineKind)),
    quantidade: Math.trunc(Number(planRow.quantidade) || 0),
    referencia_id: planRow.sale_id,
    sale_id: planRow.sale_id,
    sale_item_id: planRow.sale_item_id,
    motivo: SALE_MOVE_BACKFILL_MOTIVO,
    movement_kind: movementKindForLineKind(lineKind),
    source: SALE_MOVE_BACKFILL_SOURCE,
    usuario_id: 'audit_backfill',
    notes: `Backfill auditoria — ${stockMoveMotivoForLineKind(lineKind)} ${planRow.sale_id}`.slice(0, 512),
  };
}
