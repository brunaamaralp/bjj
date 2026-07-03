/**
 * Fase 5 — Movimentos sintéticos para fechar delta (saldo vs Σ movimentos).
 * Grava apenas stock_moves (não altera current_quantity).
 */
import { STOCK_DELTA_CAUSES } from './auditStockBalance.js';

export const RECONCILE_DELTA_MOTIVO = 'reconciliacao_audit_backfill';
export const RECONCILE_DELTA_REF_PREFIX = 'audit_backfill:reconcile';

export function reconcileDeltaReferenciaId(itemId, suffix = '') {
  const base = `${RECONCILE_DELTA_REF_PREFIX}:${String(itemId || '').trim()}`;
  const s = String(suffix || '').trim();
  return s ? `${base}:${s}` : base;
}

/** @param {object[]} moves */
export function indexReconcileDeltaBackfillRefs(moves) {
  const refs = new Set();
  for (const move of moves || []) {
    if (!isReconcileDeltaBackfillMove(move)) continue;
    const ref = String(move.referencia_id || '').trim();
    if (ref) refs.add(ref);
  }
  return refs;
}

/** @param {object} move */
export function isReconcileDeltaBackfillMove(move) {
  const motivo = String(move?.motivo || '').trim();
  if (motivo === RECONCILE_DELTA_MOTIVO) return true;
  const ref = String(move?.referencia_id || '').trim();
  return ref.startsWith(`${RECONCILE_DELTA_REF_PREFIX}:`);
}

/** @param {object[]} moves */
export function indexItemsWithReconcileDeltaBackfill(moves) {
  const set = new Set();
  for (const move of moves || []) {
    if (!isReconcileDeltaBackfillMove(move)) continue;
    const id = String(move.item_estoque_id || '').trim();
    if (id) set.add(id);
  }
  return set;
}

/**
 * @param {number} delta current_quantity - calculated_quantity
 * @returns {{ tipo: string, quantidade: number } | null}
 */
export function reconcileMoveForDelta(delta) {
  const d = Math.trunc(Number(delta) || 0);
  if (d === 0) return null;
  if (d > 0) return { tipo: 'entrada', quantidade: d };
  return { tipo: 'saida', quantidade: Math.abs(d) };
}

/**
 * @param {object[]} auditRows
 * @param {Set<string>} existingReconcileItemIds
 * @param {object} [opts]
 */
export function buildReconcileDeltaBackfillPlan(auditRows, existingReconcileItemIds, opts = {}) {
  const itemFilter = String(opts.itemId || '').trim();
  const existingRefs = opts.existingReconcileRefs || new Set();
  const maxAbsDeltaRaw = opts.maxAbsDelta;
  const maxAbsDelta =
    maxAbsDeltaRaw != null && maxAbsDeltaRaw !== '' && Number.isFinite(Number(maxAbsDeltaRaw))
      ? Number(maxAbsDeltaRaw)
      : null;

  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];

  for (const row of auditRows || []) {
    const itemId = String(row.item_id || '').trim();
    if (!itemId) continue;
    if (itemFilter && itemId !== itemFilter) continue;

    const delta = Math.trunc(Number(row.delta) || 0);
    if (delta === 0) {
      if (row.probable_cause !== STOCK_DELTA_CAUSES.OK) {
        skipped.push({ item_id: itemId, reason: 'zero_delta_non_ok', probable_cause: row.probable_cause });
      }
      continue;
    }

    if (existingReconcileItemIds?.has(itemId)) {
      const followupRef = reconcileDeltaReferenciaId(itemId, 'followup');
      if (existingRefs.has(followupRef)) {
        skipped.push({ item_id: itemId, reason: 'already_reconciled', delta });
        continue;
      }
    }

    if (maxAbsDelta != null && Math.abs(delta) > maxAbsDelta) {
      skipped.push({ item_id: itemId, reason: 'delta_above_max', delta, max_abs_delta: maxAbsDelta });
      continue;
    }

    const moveSpec = reconcileMoveForDelta(delta);
    if (!moveSpec) continue;

    plan.push({
      item_id: itemId,
      item_label: row.item_label || itemId,
      academy_id: String(row.academy_id || '').trim(),
      current_quantity: Math.trunc(Number(row.current_quantity) || 0),
      calculated_quantity: Math.trunc(Number(row.calculated_quantity) || 0),
      delta,
      probable_cause: row.probable_cause,
      move_count: row.move_count,
      tipo: moveSpec.tipo,
      quantidade: moveSpec.quantidade,
      motivo: RECONCILE_DELTA_MOTIVO,
      referencia_id: existingReconcileItemIds?.has(itemId)
        ? reconcileDeltaReferenciaId(itemId, 'followup')
        : reconcileDeltaReferenciaId(itemId),
      quantity_before: Math.trunc(Number(row.calculated_quantity) || 0),
      usuario_id: 'audit_backfill',
    });
  }

  return { plan, skipped };
}

export function summarizeReconcileDeltaPlan(plan, skipped = []) {
  let sumIn = 0;
  let sumOut = 0;
  for (const row of plan || []) {
    if (row.tipo === 'entrada') sumIn += Math.trunc(Number(row.quantidade) || 0);
    else sumOut += Math.trunc(Number(row.quantidade) || 0);
  }
  return {
    items_to_reconcile: (plan || []).length,
    entries_in: plan.filter((p) => p.tipo === 'entrada').length,
    entries_out: plan.filter((p) => p.tipo === 'saida').length,
    units_in: sumIn,
    units_out: sumOut,
    skipped_total: (skipped || []).length,
    skipped_above_max: (skipped || []).filter((s) => s.reason === 'delta_above_max').length,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} plan */
export function formatReconcileDeltaPlanCsv(plan) {
  const headers = [
    'item_id',
    'item_label',
    'current_quantity',
    'calculated_quantity',
    'delta',
    'tipo',
    'quantidade',
    'move_count',
    'probable_cause',
    'academy_id',
  ];
  const lines = [headers.join(',')];
  for (const row of plan || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Payload para createDocument (sem mutar estoque). */
export function buildReconcileDeltaMovePayload(planRow) {
  return {
    item_estoque_id: planRow.item_id,
    tipo: planRow.tipo,
    quantidade: Math.trunc(Number(planRow.quantidade) || 0),
    motivo: RECONCILE_DELTA_MOTIVO,
    referencia_id: planRow.referencia_id || reconcileDeltaReferenciaId(planRow.item_id),
    quantity_before: planRow.quantity_before ?? null,
    usuario_id: planRow.usuario_id || 'audit_backfill',
    academy_id: String(planRow.academy_id || '').trim(),
    source: 'audit_backfill',
  };
}
