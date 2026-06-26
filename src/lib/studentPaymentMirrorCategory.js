import { FINANCE_CATEGORIES } from './financeCategories.js';
import { PAYMENT_CATEGORY, normalizePaymentCategory } from './paymentCategories.js';

/** Categoria FINANCIAL_TX ao espelhar pagamento do aluno (fee/other → Outras receitas). */
export function resolveMirrorFinanceCategory(paymentCategory) {
  const cat = normalizePaymentCategory(paymentCategory);
  if (cat === PAYMENT_CATEGORY.FEE || cat === PAYMENT_CATEGORY.OTHER) {
    return FINANCE_CATEGORIES.OUTROS_RECEITA;
  }
  return FINANCE_CATEGORIES.MENSALIDADE;
}

/** Pagamentos paid/partial elegíveis para reconciliação de espelho no Caixa. */
export function isReconcilableMirrorPayment(doc) {
  const cat = normalizePaymentCategory(doc?.payment_category);
  return (
    cat === PAYMENT_CATEGORY.PLAN ||
    cat === PAYMENT_CATEGORY.BUNDLE ||
    cat === PAYMENT_CATEGORY.FEE ||
    cat === PAYMENT_CATEGORY.OTHER
  );
}
