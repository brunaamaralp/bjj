import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

  it('refetches merged finance config when cache has plans but no bank accounts', async () => {
    const cfg = await loadMergedFinanceConfigForAcademy('acad-1');

    expect(mocks.getAcademyDocument).toHaveBeenCalledWith('acad-1', { force: true });
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
});
