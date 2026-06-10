import { createPayment, PAYMENT_CATEGORY } from './studentPayments.js';
import { validateBankAccountForPayment, pickInitialBankAccountForPayment } from './bankAccounts.js';
import { centsToNumber, parseMaskToCents } from './moneyBr.js';
import { findPlanByName, planPriceToPayAmountString } from './academyPlans.js';
import { trocoFieldsForPaymentPayload, validateStudentPaymentTroco } from './studentPaymentTroco.js';

/** Mês de referência (YYYY-MM) a partir da data de matrícula. */
export function referenceMonthFromEnrollmentDate(enrollmentDateYmd) {
  const ymd = String(enrollmentDateYmd || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

/** Formulário inicial de pagamento pós-matrícula. */
export function buildPayFormForEnrollment(lead, financeConfig, enrollmentDateYmd, planName) {
  const refMonth = referenceMonthFromEnrollmentDate(enrollmentDateYmd);
  const plan = findPlanByName(financeConfig, planName);
  const preferredAccount = lead?.preferredPaymentAccount || lead?.preferred_payment_account || '';
  const method = lead?.preferredPaymentMethod || lead?.preferred_payment_method || 'pix';
  return {
    payment_type: PAYMENT_CATEGORY.PLAN,
    reference_month: refMonth,
    bundle_start_month: refMonth,
    bundle_months: 12,
    amount: plan ? planPriceToPayAmountString(plan) : '',
    method,
    account: financeConfig
      ? pickInitialBankAccountForPayment(financeConfig, preferredAccount, method)
      : preferredAccount,
    status: 'paid',
    paid_at: new Date().toISOString().slice(0, 10),
    due_date: '',
    plan_name: String(planName || lead?.plan || '').trim(),
    note: '',
    cash_received: '',
    formaTroco: 'pix',
    trocoAccount: '',
  };
}

/**
 * Registra mensalidade ou pacote após matrícula (espelha no caixa via API).
 * @returns {Promise<object|null>} documento do pagamento ou null se tipo inválido
 */
export async function registerEnrollmentPayment({
  academyId,
  userId,
  teamId,
  studentId,
  payForm,
  financeConfig = null,
  registeredByName = 'Usuário',
}) {
  const aid = String(academyId || '').trim();
  const sid = String(studentId || '').trim();
  if (!aid || !sid || !payForm) throw new Error('Dados incompletos para registrar pagamento.');

  const paymentType = payForm.payment_type || PAYMENT_CATEGORY.PLAN;
  if (paymentType !== PAYMENT_CATEGORY.PLAN && paymentType !== PAYMENT_CATEGORY.BUNDLE) {
    throw new Error('Selecione mensalidade ou plano com cobertura.');
  }

  const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }

  const trocoCheck = validateStudentPaymentTroco(payForm, amountNum, financeConfig);
  if (!trocoCheck.ok) {
    throw new Error(trocoCheck.message);
  }

  const accountCheck = validateBankAccountForPayment(payForm.account, financeConfig);
  if (!accountCheck.ok) {
    throw new Error(accountCheck.message || 'Selecione a conta bancária.');
  }
  const paymentAccount = accountCheck.account || payForm.account || '';

  const paidAtIso =
    (payForm.status === 'paid' || paymentType === PAYMENT_CATEGORY.BUNDLE) && payForm.paid_at
      ? new Date(payForm.paid_at).toISOString()
      : null;

  const data = {
    lead_id: sid,
    academy_id: aid,
    team_id: teamId || '',
    amount: amountNum,
    paid_amount: amountNum,
    method: payForm.method,
    account: paymentAccount,
    plan_name: payForm.plan_name || '',
    status: payForm.status,
    payment_category: paymentType,
    due_date:
      payForm.status === 'pending' && payForm.due_date
        ? new Date(payForm.due_date).toISOString()
        : null,
    paid_at: paidAtIso,
    registered_by: userId || '',
    registered_by_name: registeredByName,
    note: String(payForm.note || '').trim(),
    ...trocoFieldsForPaymentPayload(payForm, amountNum, financeConfig),
  };

  if (paymentType === PAYMENT_CATEGORY.BUNDLE) {
    data.bundle_months = Number(payForm.bundle_months) || 12;
    data.coverage_start_month = payForm.bundle_start_month;
    data.reference_month = payForm.bundle_start_month;
  } else {
    data.reference_month = payForm.reference_month;
  }

  return createPayment(data);
}
