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
} = {}) {
  if (cart.length > 0) return true;
  if (String(alunoId).trim()) return true;
  if (String(clienteNome).trim()) return true;
  if (String(clienteTelefone).replace(/\D/g, '')) return true;
  if (Number(descGeralCents) > 0) return true;
  if (Number(descGeralPct) > 0) return true;
  if (deferredSale) return true;
  return false;
}

/** Fluxo aluno: carrinho com itens ou desconto/receber depois configurado. */
export function isStudentProductSaleDirty(
  cart = [],
  { descGeralCents = 0, descGeralPct = 0, receiveLater = false } = {}
) {
  if (cart.length > 0) return true;
  if (Number(descGeralCents) > 0) return true;
  if (Number(descGeralPct) > 0) return true;
  if (receiveLater) return true;
  return false;
}

/**
 * Texto auxiliar no footer quando o botão de concluir está desabilitado.
 * Retorna null quando não há mensagem a exibir.
 */
export function getSaleFooterHint({
  cartLength = 0,
  paymentValid = true,
  deferredSale = false,
  receiveLater = false,
  dueDateValid = true,
  busy = false,
} = {}) {
  if (busy) return null;
  if (cartLength === 0) return 'Adicione pelo menos um item ao carrinho.';
  if ((deferredSale || receiveLater) && !dueDateValid) {
    return 'Informe a data de vencimento da venda a prazo.';
  }
  if (!deferredSale && !receiveLater && !paymentValid) {
    return 'Ajuste os valores de pagamento para cobrir o total.';
  }
  return null;
}
