/** Monta partida de liquidação a partir de uma transação financeira. */
import {
  FINANCE_CATEGORIES,
  resolveFinanceCategory,
  defaultCategoryForTxType,
} from '../../lib/financeCategories.js';
import { competenceMonthFromIso } from '../../lib/financeCompetence.js';

export const ACCOUNT_MAP = {
  [FINANCE_CATEGORIES.MENSALIDADE.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.MENSALIDADE.dreAccount,
  },
  [FINANCE_CATEGORIES.VENDA_PRODUTO.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.VENDA_PRODUTO.dreAccount,
  },
  [FINANCE_CATEGORIES.MATRICULA.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.MATRICULA.dreAccount,
  },
  [FINANCE_CATEGORIES.OUTROS_RECEITA.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.OUTROS_RECEITA.dreAccount,
  },
  [FINANCE_CATEGORIES.RECEITA_FINANCEIRA.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.RECEITA_FINANCEIRA.dreAccount,
  },
  [FINANCE_CATEGORIES.APORTE_CAPITAL.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.APORTE_CAPITAL.dreAccount,
  },
  [FINANCE_CATEGORIES.EMPRESTIMO_RECEBIDO.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.EMPRESTIMO_RECEBIDO.dreAccount,
  },
  [FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.type]: {
    debit: '1.1.1',
    credit: FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.dreAccount,
  },
  [FINANCE_CATEGORIES.EMPRESTIMO_PAGO.type]: {
    debit: FINANCE_CATEGORIES.EMPRESTIMO_PAGO.dreAccount,
    credit: '1.1.1',
  },
  [FINANCE_CATEGORIES.TRANSFERENCIA_ENVIADA.type]: {
    debit: FINANCE_CATEGORIES.TRANSFERENCIA_ENVIADA.dreAccount,
    credit: '1.1.1',
  },
  [FINANCE_CATEGORIES.CANCELAMENTO.type]: {
    debit: FINANCE_CATEGORIES.CANCELAMENTO.dreAccount,
    credit: '1.1.1',
  },
  stock_purchase: {
    debit: FINANCE_CATEGORIES.CUSTO_ESTOQUE.dreAccount,
    credit: '1.1.1',
  },
  expense_operational: {
    debit: FINANCE_CATEGORIES.OUTRAS_DESPESAS.dreAccount,
    credit: '1.1.1',
  },
  expense_financial: {
    debit: FINANCE_CATEGORIES.TARIFAS_BANCARIAS.dreAccount,
    credit: '1.1.1',
  },
  card_fee: {
    debit: FINANCE_CATEGORIES.TAXA_CARTAO.dreAccount,
    credit: '1.1.1',
  },
  balance_sheet_in: {
    debit: '1.1.1',
    credit: null,
  },
  balance_sheet_out: {
    debit: null,
    credit: '1.1.1',
  },
};

const REVENUE_ROUTES = new Set(['plan', 'product', 'enrollment', 'other', 'financial_revenue']);
const CASH_IN_ROUTES = new Set([
  ...REVENUE_ROUTES,
  'equity_injection',
  'loan_proceeds',
  'internal_transfer',
  'balance_sheet_in',
]);

function txDirectionFromDoc(tx) {
  const dir = String(tx?.direction || '').trim().toLowerCase();
  if (dir === 'out' || dir === 'in') return dir;
  const type = String(tx?.type || '').trim().toLowerCase();
  if (['expense_operational', 'expense_financial', 'card_fee', 'stock_purchase', 'expense', 'loan_repayment', 'balance_sheet_out'].includes(type)) {
    return 'out';
  }
  if (type === FINANCE_CATEGORIES.TRANSFERENCIA_ENVIADA.type) return 'out';
  return 'in';
}

export function resolveLedgerRouteKey(tx, accounts = null) {
  const dir = txDirectionFromDoc(tx);
  const cat = resolveFinanceCategory(tx?.category, accounts, { direction: dir });
  if (cat?.type) return cat.type;
  const type = String(tx?.type || '').trim().toLowerCase();
  if (type === 'expense') {
    return cat?.type === 'expense_financial' ? 'expense_financial' : 'expense_operational';
  }
  if (ACCOUNT_MAP[type]) return type;
  if (type === 'refund') return FINANCE_CATEGORIES.CANCELAMENTO.type;
  if (type === 'stock_purchase') return 'stock_purchase';
  return defaultCategoryForTxType(type) === FINANCE_CATEGORIES.MENSALIDADE.label
    ? 'plan'
    : 'other';
}

function journalDateFromTx(tx) {
  const settled = tx?.settledAt || tx?.settled_at;
  if (settled) {
    const d = new Date(settled);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const cm = String(tx?.competence_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(cm)) return `${cm}-28`;
  return new Date().toISOString().slice(0, 10);
}

function pushPair(lines, accounts, debitCode, creditCode, amount, cashOnDebit = true) {
  const amt = Math.abs(Number(amount) || 0);
  if (amt < 0.01) return;
  const debitId = accounts.find((a) => a.code === debitCode)?.id;
  const creditId = accounts.find((a) => a.code === creditCode)?.id;
  if (!debitId || !creditId) return;
  lines.push({
    accountId: debitId,
    debit: amt,
    credit: 0,
    cash: debitCode === '1.1.1' && cashOnDebit,
    counterCode: creditCode,
  });
  lines.push({
    accountId: creditId,
    debit: 0,
    credit: amt,
    cash: creditCode === '1.1.1' && !cashOnDebit,
    counterCode: debitCode,
  });
}

export function montarLancamento(tx, accounts, academyId) {
  if (!tx || !accounts?.length) return null;

  const gross = Math.abs(Number(tx.gross) || 0);
  const fee = Math.abs(Number(tx.fee) || 0);
  const revenueNet = fee > 0 ? Math.max(0, gross - fee) : gross;
  const dir = txDirectionFromDoc(tx);

  const catRaw = String(tx?.category || '').trim();
  const typeRaw = String(tx?.type || '').trim();
  const catResolved =
    resolveFinanceCategory(catRaw, accounts, { direction: dir }) ||
    resolveFinanceCategory(defaultCategoryForTxType(catRaw), accounts, { direction: dir }) ||
    resolveFinanceCategory(defaultCategoryForTxType(typeRaw), accounts, { direction: dir });

  const lines = [];

  if (catResolved?.isAccountCategory && catResolved.accountCode && gross >= 0.01) {
    const code = catResolved.accountCode;
    if (catResolved.isBalanceSheetCategory) {
      if (dir === 'out') pushPair(lines, accounts, code, '1.1.1', gross, true);
      else pushPair(lines, accounts, '1.1.1', code, gross, true);
    } else if (catResolved.isRevenue) {
      pushPair(lines, accounts, '1.1.1', code, revenueNet);
      if (fee > 0.009) {
        const feeMap = ACCOUNT_MAP.card_fee;
        pushPair(lines, accounts, feeMap.debit, feeMap.credit, fee, true);
      }
    } else {
      pushPair(lines, accounts, code, '1.1.1', gross, true);
    }
  } else {
    const route = resolveLedgerRouteKey(tx, accounts);
    let map = ACCOUNT_MAP[route];
    if (route === 'internal_transfer') {
      map =
        dir === 'out'
          ? {
              debit: FINANCE_CATEGORIES.TRANSFERENCIA_ENVIADA.dreAccount,
              credit: '1.1.1',
            }
          : {
              debit: '1.1.1',
              credit: FINANCE_CATEGORIES.TRANSFERENCIA_RECEBIDA.dreAccount,
            };
    }
    if (route === 'balance_sheet_in' || route === 'balance_sheet_out') {
      const creditCode = catResolved?.dreAccount || catResolved?.accountCode;
      if (route === 'balance_sheet_in' && creditCode) {
        map = { debit: '1.1.1', credit: creditCode };
      } else if (route === 'balance_sheet_out' && creditCode) {
        map = { debit: creditCode, credit: '1.1.1' };
      }
    }
    if (!map || gross < 0.01) return null;

    const debitCode = map.debit || catResolved?.dreAccount;
    const creditCode = map.credit || catResolved?.dreAccount;
    if (!debitCode || !creditCode) return null;

    if (CASH_IN_ROUTES.has(route)) {
      pushPair(lines, accounts, debitCode, creditCode, revenueNet);
      if (fee > 0.009) {
        const feeMap = ACCOUNT_MAP.card_fee;
        pushPair(lines, accounts, feeMap.debit, feeMap.credit, fee, true);
      }
    } else if (route === FINANCE_CATEGORIES.CANCELAMENTO.type) {
      pushPair(lines, accounts, debitCode, creditCode, gross, false);
    } else {
      pushPair(lines, accounts, debitCode, creditCode, gross, route !== 'stock_purchase');
    }
  }

  if (lines.length < 2) return null;

  const txId = String(tx.id || tx.$id || '').trim();
  const label = catResolved?.label || String(tx.planName || '').trim() || defaultCategoryForTxType(typeRaw) || typeRaw || 'transação';
  return {
    date: journalDateFromTx(tx),
    memo: `Liquidação: ${label}${txId ? ` · ${txId}` : ''}`,
    lines,
    academyId,
    financial_tx_id: txId || undefined,
    competence_month: parseCompetenceMonth(tx) || competenceMonthFromIso(tx.settledAt),
  };
}

function parseCompetenceMonth(tx) {
  const s = String(tx?.competence_month || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}
