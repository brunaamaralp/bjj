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

/** Fluxo aluno: carrinho com itens. */
export function isStudentProductSaleDirty(cart = []) {
  return cart.length > 0;
}
