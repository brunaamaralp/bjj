import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const financeHookMocks = vi.hoisted(() => {
  const leadState = {
    academyId: 'acad-1',
    financeConfigAcademyId: 'acad-1',
    financeConfig: {
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      plans: [],
      cardFees: {},
    },
    setFinanceConfig: vi.fn(),
  };

  return {
    leadState,
    addToast: vi.fn(),
    getAcademyDocument: vi.fn(),
    mutateEnsureContractSetup: vi.fn(),
  };
});

vi.mock('../store/useLeadStore', () => {
  const useLeadStore = (selector) => selector(financeHookMocks.leadState);
  useLeadStore.getState = () => financeHookMocks.leadState;
  return { useLeadStore };
});

vi.mock('../store/useUiStore', () => ({
  useUiStore: (selector) => selector({ addToast: financeHookMocks.addToast }),
}));

vi.mock('../lib/getAcademyDocument.js', () => ({
  getAcademyDocument: financeHookMocks.getAcademyDocument,
}));

vi.mock('../features/contracts/queries.js', () => ({
  useContractTemplates: () => ({ data: { templates: [{ id: 't1' }], configured: true }, isSuccess: true }),
  useEnsureAcademyContractSetup: () => ({
    mutateAsync: financeHookMocks.mutateEnsureContractSetup,
    isPending: false,
  }),
}));

describe('useFinanceConfigState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeHookMocks.leadState.academyId = 'acad-1';
    financeHookMocks.leadState.financeConfigAcademyId = 'acad-1';
    financeHookMocks.leadState.financeConfig = {
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      plans: [],
      cardFees: {},
    };
    financeHookMocks.getAcademyDocument.mockResolvedValue({
      financeConfig: JSON.stringify({
        bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
        plans: [],
        cardFees: {},
      }),
      settings: JSON.stringify({
        financePlansOffloaded: true,
        financePlans: [{ name: 'Mensal', price: 150 }],
      }),
    });
    financeHookMocks.mutateEnsureContractSetup.mockResolvedValue({
      summary: { financeConfigUpdated: false, templatesCreated: [], plansLinked: 0 },
      financeConfig: { plans: [] },
    });
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('contractSetupEnsured:acad-1');
    }
  });

  it('recarrega do servidor quando o cache local tem contas mas os planos ainda estao vazios', async () => {
    const { useFinanceConfigState } = await import('../hooks/useFinanceConfigState.js');
    const { result } = renderHook(() => useFinanceConfigState('acad-1', { isOwner: true }));

    await waitFor(() => {
      expect(result.current.financeConfig.plans).toEqual([
        expect.objectContaining({ name: 'Mensal', price: 150 }),
      ]);
    });

    expect(financeHookMocks.getAcademyDocument).toHaveBeenCalledWith('acad-1');
  });

  it('nao apaga contas e planos quando ensure-setup retorna financeConfig parcial sem atualizacao', async () => {
    financeHookMocks.leadState.financeConfig = {
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      plans: [{ name: 'Mensal', price: 150 }],
      cardFees: {},
    };
    financeHookMocks.getAcademyDocument.mockResolvedValue({
      financeConfig: JSON.stringify({ bankAccounts: [], plans: [], cardFees: {} }),
      settings: JSON.stringify({
        financePlansOffloaded: true,
        financePlans: [{ name: 'Mensal', price: 150 }],
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      }),
    });

    const { useFinanceConfigState } = await import('../hooks/useFinanceConfigState.js');
    const { result } = renderHook(() => useFinanceConfigState('acad-1', { isOwner: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.financeConfig.plans).toEqual([
      expect.objectContaining({ name: 'Mensal', price: 150 }),
    ]);
    expect(result.current.financeConfig.bankAccounts).toEqual([
      expect.objectContaining({ bankName: 'Sicoob', account: '1' }),
    ]);
  });
});
