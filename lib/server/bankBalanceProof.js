/**
 * Prova de saldo: extrato bancário × lançamentos conciliados / órfãos.
 */
import { txDirection } from './financeTxFields.js';
import { resolveTxBankAccount } from '../../src/lib/bankAccountBalances.js';
import { roundMoney } from '../money.js';

function normalizeBank(value) {
  return String(value || '').trim().toLowerCase();
}

function signedItemAmount(item) {
  const amt = roundMoney(item?.amount);
  return String(item?.direction || '').toLowerCase() === 'credit' ? amt : -amt;
}

function signedTxAmount(tx) {
  const dir = txDirection(tx);
  const gross = roundMoney(tx?.gross);
  const net = roundMoney(Math.abs(Number(tx?.net) || gross));
  const amt = dir === 'out' ? gross : net;
  return dir === 'out' ? -amt : amt;
}

function txMatchesBankAccount(tx, bankAccount) {
  const bank = normalizeBank(bankAccount);
  if (!bank) return true;
  const txBank = normalizeBank(tx?.bankAccount || tx?.bank_account || resolveTxBankAccount(tx));
  return !txBank || txBank === bank;
}

/**
 * @param {object} params
 * @param {object} params.statement — { total_credit, total_debit, bank_account? }
 * @param {object[]} params.items — itens do extrato
 * @param {object[]} params.naviUnmatched — TX liquidadas não conciliadas
 */
export function computeBankBalanceProof({ statement = {}, items = [], naviUnmatched = [] }) {
  const statementNet = roundMoney(
    Number(statement.total_credit || 0) - Number(statement.total_debit || 0)
  );
  const bankAccount = String(statement.bank_account || statement.bankAccount || '').trim();

  let reconciledNet = 0;
  let pendingStatementNet = 0;

  for (const item of items || []) {
    const signed = signedItemAmount(item);
    const st = String(item?.status || '').toLowerCase();
    if (st === 'matched') reconciledNet += signed;
    else if (st === 'unmatched') pendingStatementNet += signed;
  }

  let orphanNaviNet = 0;
  for (const tx of naviUnmatched || []) {
    if (!txMatchesBankAccount(tx, bankAccount)) continue;
    orphanNaviNet += signedTxAmount(tx);
  }

  reconciledNet = roundMoney(reconciledNet);
  pendingStatementNet = roundMoney(pendingStatementNet);
  orphanNaviNet = roundMoney(orphanNaviNet);

  const balanceGap = roundMoney(statementNet - reconciledNet - pendingStatementNet);

  return {
    statement_net: statementNet,
    reconciled_net: reconciledNet,
    pending_statement: pendingStatementNet,
    orphan_navi_net: orphanNaviNet,
    balance_gap: balanceGap,
    bank_account: bankAccount,
  };
}
