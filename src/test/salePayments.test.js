import { describe, it, expect } from 'vitest';
import {
  validatePagamentosAgainstTotal,
  buildFormaPagamentoResumo,
  serializePagamentosForApi,
  paymentsUiValid,
  rowTrocoCents,
  netPaidCentsFromRows,
} from '../lib/salePayments.js';

describe('salePayments', () => {
  it('valida soma com troco', () => {
    const pagamentos = [
      { forma: 'cartao_credito', valor: 400 },
      { forma: 'dinheiro', valor: 400, troco: 71, forma_troco: 'pix' },
    ];
    expect(validatePagamentosAgainstTotal(pagamentos, 729).ok).toBe(true);
  });

  it('gera resumo textual', () => {
    const pagamentos = [
      { forma: 'pix', valor: 329 },
      { forma: 'cartao_credito', valor: 400 },
    ];
    expect(buildFormaPagamentoResumo(pagamentos)).toContain('PIX');
    expect(buildFormaPagamentoResumo(pagamentos)).toContain('Cartão');
  });

  it('serializa dinheiro com troco', () => {
    const rows = [
      {
        id: '1',
        forma: 'dinheiro',
        valorCents: 40000,
        recebidoCents: 47100,
        formaTroco: 'pix',
      },
    ];
    expect(rowTrocoCents(rows[0])).toBe(7100);
    const api = serializePagamentosForApi(rows);
    expect(api[0].troco).toBe(71);
    expect(api[0].forma_troco).toBe('pix');
  });

  it('UI bloqueia soma diferente do total', () => {
    const rows = [
      { id: '1', forma: 'pix', valorCents: 10000, recebidoCents: 10000, formaTroco: 'pix' },
    ];
    expect(paymentsUiValid(rows, 20000).ok).toBe(false);
    expect(netPaidCentsFromRows(rows)).toBe(10000);
  });
});
