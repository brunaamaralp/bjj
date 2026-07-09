/** Arredondamento monetário para checkout de vendas (2 casas). */
export function roundSaleMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Calcula desconto geral proporcional sobre o subtotal do carrinho.
 * @param {number} totalCart — subtotal antes do desconto
 * @param {{ tipo?: 'valor'|'percent', cents?: number, pct?: number|string }} opts
 */
export function computeSaleGeneralDiscount(totalCart, { tipo = 'valor', cents = 0, pct = 0 } = {}) {
  const cart = Number(totalCart) || 0;
  if (cart <= 0) {
    return {
      descontoGeralValor: 0,
      fatorGeral: 1,
      totalFinal: 0,
      totalFinalCents: 0,
      discountDisplayValue: 0,
    };
  }

  let descontoGeralValor = 0;
  if (tipo === 'percent') {
    const pctClamped = Math.max(0, Math.min(100, Number(pct) || 0));
    descontoGeralValor = roundSaleMoney((cart * pctClamped) / 100);
  } else {
    descontoGeralValor = Math.min((Number(cents) || 0) / 100, cart);
  }

  const rest = cart - descontoGeralValor;
  const fatorGeral = rest > 0 ? rest / cart : 0;
  const totalFinal = roundSaleMoney(cart * fatorGeral);
  const totalFinalCents = Math.max(0, Math.round(totalFinal * 100));

  return {
    descontoGeralValor,
    fatorGeral,
    totalFinal,
    totalFinalCents,
    discountDisplayValue: roundSaleMoney(cart - totalFinal),
  };
}

/** Aplica fator de desconto geral ao preço unitário de linha (submit da venda). */
export function applySaleGeneralDiscountToUnitPrice(unitPrice, fatorGeral) {
  const factor = Number(fatorGeral);
  if (!Number.isFinite(factor) || factor >= 1) {
    return roundSaleMoney(Number(unitPrice));
  }
  const unit = roundSaleMoney(Number(unitPrice) * factor);
  return unit < 0 ? 0 : unit;
}
