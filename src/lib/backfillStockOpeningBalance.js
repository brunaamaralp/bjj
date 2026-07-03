/**
 * Fase 3 — Entrada sintética de saldo inicial para itens com saldo mas sem movimentos.
 * Grava apenas stock_moves (não altera current_quantity).
 */
import { STOCK_DELTA_CAUSES } from './auditStockBalance.js';

export const OPENING_BALANCE_MOTIVO = 'saldo_inicial_audit_backfill';
export const OPENING_BALANCE_REF_PREFIX = 'audit_backfill:opening';

export function openingBalanceReferenciaId(itemId) {
  return `${OPENING_BALANCE_REF_PREFIX}:${String(itemId || '').trim()}`;
}

/** @param {object} move */
export function isOpeningBalanceBackfillMove(move) {
  const motivo = String(move?.motivo || '').trim();
  if (motivo === OPENING_BALANCE_MOTIVO) return true;
  const ref = String(move?.referencia_id || '').trim();
  return ref.startsWith(`${OPENING_BALANCE_REF_PREFIX}:`);
}

/** @param {object[]} moves */
export function indexItemsWithOpeningBackfill(moves) {
  const set = new Set();
  for (const move of moves || []) {
    if (!isOpeningBalanceBackfillMove(move)) continue;
    const id = String(move.item_estoque_id || '').trim();
    if (id) set.add(id);
  }
  return set;
}

/**
 * @param {object[]} auditRows rows from buildStockBalanceAuditRow
 * @param {Set<string>} existingBackfillItemIds
 * @param {object} [opts]
 * @param {string} [opts.itemId] filtrar um item
 */
export function buildOpeningBalanceBackfillPlan(auditRows, existingBackfillItemIds, opts = {}) {
  const itemFilter = String(opts.itemId || '').trim();
  /** @type {object[]} */
  const plan = [];
  /** @type {object[]} */
  const skipped = [];

  for (const row of auditRows || []) {
    const itemId = String(row.item_id || '').trim();
    if (!itemId) continue;
    if (itemFilter && itemId !== itemFilter) continue;

    if (row.move_count > 0) {
      skipped.push({ item_id: itemId, reason: 'has_moves', move_count: row.move_count });
      continue;
    }
    if (Math.trunc(Number(row.current_quantity) || 0) <= 0) {
      skipped.push({ item_id: itemId, reason: 'zero_balance' });
      continue;
    }
    if (existingBackfillItemIds?.has(itemId)) {
      skipped.push({ item_id: itemId, reason: 'already_backfilled' });
      continue;
    }
    if (row.probable_cause !== STOCK_DELTA_CAUSES.LEGACY_OR_DIRECT_BALANCE && row.delta !== row.current_quantity) {
      skipped.push({ item_id: itemId, reason: 'unexpected_cause', probable_cause: row.probable_cause });
      continue;
    }

    const qty = Math.trunc(Number(row.current_quantity) || 0);
    plan.push({
      item_id: itemId,
      item_label: row.item_label || itemId,
      academy_id: String(row.academy_id || '').trim(),
      tipo: 'entrada',
      quantidade: qty,
      motivo: OPENING_BALANCE_MOTIVO,
      referencia_id: openingBalanceReferenciaId(itemId),
      quantity_before: 0,
      usuario_id: 'audit_backfill',
    });
  }

  return { plan, skipped };
}

export function summarizeOpeningBalancePlan(plan, skipped = []) {
  const units = (plan || []).reduce((n, row) => n + Math.trunc(Number(row.quantidade) || 0), 0);
  return {
    items_to_backfill: (plan || []).length,
    total_units: units,
    skipped_total: (skipped || []).length,
    skipped_has_moves: (skipped || []).filter((s) => s.reason === 'has_moves').length,
    skipped_already_backfilled: (skipped || []).filter((s) => s.reason === 'already_backfilled').length,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {object[]} plan */
export function formatOpeningBalancePlanCsv(plan) {
  const headers = [
    'item_id',
    'item_label',
    'academy_id',
    'tipo',
    'quantidade',
    'motivo',
    'referencia_id',
    'quantity_before',
  ];
  const lines = [headers.join(',')];
  for (const row of plan || []) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Payload para createDocument em stock_moves (sem mutar estoque). */
export function buildOpeningBalanceMovePayload(planRow) {
  return {
    item_estoque_id: planRow.item_id,
    tipo: 'entrada',
    quantidade: Math.trunc(Number(planRow.quantidade) || 0),
    motivo: OPENING_BALANCE_MOTIVO,
    referencia_id: planRow.referencia_id || openingBalanceReferenciaId(planRow.item_id),
    quantity_before: 0,
    usuario_id: planRow.usuario_id || 'audit_backfill',
    academy_id: String(planRow.academy_id || '').trim(),
  };
}
