import { describe, expect, it } from 'vitest';
import { FINANCE_TERM_HINTS } from '../lib/financeTermHints.js';

describe('financeTermHints', () => {
  it('documents repasse vs líquido bancário e previsão bruta', () => {
    expect(FINANCE_TERM_HINTS.cardFeesRepasse).toMatch(/repasse|aluno/i);
    expect(FINANCE_TERM_HINTS.liquidoBancario).toMatch(/conta|operadora/i);
    expect(FINANCE_TERM_HINTS.previsaoBrutoCliente).toMatch(/cliente|operadora/i);
  });

  it('documents fechamento caixa e previsão opcional de MDR', () => {
    expect(FINANCE_TERM_HINTS.brutoCaixa).toMatch(/bruto|espelho/i);
    expect(FINANCE_TERM_HINTS.taxaCaixaMdr).toMatch(/MDR|operadora/i);
    expect(FINANCE_TERM_HINTS.previsaoMdrOpcional).toMatch(/opcional/i);
    expect(FINANCE_TERM_HINTS.previsaoSaldoAcumulado).toMatch(/líquid/i);
  });
});
