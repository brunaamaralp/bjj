import { describe, expect, it } from 'vitest';
import { renderCashFlowCascadePdfBuffer } from '../../../lib/receipts/renderCashFlowCascadePdf.js';

describe('renderCashFlowCascadePdfBuffer', () => {
  it('gera buffer PDF não vazio', async () => {
    const buf = await renderCashFlowCascadePdfBuffer({
      month: '2026-06',
      statement: {
        period: { from: '2026-06-01', to: '2026-06-30' },
        cascadeData: {
          receita_servico: 1000,
          receita_produto: 500,
          resultado_operacional: 1200,
          resultado_final: 800,
          variacao_classificada: 800,
          variacao_saldo: 800,
        },
        bankReconciliation: {
          saldoInicial: 0,
          saldoFinal: 800,
          variacaoSaldo: 800,
          gap: 0,
          matches: true,
        },
      },
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
