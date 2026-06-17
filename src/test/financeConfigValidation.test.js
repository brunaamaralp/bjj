import { describe, it, expect } from 'vitest';
import {
  validateFinanceConfigBeforeSave,
  formatFinanceConfigSaveError,
  firstFinanceConfigIssueSection,
} from '../lib/financeConfigValidation.js';
import { FINANCE_SETTINGS_SECTIONS } from '../lib/financeSettingsSections.js';

describe('validateFinanceConfigBeforeSave', () => {
  it('rejeita plano sem nome (titular)', () => {
    const { ok, issues } = validateFinanceConfigBeforeSave({
      isOwner: true,
      financeConfig: {
        plans: [{ name: '', price: 100 }],
        bankAccounts: [{ bankName: 'BB', account: '1' }],
      },
    });
    expect(ok).toBe(false);
    expect(issues[0].sectionId).toBe(FINANCE_SETTINGS_SECTIONS.PLANOS);
  });

  it('ignora validação de planos para não-titular', () => {
    const { ok } = validateFinanceConfigBeforeSave({
      isOwner: false,
      financeConfig: {
        plans: [{ name: '', price: 100 }],
        bankAccounts: [{ bankName: 'BB', account: '1' }],
      },
    });
    expect(ok).toBe(true);
  });

  it('rejeita conta incompleta em recebimento', () => {
    const { ok, issues } = validateFinanceConfigBeforeSave({
      financeConfig: {
        plans: [{ name: 'Mensal', price: 150 }],
        bankAccounts: [{ branch: '1234' }],
      },
    });
    expect(ok).toBe(false);
    expect(issues[0].sectionId).toBe(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
  });

  it('aceita config válida', () => {
    const { ok } = validateFinanceConfigBeforeSave({
      financeConfig: {
        plans: [{ name: 'Mensal', price: 150 }],
        bankAccounts: [{ pixKey: 'a@b.com' }],
      },
    });
    expect(ok).toBe(true);
  });

  it('rejeita fornecedor sem nome (titular)', () => {
    const { ok, issues } = validateFinanceConfigBeforeSave({
      isOwner: true,
      financeConfig: {
        plans: [{ name: 'Mensal', price: 150 }],
        bankAccounts: [{ pixKey: 'a@b.com' }],
        vendors: [{ name: 'CPFL' }, { name: '   ' }],
      },
    });
    expect(ok).toBe(false);
    expect(issues.some((i) => i.sectionId === FINANCE_SETTINGS_SECTIONS.FORNECEDORES)).toBe(true);
    expect(issues.some((i) => i.message.includes('Fornecedor 2'))).toBe(true);
  });

  it('rejeita fornecedor com nome duplicado (titular)', () => {
    const { ok, issues } = validateFinanceConfigBeforeSave({
      isOwner: true,
      financeConfig: {
        plans: [{ name: 'Mensal', price: 150 }],
        bankAccounts: [{ pixKey: 'a@b.com' }],
        vendors: [{ name: 'CPFL' }, { name: 'cpfl' }],
      },
    });
    expect(ok).toBe(false);
    expect(issues[0].sectionId).toBe(FINANCE_SETTINGS_SECTIONS.FORNECEDORES);
    expect(issues[0].message).toContain('duplicado');
  });

  it('ignora validação de fornecedores para não-titular', () => {
    const { ok } = validateFinanceConfigBeforeSave({
      isOwner: false,
      financeConfig: {
        bankAccounts: [{ pixKey: 'a@b.com' }],
        vendors: [{ name: '' }],
      },
    });
    expect(ok).toBe(true);
  });
});

describe('formatFinanceConfigSaveError', () => {
  it('agrupa mensagem por seção', () => {
    const msg = formatFinanceConfigSaveError([
      { sectionId: FINANCE_SETTINGS_SECTIONS.PLANOS, message: 'Plano 1: informe o nome.' },
    ]);
    expect(msg).toContain('Corrija antes de salvar');
    expect(msg).toContain('Planos de mensalidade');
    expect(msg).toContain('informe o nome');
  });

  it('retorna vazio sem issues', () => {
    expect(formatFinanceConfigSaveError([])).toBe('');
  });
});

describe('firstFinanceConfigIssueSection', () => {
  it('retorna primeira seção com problema', () => {
    expect(
      firstFinanceConfigIssueSection([
        { sectionId: FINANCE_SETTINGS_SECTIONS.RECEBIMENTO, message: 'x' },
      ])
    ).toBe(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
  });
});
