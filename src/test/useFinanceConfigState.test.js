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
  useContractTemplates: () => ({ data: { templates: [], configured: false }, isSuccess: true }),
  useEnsureAcademyContractSetup: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  });

  it('recarrega do servidor quando o cache local tem contas mas os planos ainda estao vazios', async () => {
    const { useFinanceConfigState } = await import('../hooks/useFinanceConfigState.js');
    const { result } = renderHook(() => useFinanceConfigState('acad-1', { isOwner: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(financeHookMocks.getAcademyDocument).toHaveBeenCalledWith('acad-1');
    expect(result.current.financeConfig.plans).toEqual([
      expect.objectContaining({ name: 'Mensal', price: 150 }),
    ]);
  });
});
