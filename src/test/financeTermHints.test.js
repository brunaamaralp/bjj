import { describe, expect, it } from 'vitest';
import { FINANCE_TERM_HINTS } from '../lib/financeTermHints.js';

describe('financeTermHints', () => {
  it('documents repasse vs líquido bancário e previsão bruta', () => {
    expect(FINANCE_TERM_HINTS.cardFeesRepasse).toMatch(/repasse|aluno/i);
    expect(FINANCE_TERM_HINTS.liquidoBancario).toMatch(/conta|maquininha/i);
    expect(FINANCE_TERM_HINTS.previsaoBrutoCliente).toMatch(/cliente|maquininha/i);
  });

  it('documents fechamento caixa e previsão opcional sem jargão MDR', () => {
    expect(FINANCE_TERM_HINTS.brutoCaixa).toMatch(/bruto|espelho/i);
    expect(FINANCE_TERM_HINTS.taxaCaixaMaquininha).toMatch(/maquininha/i);
    expect(FINANCE_TERM_HINTS.taxaCaixaMaquininha).not.toMatch(/MDR/i);
    expect(FINANCE_TERM_HINTS.previsaoMdrOpcional).toMatch(/opcional|maquininha/i);
    expect(FINANCE_TERM_HINTS.previsaoMdrOpcional).not.toMatch(/MDR/i);
    expect(FINANCE_TERM_HINTS.previsaoSaldoAcumulado).toMatch(/líquid|maquininha/i);
  });
});
