import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindSubscriptionByAsaasSubscriptionId = vi.fn();
const mockFindSubscriptionByAsaasCustomerId = vi.fn();
const mockUpdateSubscriptionByStoreId = vi.fn();
const mockGetAsaasSubscription = vi.fn();
const mockUpsertSubscriptionPaymentRecord = vi.fn();
const mockApplyPendingPlanIfNeeded = vi.fn();
const mockResetAcademyPlanToDefault = vi.fn();

vi.mock('./billingAppwriteStore.js', () => ({
  isBillingStoreConfigured: () => true,
  getBillingDatabases: () => ({}),
  findSubscriptionByAsaasSubscriptionId: (...args) =>
    mockFindSubscriptionByAsaasSubscriptionId(...args),
  findSubscriptionByAsaasCustomerId: (...args) =>
    mockFindSubscriptionByAsaasCustomerId(...args),
  updateSubscriptionByStoreId: (...args) => mockUpdateSubscriptionByStoreId(...args),
}));

vi.mock('./asaasClient.js', () => ({
  getAsaasSubscription: (...args) => mockGetAsaasSubscription(...args),
}));

vi.mock('./runCheckout.js', () => ({
  upsertSubscriptionPaymentRecord: (...args) => mockUpsertSubscriptionPaymentRecord(...args),
}));

vi.mock('./changePlan.js', () => ({
  applyPendingPlanIfNeeded: (...args) => mockApplyPendingPlanIfNeeded(...args),
}));

vi.mock('../../src/lib/planConfig.js', () => ({
  PLAN_CONFIG: {
    starter: { threads: 300 },
    studio: { threads: 800 },
    pro: { threads: 2000 },
  },
  getPlanByExternalReference: () => null,
  getPlanByAsaasValue: () => null,
  getStoreIdFromExternalReference: () => null,
  getPlanConfig: (slug) => ({ starter: { threads: 300 }, studio: { threads: 800 }, pro: { threads: 2000 } }[slug] ?? { threads: 300 }),
}));

vi.mock('./resetAcademyPlan.js', () => ({
  resetAcademyPlanToDefault: (...args) => mockResetAcademyPlanToDefault(...args),
}));

const { processAsaasWebhookPayload } = await import('./webhookHandlers.js');

describe('handleSubscriptionDeleted via processAsaasWebhookPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSubscriptionByStoreId.mockResolvedValue({});
    mockResetAcademyPlanToDefault.mockResolvedValue(undefined);
  });

  it('marca status=inactive e chama resetAcademyPlanToDefault', async () => {
    mockFindSubscriptionByAsaasSubscriptionId.mockResolvedValue({
      storeId: 'store_del',
      asaasSubscriptionId: 'sub_del_1',
    });

    await processAsaasWebhookPayload({
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_del_1' },
    });

    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_del', {
      status: 'inactive',
      asaasSubscriptionId: null,
      cancelAtPeriodEnd: false,
    });
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledOnce();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledWith({}, 'store_del');
  });

  it('não chama resetAcademyPlanToDefault se assinatura não encontrada localmente', async () => {
    mockFindSubscriptionByAsaasSubscriptionId.mockResolvedValue(null);

    await processAsaasWebhookPayload({
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_inexistente' },
    });

    expect(mockUpdateSubscriptionByStoreId).not.toHaveBeenCalled();
    expect(mockResetAcademyPlanToDefault).not.toHaveBeenCalled();
  });

  it('ignora evento sem subscription id', async () => {
    await processAsaasWebhookPayload({ event: 'SUBSCRIPTION_DELETED', subscription: null });
    expect(mockResetAcademyPlanToDefault).not.toHaveBeenCalled();
  });
});
