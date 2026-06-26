import { formatBRLFromCents } from './moneyBr.js';
import { netPaidCentsFromRows } from './salePayments.js';

/**
 * Indica se o checkout de venda tem dados que seriam perdidos ao fechar o modal.
 */
export function isSaleCheckoutDirty({
  cart = [],
  alunoId = '',
  clienteNome = '',
  clienteTelefone = '',
  descGeralCents = 0,
  descGeralPct = 0,
  deferredSale = false,
  partialSale = false,
  payments = [],
} = {}) {
  if (cart.length > 0) return true;
  if (String(alunoId).trim()) return true;
  if (String(clienteNome).trim()) return true;
  if (String(clienteTelefone).replace(/\D/g, '')) return true;
  if (Number(descGeralCents) > 0) return true;
  if (Number(descGeralPct) > 0) return true;
  if (deferredSale) return true;
  if (partialSale) return true;
  if (netPaidCentsFromRows(payments) > 0) return true;
  return false;
}

/** Fluxo aluno: carrinho com itens. */
export function isStudentProductSaleDirty(cart = []) {
  return cart.length > 0;
}

function normalizePaymentValid(paymentValid) {
  if (paymentValid && typeof paymentValid === 'object' && 'ok' in paymentValid) {
    return paymentValid;
  }
  return { ok: Boolean(paymentValid) };
}

/**
 * Texto auxiliar no footer quando o botão de concluir está desabilitado.
 * Retorna null quando não há mensagem a exibir.
 */
export function getSaleFooterHint({
  cartLength = 0,
  paymentValid = { ok: true },
  deferredSale = false,
  partialSale = false,
  receiveLater = false,
  busy = false,
  missingPriceLabel = null,
  dueDate = '',
  paymentDiffCents = null,
} = {}) {
  if (busy) return null;
  if (cartLength === 0) return 'Adicione pelo menos um item ao carrinho.';
  if (missingPriceLabel) return `Informe o preço de "${missingPriceLabel}".`;

  const valid = normalizePaymentValid(paymentValid);

  if (deferredSale || receiveLater) {
    if (!String(dueDate || '').trim()) return 'Informe a data de vencimento.';
    return null;
  }

  if (!valid.ok) {
    if (partialSale) {
      if (valid.reason === 'sum_partial_exceeds') {
        return 'O valor recebido agora deve ser menor que o total da venda.';
      }
      return 'Informe um valor recebido agora menor que o total da venda.';
    }
    if (paymentDiffCents != null && paymentDiffCents > 0) {
      return `Faltam ${formatBRLFromCents(paymentDiffCents)} no pagamento.`;
    }
    if (valid.reason === 'capture_method' && valid.message) return valid.message;
    return 'Ajuste os valores de pagamento para cobrir o total.';
  }

  return null;
}
