import { describe, expect, it } from 'vitest';
import {
  validateAccountForm,
  inheritFromParentAccount,
  suggestFieldsForType,
  isDuplicateCode,
  isProtectedCodeForCreate,
  accountHasChildAccounts,
  formatDeleteAccountDescription,
  requiresDreGroup,
} from '../../../src/lib/financeAccountFormRules.js';

describe('financeAccountFormRules', () => {
  const accounts = [
    { id: 'a1', code: '6.2.1', name: 'Despesas Gerais', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais' },
    { id: 'a2', code: '6.2.1.1', name: 'Subdespesa', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais' },
    { id: 'a3', code: '6.2.3', name: 'Marketing', type: 'despesa', nature: 'devedora', dreGrupo: 'Despesas Operacionais' },
  ];

  it('validateAccountForm exige código e nome', () => {
    const { errors } = validateAccountForm({ code: '', name: '' }, accounts);
    expect(errors.code).toBeTruthy();
    expect(errors.name).toBeTruthy();
  });

  it('bloqueia código duplicado', () => {
    const { errors } = validateAccountForm({ code: '6.2.3', name: 'X', type: 'despesa', dreGrupo: 'Despesas Operacionais' }, accounts, { mode: 'create' });
    expect(errors.code).toMatch(/Já existe/);
  });

  it('bloqueia código protegido no create', () => {
    const { errors } = validateAccountForm({ code: '4.1.1', name: 'X', type: 'receita', dreGrupo: 'Receita Bruta' }, accounts, { mode: 'create' });
    expect(errors.code).toMatch(/reservado/);
  });

  it('exige DRE para conta de resultado', () => {
    const { errors } = validateAccountForm({ code: '4.1.2', name: 'Premium', type: 'receita', dreGrupo: '' }, accounts);
    expect(errors.dreGrupo).toBeTruthy();
  });

  it('inheritFromParentAccount copia metadados', () => {
    const inherited = inheritFromParentAccount(accounts[0]);
    expect(inherited.type).toBe('despesa');
    expect(inherited.dreGrupo).toBe('Despesas Operacionais');
  });

  it('suggestFieldsForType receita → credora', () => {
    expect(suggestFieldsForType('receita')).toEqual({ nature: 'credora', dreGrupo: 'Receita Bruta' });
  });

  it('isDuplicateCode ignora excludeId', () => {
    expect(isDuplicateCode('6.2.3', accounts, 'a3')).toBe(false);
  });

  it('isProtectedCodeForCreate 4.1.1', () => {
    expect(isProtectedCodeForCreate('4.1.1')).toBe(true);
  });

  it('accountHasChildAccounts detecta filhos', () => {
    expect(accountHasChildAccounts('6.2.1', accounts)).toBe(true);
    expect(accountHasChildAccounts('9.9.9', accounts)).toBe(false);
  });

  it('formatDeleteAccountDescription menciona uso', () => {
    const msg = formatDeleteAccountDescription(accounts[0], { usageCount: 3 });
    expect(msg).toMatch(/3 lançamento/);
  });

  it('requiresDreGroup só resultado', () => {
    expect(requiresDreGroup('receita')).toBe(true);
    expect(requiresDreGroup('ativo')).toBe(false);
  });
});
