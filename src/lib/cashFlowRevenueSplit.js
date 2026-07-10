/**
 * Proporção serviço/produto para receitas de caixa agregadas (ex.: liquidação cartão).
 * Base: recebimentos líquidos já classificados explicitamente no período (regime caixa).
 */

import { CASH_FLOW_CLASS, cashFlowClassForTx, isPooledOperationalRevenueTx } from './financeCashFlowMapping.js';
import { txDirection } from './financeTxDisplay.js';
import { displayNet } from './financeTxDisplay.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * @param {object[]} txs — transações do período (já filtradas settled + range)
 * @param {object[]|null} accounts
 * @returns {{ serviceShare: number, productShare: number, serviceBase: number, productBase: number }}
 */
export function computeCashRevenueSplitRatio(txs = [], accounts = null) {
  let serviceBase = 0;
  let productBase = 0;

  for (const tx of txs || []) {
    if (txDirection(tx) !== 'in') continue;
    const cls = cashFlowClassForTx(tx, accounts);
    const net = displayNet(tx);
    if (cls === CASH_FLOW_CLASS.RECEITA_SERVICO) serviceBase += net;
    else if (cls === CASH_FLOW_CLASS.RECEITA_PRODUTO) productBase += net;
  }

  serviceBase = roundMoney(serviceBase);
  productBase = roundMoney(productBase);
  const total = roundMoney(serviceBase + productBase);

  if (total < 0.009) {
    return { serviceShare: 0.5, productShare: 0.5, serviceBase, productBase };
  }

  return {
    serviceShare: serviceBase / total,
    productShare: productBase / total,
    serviceBase,
    productBase,
  };
}

/**
 * Aloca valor líquido de receita pooled entre serviço e produto.
 * @returns {{ service: number, product: number }}
 */
export function allocatePooledRevenue(netAmount, ratio) {
  const net = roundMoney(Math.abs(Number(netAmount) || 0));
  if (net < 0.009) return { service: 0, product: 0 };
  const serviceShare = Number(ratio?.serviceShare ?? 0.5);
  const service = roundMoney(net * serviceShare);
  const product = roundMoney(net - service);
  return { service, product };
}

export function listPooledRevenueTxs(txs = [], accounts = null) {
  return (txs || []).filter((tx) => isPooledOperationalRevenueTx(tx, accounts));
}
