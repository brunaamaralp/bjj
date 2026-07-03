/** Reexporta helpers de pagamento (compartilhado com Appwrite Function legada). */
export {
  normalizePaymentForma,
  roundMoney,
  paymentFormLabel,
  normalizePagamentosInput,
  sumPagamentosNet,
  validatePagamentosAgainstTotal,
  validatePagamentosForSettlement,
  salePaidAmountNet,
  saleRemainingAmount,
  mergePagamentosLists,
  buildFormaPagamentoResumo,
  parsePagamentosJson,
} from '../../functions/salePayments.mjs';
