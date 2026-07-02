/**
 * Regime contábil do lançamento (caixa operacional vs competência/accrual).
 * Distinto de FINANCE_REGIME (eixo de data: settledAt vs competence_month).
 */

export const FINANCE_LEDGER_REGIME = {
  CASH: 'cash',
  ACCRUAL: 'accrual',
};

const VALID = new Set(Object.values(FINANCE_LEDGER_REGIME));

/**
 * @param {string|{ ledger_regime?: string, origin_type?: string }|null|undefined} value
 */
export function normalizeLedgerRegime(value) {
  const raw =
    value && typeof value === 'object'
      ? value.ledger_regime ?? value.ledgerRegime
      : value;
  const s = String(raw || '').trim().toLowerCase();
  if (VALID.has(s)) return s;
  return FINANCE_LEDGER_REGIME.CASH;
}

/** Inferência para documentos legados sem `ledger_regime`. */
export function inferLedgerRegimeFromDoc(doc) {
  const explicit = String(doc?.ledger_regime ?? doc?.ledgerRegime ?? '').trim().toLowerCase();
  if (explicit === FINANCE_LEDGER_REGIME.ACCRUAL) return FINANCE_LEDGER_REGIME.ACCRUAL;
  if (explicit === FINANCE_LEDGER_REGIME.CASH) return FINANCE_LEDGER_REGIME.CASH;

  const origin = String(doc?.origin_type ?? doc?.originType ?? '').toLowerCase();
  if (origin === 'sale_cmv') return FINANCE_LEDGER_REGIME.ACCRUAL;

  // CMV automático legado (antes de origin_type / ledger_regime no schema)
  const method = String(doc?.method || '').trim().toLowerCase();
  const type = String(doc?.type || '').trim().toLowerCase();
  if (method === 'interno' && type === 'stock_purchase') {
    return FINANCE_LEDGER_REGIME.ACCRUAL;
  }

  return FINANCE_LEDGER_REGIME.CASH;
}

export function isAccrualLedgerTx(doc) {
  return inferLedgerRegimeFromDoc(doc) === FINANCE_LEDGER_REGIME.ACCRUAL;
}

export function isCashLedgerTx(doc) {
  return !isAccrualLedgerTx(doc);
}

/** Lançamentos elegíveis para conciliação bancária (só movimento de caixa real). */
export function txEligibleForBankReconciliation(tx) {
  return isCashLedgerTx(tx);
}

/**
 * Classificação para migração/backfill.
 * @returns {'accrual'|'cash'}
 */
export function classifyLedgerRegimeForMigration(doc) {
  return inferLedgerRegimeFromDoc(doc);
}
