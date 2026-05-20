/** Reexporta helpers de pagamento (compartilhado com Appwrite Function legada). */
export {
  normalizePaymentForma,
  roundMoney,
  paymentFormLabel,
  normalizePagamentosInput,
  sumPagamentosNet,
  validatePagamentosAgainstTotal,
  buildFormaPagamentoResumo,
} from '../../functions/salePayments.mjs';
