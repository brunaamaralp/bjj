/** Filtros válidos do histórico no perfil do lead (?history=). */
export const LEAD_HISTORY_FILTERS = new Set([
  'all',
  'message',
  'schedule',
  'stage_change',
  'note',
  'conversation',
]);

/** Lê ?history= da URL para o filtro interno da timeline. */
export function leadHistoryFilterFromUrlParam(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key || key === 'all') return 'all';
  return LEAD_HISTORY_FILTERS.has(key) ? key : 'all';
}

/** Escreve filtro na URL (?history=); `all` remove o parâmetro. */
export function leadHistoryFilterToUrlParam(filter) {
  const key = String(filter || '').trim().toLowerCase();
  if (!key || key === 'all') return null;
  return LEAD_HISTORY_FILTERS.has(key) ? key : null;
}
