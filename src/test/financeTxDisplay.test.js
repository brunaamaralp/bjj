import { describe, expect, it } from 'vitest';
import { getTxDescriptionCell } from '../lib/financeTxDisplay.js';

describe('getTxDescriptionCell', () => {
  it('mostra descrição customizada como título com categoria no subtítulo', () => {
    const cell = getTxDescriptionCell({
      planName: 'Salário Hugo',
      category: 'Salários e encargos',
      type: 'expense_operational',
      method: 'pix',
    });
    expect(cell.title).toBe('Salário Hugo');
    expect(cell.subtitle).toContain('Salários e encargos');
    expect(cell.subtitle).toContain('PIX');
    expect(cell.titleClassName).toBe('finance-tx-desc-cell__title');
  });

  it('usa observação como título quando planName está vazio', () => {
    const cell = getTxDescriptionCell({
      note: 'Compra de frutas',
      category: 'Manutenção',
      type: 'expense_operational',
      method: 'pix',
    });
    expect(cell.title).toBe('Compra de frutas');
  });

  it('mantém categoria como título quando não há descrição', () => {
    const cell = getTxDescriptionCell({
      category: 'Manutenção',
      type: 'expense_operational',
      method: 'pix',
    });
    expect(cell.title).toBe('Manutenção');
    expect(cell.titleClassName).toContain('finance-tx-badge');
  });
});
