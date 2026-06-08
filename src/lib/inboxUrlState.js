/** Filtros válidos na URL do Inbox (?filter=). */
export const INBOX_URL_FILTERS = new Set([
  'needs_me',
  'unread',
  'need_human',
  'waiting_customer',
  'resolved',
  'archived',
  'hot',
  'transferred',
]);

const FILTER_URL_ALIASES = {
  pending: 'need_human',
};

/** Lê ?filter= da URL para o valor interno de listFilter. */
export function inboxFilterFromUrlParam(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key || key === 'all') return null;
  const mapped = FILTER_URL_ALIASES[key] || key;
  return INBOX_URL_FILTERS.has(mapped) ? mapped : null;
}

/** Escreve listFilter na URL (?filter=); null/''/'all' remove o parâmetro. */
export function inboxFilterToUrlParam(filter) {
  const key = String(filter || '').trim();
  if (!key || key === 'all') return null;
  return INBOX_URL_FILTERS.has(key) ? key : null;
}

/** Rótulos exibidos na UI para cada filtro da lista. */
export const INBOX_FILTER_LABELS = {
  all: 'Todas',
  needs_me: 'Com você',
  unread: 'Não lidas',
  need_human: 'Só handoff',
  waiting_customer: 'Aguardando cliente',
  resolved: 'Resolvidos',
  archived: 'Arquivadas',
  hot: 'Contato quente',
  transferred: 'Transferidas',
};

export function inboxFilterLabel(filter) {
  const key = String(filter || 'all').trim();
  return INBOX_FILTER_LABELS[key] || key;
}
