/**
 * Totais por forma de pagamento a partir de documentos sales (Appwrite).
 */
import { parsePagamentosJson } from '../../src/lib/salePayments.js';
import { normalizePaymentForma, roundMoney } from './salePayments.js';

/**
 * @param {object[]} saleDocs — documentos sales (Appwrite)
 * @param {{ statusFilter?: string }} [opts]
 * @returns {Record<string, number>}
 */
export function aggregatePaymentTotalsFromSaleDocs(saleDocs, opts = {}) {
  const statusFilter = String(opts.statusFilter || 'concluida').toLowerCase();
  const totals = {};

  for (const sale of saleDocs || []) {
    const st = String(sale?.status || '').toLowerCase();
    if (st !== statusFilter) continue;

    const list = parsePagamentosJson(sale.pagamentos_json);
    if (list.length) {
      for (const p of list) {
        const forma = normalizePaymentForma(p.forma);
        totals[forma] = roundMoney((totals[forma] || 0) + Number(p.valor || 0));
        if (forma === 'dinheiro' && Number(p.troco) > 0) {
          const trocoForma = normalizePaymentForma(p.forma_troco || 'pix');
          totals[trocoForma] = roundMoney((totals[trocoForma] || 0) - Number(p.troco));
        }
      }
      continue;
    }

    const fp = normalizePaymentForma(sale.forma_pagamento);
    if (fp && fp !== 'a_receber') {
      totals[fp] = roundMoney((totals[fp] || 0) + Number(sale.total || 0));
    }
  }

  return totals;
}
