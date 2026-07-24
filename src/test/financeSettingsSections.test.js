import { describe, it, expect } from 'vitest';
import {
  buildFinanceSettingsSummaries,
  buildFinanceSettingsNavItems,
  canAccessEmpresaFinanceSettings,
  collectionRulesConfigured,
  exceptionLabelsCustomized,
  feesConfigured,
  financeSettingsProgress,
  FINANCE_SETTINGS_SECTIONS,
  financeSettingsSectionLabel,
  getFinanceDefaultSection,
  isFinanceSettingsSection,
} from '../lib/financeSettingsSections.js';

describe('financeSettingsSections', () => {
  it('canAccessEmpresaFinanceSettings allows owner and admin only', () => {
    expect(canAccessEmpresaFinanceSettings('owner')).toBe(true);
    expect(canAccessEmpresaFinanceSettings('admin')).toBe(true);
    expect(canAccessEmpresaFinanceSettings('member')).toBe(false);
    expect(canAccessEmpresaFinanceSettings('guest')).toBe(false);
  });

  it('getFinanceDefaultSection uses recebimento for non-owner', () => {
    expect(getFinanceDefaultSection(true)).toBe(FINANCE_SETTINGS_SECTIONS.PLANOS);
    expect(getFinanceDefaultSection(false)).toBe(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
  });

  it('buildFinanceSettingsNavItems hides owner-only sections for admin', () => {
    const adminNav = buildFinanceSettingsNavItems(false);
    const ids = adminNav.map((item) => item.id);
    expect(ids).toContain(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO);
    expect(ids).toContain(FINANCE_SETTINGS_SECTIONS.FORMAS);
    expect(ids).toContain(FINANCE_SETTINGS_SECTIONS.TAXAS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.PLANOS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.REGUA);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.PLANO_CONTAS);
    expect(ids).not.toContain(FINANCE_SETTINGS_SECTIONS.RAZAO);
  });

  it('buildFinanceSettingsNavItems does not list modelos de contrato (aba própria)', () => {
    const ownerNav = buildFinanceSettingsNavItems(true);
    const adminNav = buildFinanceSettingsNavItems(false);
    expect(ownerNav.map((item) => item.id)).not.toContain('contratos');
    expect(adminNav.map((item) => item.id)).not.toContain('contratos');
    expect(isFinanceSettingsSection('contratos')).toBe(null);
  });

  it('financeSettingsProgress for admin counts recebimento and taxas only', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [], bankAccounts: [{ bankName: 'BB' }], cardFees: {} },
      collectionRules: [],
      accountsCount: 0,
      isOwner: false,
    });
    const p = financeSettingsProgress(summaries, { isOwner: false });
    expect(p.total).toBe(2);
    expect(p.done).toBe(1);
  });

  it('feesConfigured is false when all percents are zero', () => {
    expect(feesConfigured({ pix: { percent: 0 }, debito: { percent: 0 }, credito_avista: { percent: 0 } })).toBe(
      false
    );
    expect(feesConfigured({ pix: { percent: 2 } })).toBe(true);
  });

  it('collectionRulesConfigured is false for defaults without persist', () => {
    expect(
      collectionRulesConfigured(
        [{ day: 1, label: '1ª tentativa', defaultMessage: 'x', escalate: false }],
        {}
      )
    ).toBe(false);
    expect(
      collectionRulesConfigured([], { collectionRules: [{ day: 5, label: 'Custom', defaultMessage: '', escalate: false }] })
    ).toBe(true);
  });

  it('buildFinanceSettingsSummaries marks taxas not done when zero', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [], bankAccounts: [], cardFees: { pix: { percent: 0 } } },
      collectionRules: [],
      accountsCount: 0,
      isOwner: true,
    });
    expect(summaries[FINANCE_SETTINGS_SECTIONS.TAXAS].done).toBe(false);
    expect(summaries[FINANCE_SETTINGS_SECTIONS.TAXAS].summary).toContain('Nenhuma taxa');
  });

  it('buildFinanceSettingsSummaries marks taxas done with fee receiver fees', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: {
        plans: [],
        bankAccounts: [],
        cardFees: { pix: { percent: 0 } },
        defaultFeeReceiverId: 'recv_1',
        feeReceivers: [
          {
            id: 'recv_1',
            name: 'PagBank',
            provider: 'pagbank',
            active: true,
            useDefaultFees: false,
            fees: {
              pix: { percent: 0, fixed: 0 },
              debito: { default: { percent: 1.99, fixed: 0 } },
              credito_avista: { default: { percent: 0, fixed: 0 } },
              credito_parcelado: {},
              antecipacao: { percent: 0, fixed: 0 },
            },
          },
        ],
      },
      collectionRules: [],
      accountsCount: 0,
      isOwner: true,
    });
    expect(summaries[FINANCE_SETTINGS_SECTIONS.TAXAS].done).toBe(true);
    expect(summaries[FINANCE_SETTINGS_SECTIONS.TAXAS].summary).toContain('PagBank');
    expect(summaries[FINANCE_SETTINGS_SECTIONS.TAXAS].summary).toContain('Déb.');
  });

  it('exceptionLabelsCustomized detects custom labels', () => {
    expect(exceptionLabelsCustomized({})).toBe(false);
    expect(
      exceptionLabelsCustomized({
        exceptionStatusLabels: { pending: 'Em aberto' },
      })
    ).toBe(true);
  });

  it('isFinanceSettingsSection validates slugs', () => {
    expect(isFinanceSettingsSection('planos')).toBe('planos');
    expect(isFinanceSettingsSection('formas-recebimento')).toBe('formas-recebimento');
    expect(isFinanceSettingsSection('razao-contabil')).toBe('razao-contabil');
    expect(isFinanceSettingsSection('invalid')).toBe(null);
  });

  it('financeSettingsSectionLabel resolves nav label', () => {
    expect(financeSettingsSectionLabel(FINANCE_SETTINGS_SECTIONS.PLANOS)).toBe('Planos de mensalidade');
    expect(financeSettingsSectionLabel(FINANCE_SETTINGS_SECTIONS.RECEBIMENTO)).toBe('Contas bancárias');
    expect(financeSettingsSectionLabel(FINANCE_SETTINGS_SECTIONS.FORMAS)).toBe('Formas de recebimento');
  });

  it('buildFinanceSettingsSummaries marks plans done when named', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: { plans: [{ name: 'Mensal', price: 150 }], bankAccounts: [], cardFees: {} },
      collectionRules: [{ day: 1 }],
      accountsCount: 0,
      isOwner: true,
    });
    expect(summaries[FINANCE_SETTINGS_SECTIONS.PLANOS].done).toBe(true);
    expect(summaries[FINANCE_SETTINGS_SECTIONS.PLANOS].summary).toContain('Mensal');
  });

  it('buildFinanceSettingsSummaries marks fornecedores done when active and named', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: {
        plans: [],
        vendors: [
          { name: 'CPFL', defaultCategory: 'Luz / energia', active: true },
          { name: '', active: true },
        ],
        bankAccounts: [],
        cardFees: {},
      },
      collectionRules: [],
      accountsCount: 0,
      isOwner: true,
    });
    expect(summaries[FINANCE_SETTINGS_SECTIONS.FORNECEDORES].done).toBe(true);
    expect(summaries[FINANCE_SETTINGS_SECTIONS.FORNECEDORES].summary).toContain('CPFL');
    expect(summaries[FINANCE_SETTINGS_SECTIONS.FORNECEDORES].summary).toContain('Luz');
  });

  it('financeSettingsProgress counts core sections', () => {
    const summaries = buildFinanceSettingsSummaries({
      financeConfig: {
        plans: [],
        bankAccounts: [{ bankName: 'BB' }],
        cardFees: { debito: { percent: 1.5 } },
        collectionRules: [{ day: 3, label: 'Custom', defaultMessage: 'oi', escalate: false }],
      },
      collectionRules: [{ day: 3, label: 'Custom', defaultMessage: 'oi', escalate: false }],
      accountsCount: 0,
      isOwner: true,
    });
    const p = financeSettingsProgress(summaries);
    expect(p.total).toBe(4);
    expect(p.done).toBeGreaterThanOrEqual(2);
  });
});
