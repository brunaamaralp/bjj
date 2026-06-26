import { describe, it, expect } from 'vitest';
import {
  validatePagamentosAgainstTotal,
  buildFormaPagamentoResumo,
  formatSalePaymentHistoryLabel,
  serializePagamentosForApi,
  normalizePagamentosInput,
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

  it('mostra parcelas no histórico da venda em cartão de crédito', () => {
    const label = formatSalePaymentHistoryLabel({
      pagamentos_json: JSON.stringify([
        {
          forma: 'cartao_credito',
          valor: 300,
          installments: 3,
        },
      ]),
    });
    expect(label).toContain('3x');
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

  it('serializa cartao de credito com installments e capture_method_id', () => {
    const rows = [
      {
        id: '1',
        forma: 'cartao_credito',
        valorCents: 30000,
        recebidoCents: 30000,
        formaTroco: 'pix',
        installments: 3,
        capture_method_id: 'cap_stone',
      },
    ];
    const api = serializePagamentosForApi(rows);
    expect(api[0]).toMatchObject({
      forma: 'cartao_credito',
      valor: 300,
      installments: 3,
      capture_method_id: 'cap_stone',
    });
  });

  it('normaliza pagamentos preservando installments e capture_method_id', () => {
    const pagamentos = normalizePagamentosInput([
      {
        forma: 'cartao_credito',
        valor: 300,
        installments: 4,
        capture_method_id: 'cap_link',
      },
    ]);
    expect(pagamentos[0]).toMatchObject({
      forma: 'cartao_credito',
      valor: 300,
      installments: 4,
      capture_method_id: 'cap_link',
    });
  });

  it('normaliza pagamentos nao credito com installments igual a 1', () => {
    const pagamentos = normalizePagamentosInput([
      {
        forma: 'pix',
        valor: 120,
        installments: 9,
      },
    ]);
    expect(pagamentos[0]).toMatchObject({
      forma: 'pix',
      valor: 120,
      installments: 1,
    });
  });

  it('UI aceita pagamento vazio quando deferred', () => {
    expect(paymentsUiValid([], 50000, { deferred: true }).ok).toBe(true);
  });

  it('UI bloqueia soma diferente do total', () => {
    const rows = [
      { id: '1', forma: 'pix', valorCents: 10000, recebidoCents: 10000, formaTroco: 'pix' },
    ];
    expect(paymentsUiValid(rows, 20000).ok).toBe(false);
    expect(netPaidCentsFromRows(rows)).toBe(10000);
  });

  it('UI aceita entrada parcial com partial: true', () => {
    const rows = [
      { id: '1', forma: 'pix', valorCents: 5000, recebidoCents: 5000, formaTroco: 'pix' },
    ];
    expect(paymentsUiValid(rows, 10000, { partial: true }).ok).toBe(true);
  });

  it('validatePagamentosAgainstTotal partial rejeita zero', () => {
    expect(validatePagamentosAgainstTotal([], 100, { partial: true }).ok).toBe(false);
  });
});
