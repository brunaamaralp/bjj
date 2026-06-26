import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchMergedFinanceConfigFromApi: vi.fn(),
  getAcademyDocument: vi.fn(),
  setFinanceConfig: vi.fn(),
  leadState: {
    academyId: 'acad-1',
    financeConfigAcademyId: 'acad-1',
    financeConfig: {
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [],
      cardFees: {},
    },
  },
}));

vi.mock('../store/useLeadStore', () => ({
  useLeadStore: {
    getState: () => ({
      ...mocks.leadState,
      setFinanceConfig: mocks.setFinanceConfig,
    }),
  },
}));

vi.mock('../lib/getAcademyDocument.js', () => ({
  getAcademyDocument: mocks.getAcademyDocument,
  fetchMergedFinanceConfigFromApi: mocks.fetchMergedFinanceConfigFromApi,
  invalidateAcademyDocumentCache: vi.fn(),
}));

import { loadMergedFinanceConfigForAcademy } from '../lib/prefetchFinanceConfig.js';

describe('prefetchFinanceConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leadState.academyId = 'acad-1';
    mocks.leadState.financeConfigAcademyId = 'acad-1';
    mocks.leadState.financeConfig = {
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [],
      cardFees: {},
    };
    mocks.fetchMergedFinanceConfigFromApi.mockResolvedValue({
      plans: [{ name: 'Mensal', price: 100 }],
      bankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      cardFees: {},
    });
    mocks.getAcademyDocument.mockResolvedValue({
      financeConfig: JSON.stringify({
        plans: [{ name: 'Mensal', price: 100 }],
        bankAccounts: [],
      }),
      settings: JSON.stringify({
        financeBankAccountsOffloaded: true,
        financeBankAccounts: [{ bankName: 'Sicoob', account: '1' }],
      }),
    });
  });

  it('usa finance-config API e grava contas mescladas na store', async () => {
    const cfg = await loadMergedFinanceConfigForAcademy('acad-1');

    expect(mocks.fetchMergedFinanceConfigFromApi).toHaveBeenCalledWith('acad-1');
    expect(cfg?.bankAccounts).toEqual([
      expect.objectContaining({ bankName: 'Sicoob', account: '1' }),
    ]);
    expect(mocks.setFinanceConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        bankAccounts: [expect.objectContaining({ bankName: 'Sicoob', account: '1' })],
      }),
      'acad-1'
    );
  });

  it('cai no documento mesclado quando finance-config API falha', async () => {
    mocks.fetchMergedFinanceConfigFromApi.mockRejectedValue(new Error('api_down'));

    const cfg = await loadMergedFinanceConfigForAcademy('acad-1');

    expect(mocks.getAcademyDocument).toHaveBeenCalledWith('acad-1', {
      force: true,
      allowClientFallback: false,
    });
    expect(cfg?.bankAccounts).toEqual([
      expect.objectContaining({ bankName: 'Sicoob', account: '1' }),
    ]);
  });
});
