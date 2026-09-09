export const TX_COLUMNS_STORAGE_PREFIX = 'navi-finance-tx-cols';
export const TX_RECEIVE_DEFAULT_PREFIX = 'navi-finance-tx-receive-default';

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

/** Default ao abrir modal novo: true = já no caixa. */
export function loadTxReceiveDefault(academyId) {
  if (!academyId) return true;
  try {
    const v = localStorage.getItem(`${TX_RECEIVE_DEFAULT_PREFIX}:${academyId}`);
    if (v === 'pending') return false;
    if (v === 'now') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function saveTxReceiveDefault(academyId, receiveNow) {
  if (!academyId) return;
  try {
    localStorage.setItem(
      `${TX_RECEIVE_DEFAULT_PREFIX}:${academyId}`,
      receiveNow ? 'now' : 'pending'
    );
  } catch {
    /* ignore */
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

export function getSettleActionLabel(direction) {
  return String(direction || '').toLowerCase() === 'out'
    ? 'Confirmar pagamento'
    : 'Confirmar recebimento';
}

export function getSettledStatusLabel(direction) {
  return String(direction || '').toLowerCase() === 'out' ? 'Pago' : 'Recebido';
}

export function getSettledFilterLabel() {
  return 'Confirmado no caixa';
}

export function getTxModalSaveLabel({ savingTx, editingRecurrenceOnly, editingTxId, receiveNow, direction }) {
  if (savingTx) return 'Salvando…';
  if (editingRecurrenceOnly) return 'Salvar recorrência';
  if (editingTxId) return 'Salvar alterações';
  const isOut = String(direction || '').toLowerCase() === 'out';
  if (receiveNow) {
    return isOut ? 'Registrar pagamento' : 'Registrar recebimento';
  }
  return 'Registrar pendência';
}

/** Texto introdutório do modal (novo lançamento). */
export function getTxModalIntro(direction) {
  const isOut = String(direction || '').toLowerCase() === 'out';
  return isOut
    ? 'Registre uma saída. Por padrão o pagamento já entra no caixa; escolha «Pagar depois» se ainda não saiu da conta.'
    : 'Registre uma entrada. Por padrão o recebimento já entra no caixa; escolha «Receber depois» para cobranças futuras (boleto, cartão D+N, etc.).';
}

export function getTxCreateSuccessMessage({ receiveNow, direction }) {
  const isOut = String(direction || '').toLowerCase() === 'out';
  if (receiveNow) {
    return isOut
      ? 'Pagamento registrado — já saiu do caixa.'
      : 'Recebimento registrado — já entrou no caixa.';
  }
  return isOut
    ? 'Pendência registrada. Confirme o pagamento quando sair da conta.'
    : 'Pendência registrada. Confirme o recebimento quando o dinheiro entrar.';
}
