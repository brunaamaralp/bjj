/**
 * Cálculo de saldos por conta bancária (financeConfig + FINANCIAL_TX liquidadas).
 */

import { formatBankAccountLabel, filterBankAccountsWithBank } from './bankAccounts.js';
import { txDirection } from './financeTxDisplay.js';

export const UNALLOCATED_BANK_LABEL = 'Não alocado';

export const FINANCE_BANK_NOTE_PREFIX = '@bank:';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function parseYmd(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function txSettledYmd(tx) {
  return parseYmd(tx?.settledAt || tx?.settled_at || tx?.createdAt || tx?.created_at);
}

/** Lê conta do lançamento (atributo ou prefixo @bank: na note). */
export function resolveTxBankAccount(tx) {
  const direct = String(tx?.bankAccount || tx?.bank_account || '').trim();
  if (direct) return direct;
  const note = String(tx?.note || '');
  const match = note.match(/^@bank:([^\n]+)/m);
  if (match) return String(match[1] || '').trim();
  return '';
}

export function openingBalanceApplies(asOfYmd, openingBalanceDate) {
  const asOf = parseYmd(asOfYmd);
  const ref = parseYmd(openingBalanceDate);
  if (!ref) return true;
  if (!asOf) return true;
  return ref <= asOf;
}

/**
 * @param {object[]} accounts — entradas de financeConfig.bankAccounts (normalizadas)
 * @param {object[]} transactions — FINANCIAL_TX mapeadas
 * @param {string} asOfYmd — YYYY-MM-DD
 */
export function computeBankAccountBalances({ accounts = [], transactions = [], asOfYmd = '' }) {
  const asOf = parseYmd(asOfYmd) || new Date().toISOString().slice(0, 10);
  const registered = filterBankAccountsWithBank(accounts).map((acc) => {
    const label = formatBankAccountLabel(acc);
    const openingBalance = openingBalanceApplies(asOf, acc.openingBalanceDate)
      ? roundMoney(acc.openingBalance)
      : 0;
    return {
      label,
      openingBalance,
      inflow: 0,
      outflow: 0,
      balance: openingBalance,
      movementCount: 0,
    };
  });

  const byLabel = new Map(registered.map((row) => [row.label, row]));
  const unallocated = { inflow: 0, outflow: 0, balance: 0, count: 0 };

  for (const tx of transactions) {
    const st = String(tx?.status || '').toLowerCase();
    if (st === 'cancelled' || st !== 'settled') continue;
    if (String(tx?.origin_type || tx?.originType || '').toLowerCase() === 'sale_cmv') continue;

    const settledYmd = txSettledYmd(tx);
    if (settledYmd && settledYmd > asOf) continue;

    const dir = txDirection(tx);
    const gross = Math.abs(Number(tx?.gross) || 0);
    const net = Math.abs(Number(tx?.net) || gross);
    const amount = dir === 'out' ? gross : net;

    const accountLabel = resolveTxBankAccount(tx);
    if (!accountLabel || !byLabel.has(accountLabel)) {
      if (dir === 'out') {
        unallocated.outflow += amount;
        unallocated.balance -= amount;
      } else {
        unallocated.inflow += amount;
        unallocated.balance += amount;
      }
      unallocated.count += 1;
      continue;
    }

    const row = byLabel.get(accountLabel);
    if (dir === 'out') {
      row.outflow += amount;
      row.balance -= amount;
    } else {
      row.inflow += amount;
      row.balance += amount;
    }
    row.movementCount += 1;
  }

  const accountRows = registered.map((row) => ({
    ...row,
    inflow: roundMoney(row.inflow),
    outflow: roundMoney(row.outflow),
    balance: roundMoney(row.balance),
  }));

  unallocated.inflow = roundMoney(unallocated.inflow);
  unallocated.outflow = roundMoney(unallocated.outflow);
  unallocated.balance = roundMoney(unallocated.balance);

  const totalBalance = roundMoney(
    accountRows.reduce((s, r) => s + r.balance, 0) + unallocated.balance
  );

  return {
    asOf,
    accounts: accountRows,
    unallocated,
    totalBalance,
  };
}
