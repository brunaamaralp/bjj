import { buildReceivablesPath, RECEIVABLES_SECTIONS } from './financeiroReceivablesSections.js';

/**
 * Deep link para registrar mensalidade a partir de hint na conciliação.
 * @param {{ lead_id: string, reference_month: string, expected_amount?: number, recon_statement?: string }} hint
 */
export function buildBankReconPaymentHintPath(hint, { reconStatementId } = {}) {
  const extra = {
    pay_student: String(hint.lead_id || '').trim(),
    pay_month: String(hint.reference_month || '').trim().slice(0, 7),
  };
  const amount = Number(hint.expected_amount);
  if (Number.isFinite(amount) && amount > 0) {
    extra.pay_amount = String(amount);
  }
  if (reconStatementId) {
    extra.recon_statement = String(reconStatementId).trim();
  }
  return buildReceivablesPath({
    section: RECEIVABLES_SECTIONS.MENSALIDADES,
    extra,
  });
}

/** Volta à conciliação do extrato em andamento. */
export function buildBankReconReturnPath(statementId) {
  const sid = String(statementId || '').trim();
  if (!sid) return '/financeiro?tab=conciliacao';
  return `/financeiro?tab=conciliacao&statement=${encodeURIComponent(sid)}`;
}
