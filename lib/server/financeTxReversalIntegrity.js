/**
 * Guardrails de integridade para estornos FINANCIAL_TX.
 * Funções puras — testáveis sem Appwrite.
 */
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { txDirection } from './financeTxFields.js';

export { cancelLinkedReversalsForTxIds } from './financeTxReverse.js';

const CANCELAMENTO = FINANCE_CATEGORIES.CANCELAMENTO;

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function txStatus(tx) {
  return String(tx?.status || '').toLowerCase();
}

function txType(tx) {
  return String(tx?.type || '').toLowerCase();
}

function originType(tx) {
  return String(tx?.origin_type || tx?.originType || '').toLowerCase();
}

function txId(tx) {
  return String(tx?.$id || tx?.id || '').trim();
}

/** ID da entrada que um estorno reverte (campo canônico + legado origin_id). */
export function getReversesId(tx) {
  const explicit = String(tx?.reverses_id || tx?.reversesId || '').trim();
  if (explicit) return explicit;
  if (originType(tx) === 'reversal') {
    return String(tx?.origin_id || tx?.originId || '').trim();
  }
  return '';
}

export function isReversalTx(tx) {
  if (originType(tx) === 'reversal') return true;
  const type = txType(tx);
  const dir = txDirection(tx);
  return (
    (type === 'refund' || type === CANCELAMENTO.type) &&
    dir === 'out' &&
    Boolean(getReversesId(tx))
  );
}

export function isCancelamentoOutflow(tx) {
  const type = txType(tx);
  const cat = String(tx?.category || '').toLowerCase();
  return (
    txDirection(tx) === 'out' &&
    (type === 'refund' ||
      type === CANCELAMENTO.type ||
      cat.includes('cancelamento'))
  );
}

/**
 * Valida vínculo estorno → entrada original.
 * @returns {string} código de erro ou '' se ok
 */
export function validateReversalLink(reversalDoc, originalById) {
  if (!reversalDoc || !isCancelamentoOutflow(reversalDoc)) return '';
  const reversesId = getReversesId(reversalDoc);
  if (!reversesId) return 'reversal_missing_reverses_id';
  const original = originalById.get(reversesId);
  if (!original) return 'reversal_orphan_original_missing';
  if (txStatus(original) === 'cancelled' && txStatus(reversalDoc) === 'settled') {
    return '';
  }
  if (txStatus(original) !== 'settled' && txStatus(original) !== 'cancelled') {
    return 'reversal_original_not_settled';
  }
  return '';
}

/**
 * Estornos órfãos: saída Cancelamentos sem entrada correspondente (ou entrada ausente do índice).
 */
export function findOrphanReversals(transactions = []) {
  const byId = new Map();
  for (const tx of transactions) {
    const id = txId(tx);
    if (id) byId.set(id, tx);
  }

  const orphans = [];
  for (const tx of transactions) {
    if (!isCancelamentoOutflow(tx)) continue;
    if (txStatus(tx) === 'cancelled') continue;
    const err = validateReversalLink(tx, byId);
    if (err === 'reversal_orphan_original_missing' || err === 'reversal_missing_reverses_id') {
      orphans.push({ tx, reason: err });
    }
  }
  return orphans;
}

/**
 * Pares entrada errada + estorno que se anulam (inflam bruto/cancelamentos na DRE).
 */
export function findInflatedCancelPairs(transactions = []) {
  const byId = new Map();
  for (const tx of transactions) {
    const id = txId(tx);
    if (id) byId.set(id, tx);
  }

  const pairs = [];
  for (const rev of transactions) {
    if (!isCancelamentoOutflow(rev) || txStatus(rev) !== 'settled') continue;
    const origId = getReversesId(rev);
    const orig = origId ? byId.get(origId) : null;
    if (!orig) continue;
    if (txDirection(orig) !== 'in' || txStatus(orig) !== 'settled') continue;
    const revGross = roundMoney(rev.gross);
    const origGross = roundMoney(orig.gross);
    if (Math.abs(revGross - origGross) < 0.01) {
      pairs.push({ entrada: orig, estorno: rev, gross: origGross });
    }
  }
  return pairs;
}

/**
 * Ao cancelar/apagar entrada, IDs de estornos vinculados que também devem ser cancelados.
 */
export function linkedReversalIdsForOriginal(originalId, transactions = []) {
  const id = String(originalId || '').trim();
  if (!id) return [];
  return transactions
    .filter((tx) => {
      if (!isCancelamentoOutflow(tx)) return false;
      if (txStatus(tx) === 'cancelled') return false;
      return getReversesId(tx) === id;
    })
    .map((tx) => txId(tx))
    .filter(Boolean);
}

/**
 * Correção de valor em lançamento liquidado: preferir editar in-place.
 * @returns {{ mode: 'edit'|'reverse_pair', patch?: object }}
 */
export function planValueCorrection({ existingTx, newGross, allowReversePair = false }) {
  const gross = roundMoney(newGross);
  const prevGross = roundMoney(existingTx?.gross);
  if (!existingTx || txStatus(existingTx) !== 'settled') {
    return { mode: 'edit', patch: { gross } };
  }
  if (Math.abs(gross - prevGross) < 0.01) {
    return { mode: 'edit', patch: {} };
  }
  if (!allowReversePair) {
    return {
      mode: 'edit',
      patch: {
        gross,
        net: roundMoney(gross - roundMoney(existingTx.fee)),
      },
    };
  }
  return { mode: 'reverse_pair' };
}

/**
 * Simula estado pós-correção — uma única entrada ativa com valor certo.
 */
export function assertSingleActiveEntrada(transactions, { competenceMonth, leadId, expectedGross }) {
  const active = transactions.filter((tx) => {
    if (txDirection(tx) !== 'in') return false;
    if (txStatus(tx) === 'cancelled') return false;
    if (String(tx.competence_month || '').slice(0, 7) !== competenceMonth) return false;
    if (leadId && String(tx.lead_id || '') !== String(leadId)) return false;
    return true;
  });
  const settled = active.filter((tx) => txStatus(tx) === 'settled');
  const orphans = findOrphanReversals(transactions);
  const pairs = findInflatedCancelPairs(transactions);

  return {
    ok:
      settled.length === 1 &&
      Math.abs(roundMoney(settled[0].gross) - roundMoney(expectedGross)) < 0.01 &&
      orphans.length === 0 &&
      pairs.length === 0,
    settledCount: settled.length,
    orphans,
    pairs,
    settledGross: settled.map((t) => roundMoney(t.gross)),
  };
}

const SETTLED_VALUE_EDIT_ORIGINS = new Set(['student_payment', 'student_payment_troco', 'sale']);

/** Lançamento liquidado espelhado pode ter valor corrigido in-place (sem estorno). */
export function canEditSettledTxValueInPlace(doc) {
  if (String(doc?.status || '').toLowerCase() !== 'settled') return false;
  if (doc?.reconciled === true || String(doc?.bank_statement_id || '').trim()) return false;
  if (String(doc?.origin_type || '').toLowerCase() === 'reversal') return false;
  const origin = String(doc?.origin_type || doc?.originType || '').toLowerCase();
  if (SETTLED_VALUE_EDIT_ORIGINS.has(origin)) return true;
  if (origin === 'manual' && String(doc?.saleId || '').trim()) return true;
  return false;
}

export function buildSaleDeltaRefundPayload({
  academyId,
  vendaId,
  originalTxId,
  refundAmount,
  method = 'pix',
  competenceMonth = '',
  note = '',
  leadId = '',
  settledAt = '',
}) {
  const now = settledAt || new Date().toISOString();
  const origId = String(originalTxId || '').trim();
  const gross = roundMoney(refundAmount);
  return {
    academyId: String(academyId || ''),
    saleId: String(vendaId || ''),
    lead_id: String(leadId || ''),
    method: String(method || 'pix'),
    installments: 1,
    type: FINANCE_CATEGORIES.CANCELAMENTO.type,
    category: FINANCE_CATEGORIES.CANCELAMENTO.label,
    competence_month: competenceMonth || now.slice(0, 7),
    planName: note,
    gross,
    fee: 0,
    net: gross,
    direction: 'out',
    status: 'settled',
    settledAt: now,
    note,
    origin_type: 'reversal',
    origin_id: origId,
    reverses_id: origId,
  };
}

/** Relatório de auditoria (somente leitura) para FINANCIAL_TX. */
export function auditFinanceReversalIntegrity(transactions = []) {
  const orphans = findOrphanReversals(transactions);
  const inflatedPairs = findInflatedCancelPairs(transactions);
  return {
    orphan_count: orphans.length,
    inflated_pair_count: inflatedPairs.length,
    orphans: orphans.map(({ tx, reason }) => ({
      id: tx.$id || tx.id,
      gross: tx.gross,
      status: tx.status,
      note: tx.note || tx.planName || '',
      reason,
      reverses_id: getReversesId(tx),
    })),
    inflated_pairs: inflatedPairs.map(({ entrada, estorno, gross }) => ({
      entrada_id: entrada.$id || entrada.id,
      estorno_id: estorno.$id || estorno.id,
      gross,
      entrada_note: entrada.note || entrada.planName || '',
      estorno_note: estorno.note || estorno.planName || '',
    })),
  };
}
