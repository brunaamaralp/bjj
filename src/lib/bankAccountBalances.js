/**
 * Cálculo de saldos por conta bancária (financeConfig + FINANCIAL_TX liquidadas).
 */

import { formatBankAccountLabel, filterBankAccountsWithBank } from './bankAccounts.js';
import { txDirection } from './financeTxDisplay.js';
import { isAccrualLedgerTx } from './financeLedgerRegime.js';

export const UNALLOCATED_BANK_LABEL = 'Não alocado';

export const FINANCE_BANK_NOTE_PREFIX = '@bank:';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function parseYmd(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/**
 * Data de liquidação para classificação (ordem alinhada ao servidor).
 * settledAt → updated_at/updatedAt → createdAt/created_at
 */
export function txSettledYmd(tx) {
  const raw =
    tx?.settledAt ||
    tx?.settled_at ||
    tx?.updated_at ||
    tx?.updatedAt ||
    tx?.createdAt ||
    tx?.created_at ||
    '';
  return parseYmd(raw);
}

/** Doc Appwrite bruto → YMD (mesma ordem que filterSettledDocsAsOf). */
export function financeTxSettledYmdFromAppwriteDoc(doc) {
  return txSettledYmd({
    settledAt: doc?.settledAt || doc?.settled_at,
    updated_at: doc?.$updatedAt || doc?.updated_at,
    updatedAt: doc?.updatedAt,
    createdAt: doc?.$createdAt || doc?.created_at,
    created_at: doc?.$createdAt || doc?.created_at,
  });
}

function previousYmd(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return '';
  const d = new Date(`${parsed}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Valor absoluto em net (base única para entradas e saídas). */
function txMovementAmount(tx) {
  const gross = Math.abs(Number(tx?.gross) || 0);
  const netRaw = Number(tx?.net);
  return Number.isFinite(netRaw) ? Math.abs(netRaw) : gross;
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

function createAccountRow(acc, { asOf, dayBeforePeriod, hasPeriod }) {
  const label = formatBankAccountLabel(acc);
  const configSeed = roundMoney(acc.openingBalance);
  const openingBalance = hasPeriod
    ? openingBalanceApplies(dayBeforePeriod, acc.openingBalanceDate)
      ? configSeed
      : 0
    : openingBalanceApplies(asOf, acc.openingBalanceDate)
      ? configSeed
      : 0;

  return {
    label,
    configSeed,
    openingBalance,
    inflow: 0,
    outflow: 0,
    beforeInflow: 0,
    beforeOutflow: 0,
    periodInflow: 0,
    periodOutflow: 0,
    balance: openingBalance,
    movementCount: 0,
    periodMovementCount: 0,
  };
}

function createUnallocatedBucket() {
  return {
    openingBalance: 0,
    inflow: 0,
    outflow: 0,
    beforeInflow: 0,
    beforeOutflow: 0,
    periodInflow: 0,
    periodOutflow: 0,
    balance: 0,
    count: 0,
    periodMovementCount: 0,
  };
}

function applyMovement(bucket, dir, amount, { inPeriod, beforePeriod }) {
  if (dir === 'out') {
    bucket.outflow += amount;
    if (beforePeriod) bucket.beforeOutflow += amount;
    if (inPeriod) bucket.periodOutflow += amount;
  } else {
    bucket.inflow += amount;
    if (beforePeriod) bucket.beforeInflow += amount;
    if (inPeriod) bucket.periodInflow += amount;
  }
  if (inPeriod) bucket.periodMovementCount += 1;
}

function finalizeAccountRow(row, hasPeriod) {
  if (hasPeriod) {
    const openingPeriodBalance = roundMoney(
      row.openingBalance + row.beforeInflow - row.beforeOutflow
    );
    return {
      ...row,
      openingBalance: openingPeriodBalance,
      inflow: roundMoney(row.inflow),
      outflow: roundMoney(row.outflow),
      periodInflow: roundMoney(row.periodInflow),
      periodOutflow: roundMoney(row.periodOutflow),
      balance: roundMoney(openingPeriodBalance + row.periodInflow - row.periodOutflow),
      movementCount: row.movementCount,
      periodMovementCount: row.periodMovementCount,
    };
  }

  const balance = roundMoney(row.openingBalance + row.inflow - row.outflow);
  return {
    ...row,
    openingBalance: roundMoney(row.openingBalance),
    inflow: roundMoney(row.inflow),
    outflow: roundMoney(row.outflow),
    periodInflow: roundMoney(row.periodInflow),
    periodOutflow: roundMoney(row.periodOutflow),
    balance,
    movementCount: row.movementCount,
    periodMovementCount: row.periodMovementCount,
  };
}

function finalizeUnallocated(unallocated, hasPeriod) {
  if (hasPeriod) {
    const openingPeriodBalance = roundMoney(
      unallocated.beforeInflow - unallocated.beforeOutflow
    );
    return {
      ...unallocated,
      openingBalance: openingPeriodBalance,
      inflow: roundMoney(unallocated.inflow),
      outflow: roundMoney(unallocated.outflow),
      periodInflow: roundMoney(unallocated.periodInflow),
      periodOutflow: roundMoney(unallocated.periodOutflow),
      balance: roundMoney(openingPeriodBalance + unallocated.periodInflow - unallocated.periodOutflow),
      count: unallocated.count,
      periodMovementCount: unallocated.periodMovementCount,
    };
  }

  return {
    ...unallocated,
    openingBalance: 0,
    inflow: roundMoney(unallocated.inflow),
    outflow: roundMoney(unallocated.outflow),
    periodInflow: roundMoney(unallocated.periodInflow),
    periodOutflow: roundMoney(unallocated.periodOutflow),
    balance: roundMoney(unallocated.inflow - unallocated.outflow),
    count: unallocated.count,
    periodMovementCount: unallocated.periodMovementCount,
  };
}

/**
 * @param {object[]} accounts — entradas de financeConfig.bankAccounts (normalizadas)
 * @param {object[]} transactions — FINANCIAL_TX mapeadas
 * @param {string} asOfYmd — YYYY-MM-DD
 * @param {string} [periodFrom] — YYYY-MM-DD (breakdown de entradas/saídas no intervalo)
 * @param {string} [periodTo] — YYYY-MM-DD
 */
export function computeBankAccountBalances({
  accounts = [],
  transactions = [],
  asOfYmd = '',
  periodFrom = '',
  periodTo = '',
}) {
  const asOf = parseYmd(asOfYmd) || new Date().toISOString().slice(0, 10);
  const pFrom = parseYmd(periodFrom);
  const pTo = parseYmd(periodTo);
  const hasPeriod = Boolean(pFrom && pTo);
  const dayBeforePeriod = hasPeriod ? previousYmd(pFrom) : '';

  const registered = filterBankAccountsWithBank(accounts).map((acc) =>
    createAccountRow(acc, { asOf, dayBeforePeriod, hasPeriod })
  );

  const byLabel = new Map(registered.map((row) => [row.label, row]));
  const unallocated = createUnallocatedBucket();

  for (const tx of transactions) {
    const st = String(tx?.status || '').toLowerCase();
    if (st === 'cancelled' || st !== 'settled') continue;
    // Competência (ex.: CMV automático) não movimenta caixa nem "Não alocado"
    if (isAccrualLedgerTx(tx)) continue;

    const settledYmd = txSettledYmd(tx);
    if (settledYmd && settledYmd > asOf) continue;

    const dir = txDirection(tx);
    const amount = txMovementAmount(tx);
    const inPeriod =
      hasPeriod && settledYmd && settledYmd >= pFrom && settledYmd <= pTo;
    const beforePeriod = hasPeriod && settledYmd && settledYmd < pFrom;

    const accountLabel = resolveTxBankAccount(tx);
    const bucket =
      !accountLabel || !byLabel.has(accountLabel)
        ? unallocated
        : byLabel.get(accountLabel);

    applyMovement(bucket, dir, amount, { inPeriod, beforePeriod });
    bucket.movementCount += 1;
    if (bucket === unallocated) {
      unallocated.count += 1;
    }
  }

  const accountRows = registered.map((row) => {
    const finalized = finalizeAccountRow(row, hasPeriod);
    const { configSeed: _c, beforeInflow: _bi, beforeOutflow: _bo, ...publicRow } = finalized;
    return publicRow;
  });

  const unallocFinal = finalizeUnallocated(unallocated, hasPeriod);
  const {
    beforeInflow: _ubi,
    beforeOutflow: _ubo,
    ...publicUnallocated
  } = unallocFinal;

  const totalBalance = roundMoney(
    accountRows.reduce((s, r) => s + r.balance, 0) + publicUnallocated.balance
  );

  return {
    asOf,
    periodFrom: hasPeriod ? pFrom : null,
    periodTo: hasPeriod ? pTo : null,
    accounts: accountRows,
    unallocated: publicUnallocated,
    totalBalance,
  };
}
