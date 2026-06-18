export const TX_COLUMNS_STORAGE_PREFIX = 'navi-finance-tx-cols';

export const OPTIONAL_TX_COLUMNS = [
  { key: 'sale', label: 'Venda', defaultVisible: false },
  { key: 'bank', label: 'Conta', defaultVisible: false },
  { key: 'type', label: 'Tipo', defaultVisible: false },
  { key: 'method', label: 'Método', defaultVisible: false },
  { key: 'fee', label: 'Taxa', defaultVisible: false },
  { key: 'nature', label: 'Natureza', defaultVisible: false },
  { key: 'gross', label: 'Bruto', defaultVisible: false },
];

export function defaultTxColumnVisibility() {
  return Object.fromEntries(OPTIONAL_TX_COLUMNS.map((c) => [c.key, c.defaultVisible]));
}

export function loadTxColumnVisibility(academyId) {
  if (!academyId) return defaultTxColumnVisibility();
  try {
    const raw = localStorage.getItem(`${TX_COLUMNS_STORAGE_PREFIX}:${academyId}`);
    if (!raw) return defaultTxColumnVisibility();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultTxColumnVisibility();
    return {
      ...defaultTxColumnVisibility(),
      ...OPTIONAL_TX_COLUMNS.reduce((acc, col) => {
        if (typeof parsed[col.key] === 'boolean') acc[col.key] = parsed[col.key];
        return acc;
      }, {}),
    };
  } catch {
    return defaultTxColumnVisibility();
  }
}

export function saveTxColumnVisibility(academyId, visibility) {
  if (!academyId) return;
  try {
    localStorage.setItem(`${TX_COLUMNS_STORAGE_PREFIX}:${academyId}`, JSON.stringify(visibility));
  } catch {
    /* ignore quota / private mode */
  }
}

export function parseStatusFilterParam(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'pending' || s === 'settled' || s === 'cancelled') return s;
  return 'all';
}

export function parseDirectionFilterParam(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'in' || s === 'out') return s;
  return 'all';
}

/** Atualiza um parâmetro de filtro na URL (?status, ?dir, ?q). */
export function patchFinanceTxUrlParam(searchParams, key, value, { omitWhen = ['', 'all'] } = {}) {
  const next = new URLSearchParams(searchParams);
  const v = String(value ?? '').trim();
  if (!v || omitWhen.includes(v)) next.delete(key);
  else next.set(key, v);
  return next;
}

export function getTxModalTitle({ editingRecurrenceOnly, editingTxId, direction }) {
  if (editingRecurrenceOnly) return 'Editar recorrência';
  if (editingTxId) return 'Editar lançamento';
  if (String(direction || '').toLowerCase() === 'out') return 'Nova saída';
  return 'Novo lançamento';
}

export function getTxModalSaveLabel({ savingTx, editingRecurrenceOnly, editingTxId, receiveNow }) {
  if (savingTx) return 'Salvando…';
  if (editingRecurrenceOnly) return 'Salvar recorrência';
  if (editingTxId) return 'Salvar alterações';
  if (receiveNow) return 'Registrar e liquidar';
  return 'Registrar lançamento';
}

/** Texto introdutório do modal (novo lançamento). */
export function getTxModalIntro(direction) {
  const isOut = String(direction || '').toLowerCase() === 'out';
  const liquidarLabel = isOut ? 'Pago agora' : 'Recebido agora';
  return `Registre ${isOut ? 'uma saída' : 'uma entrada'} no caixa do período. Se não marcar «${liquidarLabel}», o lançamento fica pendente até você liquidar.`;
}
