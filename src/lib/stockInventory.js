/** Estoque genérico — saldo, status e marcadores de tarefas (sem produto específico). */

export const STOCK_RESTOCK_MARKER = '[stock_restock]';
export const STOCK_WEEKLY_CHECK_MARKER = '[stock_weekly_check]';

export const DEFAULT_STOCK_CHECK_SCHEDULE = {
  enabled: false,
  dayOfWeek: 5,
  taskTitle: 'Conferência de estoque',
};

export const DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY = 'Estoque / Insumos';

/** DEPRECATED: usar current_quantity. Fallback de leitura para itens não migrados. */
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

/** Rótulo simplificado para histórico de movimentações (entrada / saída / ajuste). */
export function stockMoveKindLabel(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'entrada' || t === 'devolucao' || t === 'reversao_venda') return 'Entrada';
  if (t === 'ajuste') return 'Ajuste';
  return 'Saída';
}

export const STOCK_MOVE_TYPE_LABELS = {
  entrada: 'Entrada',
  saida_venda: 'Saída (venda)',
  saida_aluguel: 'Saída (aluguel)',
  devolucao: 'Devolução',
  reversao_venda: 'Reversão de venda',
  ajuste: 'Ajuste',
  avulso: 'Avulso',
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

/** Prefixo do título da tarefa consolidada de reposição. */
export const STOCK_RESTOCK_TITLE_PREFIX = 'Repor estoque';

export const STOCK_RESTOCK_CONSOLIDATED_FLAG = 'consolidated:true';

export function formatRestockProductLine(item, currentQty, minimumLevel) {
  const name = itemDisplayName(item);
  const tam = String(item?.Tamanho ?? item?.tamanho ?? '').trim();
  const label = tam ? `${name} · ${tam}` : name;
  const qty = Number(currentQty ?? 0);
  const min = Number(minimumLevel ?? 0);
  return `• ${label} — saldo: ${qty}, mínimo: ${min}`;
}

export function buildConsolidatedRestockTaskTitle(productCount) {
  const n = Math.max(0, Math.floor(Number(productCount) || 0));
  const word = n === 1 ? 'produto' : 'produtos';
  return `${STOCK_RESTOCK_TITLE_PREFIX} — ${n} ${word} em nível crítico`;
}

/**
 * @param {{ item: object, currentQty: number, minimumLevel: number }[]} products
 */
export function buildConsolidatedRestockTaskDescription(products) {
  const lines = (products || []).map(({ item, currentQty, minimumLevel }) =>
    formatRestockProductLine(item, currentQty, minimumLevel)
  );
  const ids = (products || []).map((p) => String(p.item?.$id || p.item?.id || '').trim()).filter(Boolean);
  return [
    STOCK_RESTOCK_MARKER,
    STOCK_RESTOCK_CONSOLIDATED_FLAG,
    `product_ids:${ids.join(',')}`,
    '',
    ...lines,
  ].join('\n');
}

/** @deprecated Tarefas por produto — mantido para compatibilidade de leitura. */
export function buildRestockTaskTitle(itemName) {
  const name = String(itemName || '').trim() || 'Item';
  return `Repor estoque: ${name}`;
}

/** @deprecated Tarefas por produto — mantido para compatibilidade de leitura. */
export function buildRestockTaskDescription({ itemId, currentQty, unit, minimumLevel }) {
  const u = String(unit || 'unidade').trim() || 'unidade';
  return `${STOCK_RESTOCK_MARKER}\nitem_id:${itemId}\nSaldo atual: ${currentQty} ${u}. Nível mínimo: ${minimumLevel}.`;
}

export function parseStockItemIdFromTaskDescription(description) {
  const m = String(description || '').match(/^item_id:\s*(\S+)/m);
  return m ? m[1] : '';
}

export function parseConsolidatedProductIds(description) {
  const m = String(description || '').match(/^product_ids:\s*(.+)$/m);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isStockRestockTask(task) {
  return String(task?.description || '').includes(STOCK_RESTOCK_MARKER);
}

export function isConsolidatedRestockTask(task) {
  if (!isStockRestockTask(task)) return false;
  const desc = String(task?.description || '');
  if (desc.includes(STOCK_RESTOCK_CONSOLIDATED_FLAG)) return true;
  const title = String(task?.title || '').trim();
  return title.startsWith(`${STOCK_RESTOCK_TITLE_PREFIX} —`);
}

export function isLegacyPerItemRestockTask(task) {
  return isStockRestockTask(task) && !isConsolidatedRestockTask(task);
}

export function isOpenTaskStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return s !== 'done' && s !== 'completed' && s !== 'concluida' && s !== 'concluída';
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
