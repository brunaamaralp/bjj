import { describe, expect, it } from 'vitest';
import {
  isGenericFinanceDescription,
  resolveFinanceTxDescriptionBackfill,
} from '../../../lib/server/financeTxDescriptionBackfill.js';

describe('resolveFinanceTxDescriptionBackfill', () => {
  it('ignora quando planName já existe', () => {
    expect(
      resolveFinanceTxDescriptionBackfill({ planName: 'Salário Hugo', note: 'outra coisa' })
    ).toEqual({
      action: 'skip',
      reason: 'has_planName',
      planName: 'Salário Hugo',
    });
  });

  it('copia note útil para planName', () => {
    expect(
      resolveFinanceTxDescriptionBackfill({
        category: 'Manutenção',
        note: 'Compra de frutas',
      })
    ).toEqual({
      action: 'update',
      planName: 'Compra de frutas',
      source: 'note',
    });
  });

  it('usa template quando note está vazia', () => {
    expect(
      resolveFinanceTxDescriptionBackfill(
        { category: 'Luz / energia', note: '' },
        { templatePlanName: 'CPFL' }
      )
    ).toEqual({
      action: 'update',
      planName: 'CPFL',
      source: 'template',
    });
  });

  it('marca sem fonte quando só há categoria', () => {
    expect(
      resolveFinanceTxDescriptionBackfill({
        category: 'Salários e encargos',
        note: '',
      })
    ).toEqual({ action: 'unresolved', reason: 'no_source' });
  });
});

describe('isGenericFinanceDescription', () => {
  it('trata categoria repetida como genérica', () => {
    expect(isGenericFinanceDescription('Salários e encargos', { category: 'Salários e encargos' })).toBe(
      true
    );
  });
});
