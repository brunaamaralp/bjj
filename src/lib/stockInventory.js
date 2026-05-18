/** Estoque genérico — saldo, status e marcadores de tarefas (sem produto específico). */

export const STOCK_RESTOCK_MARKER = '[stock_restock]';
export const STOCK_WEEKLY_CHECK_MARKER = '[stock_weekly_check]';

export const DEFAULT_STOCK_CHECK_SCHEDULE = {
  enabled: false,
  dayOfWeek: 5,
  taskTitle: 'Conferência de estoque',
};

export const DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY = 'Estoque / Insumos';

export function legacyAvailable(item) {
  const total = Number(item?.quantidade_total ?? 0);
  const vendida = Number(item?.quantidade_vendida ?? 0);
  const alugada = Number(item?.quantidade_alugada ?? 0);
  return total - vendida - alugada;
}

/** Saldo efetivo: campo current_quantity ou legado. */
export function resolveCurrentQuantity(item) {
  if (item == null) return 0;
  const raw = item.current_quantity;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return legacyAvailable(item);
}

export function computeStockStatus(currentQty, minimumLevel) {
  const min = Math.max(0, Number(minimumLevel || 0));
  const qty = Number(currentQty || 0);
  if (min <= 0) return 'ok';
  if (qty < min) return 'critical';
  if (qty === min) return 'attention';
  return 'ok';
}

export const STOCK_STATUS_LABELS = {
  ok: 'OK',
  attention: 'Atenção',
  critical: 'Crítico',
};

/** Delta em current_quantity por tipo de movimentação. */
export function quantityDeltaForMoveType(tipo, quantidade) {
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q === 0) return 0;
  switch (String(tipo || '').toLowerCase()) {
    case 'entrada':
    case 'devolucao':
    case 'reversao_venda':
      return q > 0 ? q : 0;
    case 'ajuste':
      return q;
    case 'saida_venda':
    case 'saida_aluguel':
      return q > 0 ? -q : 0;
    default:
      return 0;
  }
}

export function buildRestockTaskTitle(itemName) {
  const name = String(itemName || '').trim() || 'Item';
  return `Repor estoque: ${name}`;
}

export function buildRestockTaskDescription({ itemId, currentQty, unit, minimumLevel }) {
  const u = String(unit || 'unidade').trim() || 'unidade';
  return `${STOCK_RESTOCK_MARKER}\nitem_id:${itemId}\nSaldo atual: ${currentQty} ${u}. Nível mínimo: ${minimumLevel}.`;
}

export function parseStockItemIdFromTaskDescription(description) {
  const m = String(description || '').match(/^item_id:\s*(\S+)/m);
  return m ? m[1] : '';
}

export function isStockRestockTask(task) {
  return String(task?.description || '').includes(STOCK_RESTOCK_MARKER);
}

export function isStockWeeklyCheckTask(task, taskTitle) {
  const title = String(taskTitle || '').trim();
  if (title && String(task?.title || '').trim() === title) {
    return String(task?.description || '').includes(STOCK_WEEKLY_CHECK_MARKER);
  }
  return String(task?.description || '').includes(STOCK_WEEKLY_CHECK_MARKER);
}

export function itemDisplayName(item) {
  return String(item?.nome || item?.name || item?.descricao || item?.$id || '').trim() || 'Item';
}

export function itemCategory(item) {
  return String(item?.categoria || item?.category || '').trim();
}
