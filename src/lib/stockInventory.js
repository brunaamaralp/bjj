/** Estoque genérico — saldo, status e marcadores de tarefas (sem produto específico). */

import { ADJUSTMENT_TYPE, adjustmentReferenciaId, adjustmentReferenciaSign } from './inventoryAdjust.js';

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
import { availableFromPools, hasDualPoolFields } from './dualStockPools.js';

export function resolveCurrentQuantity(item) {
  if (item == null) return 0;
  if (hasDualPoolFields(item)) {
    const pooled = availableFromPools(item);
    if (pooled != null) return pooled;
  }
  const raw = item.current_quantity;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return legacyAvailable(item);
}

/** Status de estoque por variante (ou item avulso). */
export function getVariantStockStatus(quantity, min) {
  const qty = Number(quantity ?? 0);
  const minQty = Number(min);
  const hasMin = Number.isFinite(minQty) && minQty > 0;
  if (qty === 0) return 'critical';
  if (hasMin && qty < minQty) return 'reorder';
  return 'ok';
}

/** Status agregado do produto pai a partir das variantes. */
export function aggregateParentStockStatus(variantStatuses) {
  const list = variantStatuses || [];
  if (!list.length) return 'ok';
  if (list.some((s) => s === 'critical')) return 'critical';
  if (list.some((s) => s === 'reorder')) return 'reorder';
  return 'ok';
}

/** @deprecated Alias — use getVariantStockStatus. */
export function computeStockStatus(currentQty, minimumLevel) {
  return getVariantStockStatus(currentQty, minimumLevel);
}

export const STOCK_STATUS_LABELS = {
  ok: 'OK',
  reorder: 'A repor',
  critical: 'Crítico',
};

/** Agrupa itens de inventário (variantes) em linhas pai para a listagem. */
export function buildInventoryParentRows(items) {
  const groups = new Map();

  for (const it of items || []) {
    const pid = String(it.product_id || '').trim();
    const key = pid || `solo:${it.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const rows = [];
  for (const variants of groups.values()) {
    const sorted = variants.slice().sort((a, b) => {
      const la = variantInventoryLabel(a);
      const lb = variantInventoryLabel(b);
      return la.localeCompare(lb, 'pt-BR');
    });
    const first = sorted[0];
    const variantRows = sorted.map((v) => ({
      ...v,
      status: getVariantStockStatus(v.current_quantity, v.minimum_level),
    }));
    const statuses = variantRows.map((v) => v.status);
    const total_quantity = variantRows.reduce((n, v) => n + Number(v.current_quantity || 0), 0);
    const hasProductGroup = Boolean(String(first.product_id || '').trim());

    rows.push({
      id: hasProductGroup ? first.product_id : first.id,
      product_id: first.product_id || '',
      nome: String(first.parent_nome || first.nome || '').trim() || 'Item',
      categoria: first.categoria || '',
      image_url: first.image_url || '',
      sale_price: first.sale_price,
      cost_price: first.cost_price,
      is_for_sale: first.is_for_sale !== false,
      total_quantity,
      status: aggregateParentStockStatus(statuses),
      variants: variantRows,
      variant_count: variantRows.length,
      hasVariants: hasProductGroup && variantRows.length > 1,
    });
  }

  return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function variantInventoryLabel(variant) {
  const size = String(variant?.size ?? variant?.Tamanho ?? '').trim();
  const color = String(variant?.color ?? '').trim();
  const parts = [size, color].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Único';
}

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

/**
 * Quantidade com sinal para exibição / relatórios (ajuste grava valor absoluto no Appwrite).
 */
export function resolveSignedStockMoveQuantity(doc) {
  const tipo = String(doc?.tipo || '').toLowerCase();
  const raw = Number(doc?.quantidade);
  const q = Number.isFinite(raw) ? raw : 0;
  if (tipo === 'ajuste') {
    const sign = adjustmentReferenciaSign(doc?.referencia_id);
    const abs = Math.abs(q);
    if (sign < 0) return -abs;
    if (sign > 0) return abs;
    if (q < 0) return q;
    return q;
  }
  return quantityDeltaForMoveType(tipo, q);
}

/**
 * Normaliza quantidade/referencia_id antes de gravar movimento (coleção exige quantidade 0..1e6).
 */
export function normalizeStockMoveQuantidadeForWrite(tipo, quantidade, referencia_id) {
  const tipoL = String(tipo || '').toLowerCase();
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q === 0) {
    return { quantidade: 0, referencia_id: referencia_id ?? null };
  }
  if (tipoL === 'ajuste') {
    const absQty = Math.abs(Math.trunc(q));
    const ref = String(referencia_id || '').startsWith(ADJUSTMENT_TYPE)
      ? String(referencia_id)
      : adjustmentReferenciaId(q);
    return { quantidade: absQty, referencia_id: ref };
  }
  return {
    quantidade: Math.abs(Math.trunc(q)),
    referencia_id: referencia_id ?? null,
  };
}

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
    case 'saida':
      return q > 0 ? -q : 0;
    default:
      return 0;
  }
}

/** Prefixo do título da tarefa consolidada de reposição. */
export const STOCK_RESTOCK_TITLE_PREFIX = 'Repor estoque';

export const STOCK_RESTOCK_CONSOLIDATED_FLAG = 'consolidated:true';

/** Limite do atributo `description` na coleção tasks (Appwrite). */
export const TASK_DESCRIPTION_MAX = 2000;

/** Garante string válida para gravar em tasks (tipo + tamanho). */
export function taskDescriptionForAppwrite(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, TASK_DESCRIPTION_MAX);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, TASK_DESCRIPTION_MAX);
  }
  try {
    return JSON.stringify(value).slice(0, TASK_DESCRIPTION_MAX);
  } catch {
    return String(value).slice(0, TASK_DESCRIPTION_MAX);
  }
}

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
  let idsLine = `product_ids:${ids.join(',')}`;
  const max = TASK_DESCRIPTION_MAX;
  if (idsLine.length > 400) {
    idsLine = `product_ids_count:${ids.length}`;
  }
  const header = [STOCK_RESTOCK_MARKER, STOCK_RESTOCK_CONSOLIDATED_FLAG, idsLine, ''];
  const suffix = '\n… (lista truncada — abra o estoque para ver todos)';
  let body = '';
  let truncated = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const candidate = [...header, body, line].filter((x) => x !== '').join('\n');
    const withSuffix = candidate.length > max - suffix.length ? candidate + suffix : candidate;
    if (withSuffix.length > max) {
      truncated = true;
      break;
    }
    body = body ? `${body}\n${line}` : line;
  }
  const full = [...header, body].join('\n');
  if (!truncated) return taskDescriptionForAppwrite(full);
  const capped = [...header, body].filter(Boolean).join('\n') + suffix;
  return taskDescriptionForAppwrite(capped);
}

/** @deprecated Tarefas por produto — mantido para compatibilidade de leitura. */
export function buildRestockTaskTitle(itemName) {
  const name = String(itemName || '').trim() || 'Item';
  return `Repor estoque: ${name}`;
}

/** @deprecated Tarefas por produto — mantido para compatibilidade de leitura. */
export function buildRestockTaskDescription({ itemId, currentQty, unit, minimumLevel }) {
  const u = String(unit || 'unidade').trim() || 'unidade';
  return taskDescriptionForAppwrite(
    `${STOCK_RESTOCK_MARKER}\nitem_id:${itemId}\nSaldo atual: ${currentQty} ${u}. Nível mínimo: ${minimumLevel}.`
  );
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
