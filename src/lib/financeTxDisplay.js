/**
 * Exibição de FINANCIAL_TX na UI (valores sempre positivos + natureza).
 */

import { defaultCategoryForTxType, resolveFinanceCategory } from './financeCategories.js';
import { formatPaymentMethod } from './paymentMethodLabels.js';

const OUTFLOW_TX_TYPES = new Set([
  'expense',
  'expense_operational',
  'expense_financial',
  'card_fee',
  'stock_purchase',
  'loan_repayment',
  'balance_sheet_out',
]);

export function txDirection(tx) {
  const dir = String(tx?.direction || '').toLowerCase();
  if (dir === 'out' || dir === 'in') return dir;
  const type = String(tx?.type || '').toLowerCase();
  if (OUTFLOW_TX_TYPES.has(type)) return 'out';
  if (type === 'refund') return 'in';
  return 'in';
}

export function displayGross(tx) {
  return Math.abs(Number(tx?.gross) || 0);
}

export function displayNet(tx) {
  const net = Number(tx?.net);
  if (Number.isFinite(net)) return Math.abs(net);
  return displayGross(tx);
}

export function displayFee(tx) {
  return Math.abs(Number(tx?.fee) || 0);
}

export function formatSignedMoney(value, direction) {
  const n = Math.abs(Number(value) || 0);
  let formatted;
  try {
    formatted = n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    formatted = `R$ ${n.toFixed(2).replace('.', ',')}`;
  }
  if (direction === 'out') return `− ${formatted}`;
  return `+ ${formatted}`;
}

export const NATURE_STYLES = {
  in: { color: '#3B6D11', label: 'Entrada' },
  out: { color: '#A32D2D', label: 'Saída' },
};

const TX_TYPE_LABELS = {
  plan: 'Plano',
  product: 'Produto',
  enrollment: 'Matrícula',
  other: 'Outro',
  expense: 'Despesa',
  expense_operational: 'Despesa operacional',
  expense_financial: 'Despesa financeira',
  card_fee: 'Taxa de cartão',
  stock_purchase: 'Custo de estoque',
  refund: 'Estorno',
};

/** Rótulo legível para FINANCIAL_TX.type (evita exibir slugs como stock_purchase). */
export function labelForFinanceTxType(type) {
  const t = String(type || '').toLowerCase();
  return TX_TYPE_LABELS[t] || (t ? t.replace(/_/g, ' ') : '—');
}

/** Badge de categoria para listagens de lançamento. */
export function getTxCategoryBadge(tx, accounts = null) {
  const raw = String(tx?.category || '').trim() || defaultCategoryForTxType(tx?.type);
  if (!raw) return null;
  const cat = resolveFinanceCategory(raw, accounts);
  const label = cat?.label || raw;
  const type = cat?.type || String(tx?.type || '').toLowerCase();
  let className = 'finance-tx-badge finance-tx-badge--other';
  if (type === 'plan' || type === 'enrollment') className = 'finance-tx-badge finance-tx-badge--plan';
  else if (type === 'product') className = 'finance-tx-badge finance-tx-badge--product';
  else if (type === 'stock_purchase') className = 'finance-tx-badge finance-tx-badge--expense';
  else if (
    type === 'expense' ||
    type === 'expense_operational' ||
    type === 'expense_financial' ||
    type === 'card_fee'
  ) {
    className = 'finance-tx-badge finance-tx-badge--expense';
  }
  return { label, className };
}

function getTxTypeSubtitle(tx) {
  const method = formatPaymentMethod(tx?.method, tx?.installments);
  const t = String(tx?.type || '').toLowerCase();
  if (t === 'plan') {
    const plan = tx?.planName ? String(tx.planName) : 'Plano';
    return `${plan} · ${method}`;
  }
  const typeLabel = labelForFinanceTxType(t);
  if (typeLabel && typeLabel !== '—') return `${typeLabel} · ${method}`;
  return method;
}

/**
 * Título e subtítulo da coluna Descrição.
 * Com planName (descrição customizada): título = descrição, subtítulo = categoria · método.
 * Sem planName: categoria estilizada como título (comportamento legado).
 */
export function getTxDescriptionCell(tx, accounts = null) {
  const catBadge = getTxCategoryBadge(tx, accounts);
  const customDesc =
    String(tx?.planName || '').trim() || String(tx?.note || '').trim();
  const method = formatPaymentMethod(tx?.method, tx?.installments);
  const catLabel = catBadge?.label || '—';

  if (customDesc) {
    return {
      title: customDesc,
      titleClassName: 'finance-tx-desc-cell__title',
      subtitle: [catLabel, method].filter(Boolean).join(' · '),
      categoryBadge: catBadge,
    };
  }

  return {
    title: catLabel,
    titleClassName: catBadge
      ? `finance-tx-desc-cell__title ${catBadge.className}`
      : 'finance-tx-desc-cell__title',
    subtitle: getTxTypeSubtitle(tx),
    categoryBadge: catBadge,
  };
}

/** Descrição curta legível (export, busca, etc.). */
export function txPrimaryDescription(tx, accounts = null) {
  return getTxDescriptionCell(tx, accounts).title;
}
