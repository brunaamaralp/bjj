import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindSubscriptionByStoreId = vi.fn();
const mockUpdateSubscriptionByStoreId = vi.fn();
const mockUpdateAsaasSubscription = vi.fn();
const mockCancelAsaasSubscription = vi.fn();
const mockGetAsaasSubscription = vi.fn();
const mockResetAcademyPlanToDefault = vi.fn();

vi.mock('./billingAppwriteStore.js', () => ({
  isBillingStoreConfigured: () => true,
  getBillingDatabases: () => ({}),
  findSubscriptionByStoreId: (...args) => mockFindSubscriptionByStoreId(...args),
  updateSubscriptionByStoreId: (...args) => mockUpdateSubscriptionByStoreId(...args),
}));

vi.mock('./asaasClient.js', () => ({
  updateAsaasSubscription: (...args) => mockUpdateAsaasSubscription(...args),
  cancelAsaasSubscription: (...args) => mockCancelAsaasSubscription(...args),
  getAsaasSubscription: (...args) => mockGetAsaasSubscription(...args),
}));

vi.mock('./resetAcademyPlan.js', () => ({
  resetAcademyPlanToDefault: (...args) => mockResetAcademyPlanToDefault(...args),
}));

const { cancelSubscription, finalizeScheduledCancellation } = await import('./cancelSubscription.js');

// ─── end_of_period ────────────────────────────────────────────────────────────

describe('cancelSubscription end_of_period', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSubscriptionByStoreId.mockResolvedValue({});
    mockUpdateAsaasSubscription.mockResolvedValue({ status: 'INACTIVE' });
    mockResetAcademyPlanToDefault.mockResolvedValue(undefined);
  });

  it('com asaasSubscriptionId chama INACTIVE no Asaas e grava cancelAtPeriodEnd local', async () => {
    mockFindSubscriptionByStoreId.mockResolvedValue({
      storeId: 'store_1',
      status: 'active',
      asaasSubscriptionId: 'sub_asaas_1',
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    });

    const out = await cancelSubscription({ storeId: 'store_1', mode: 'end_of_period' });

    expect(mockUpdateAsaasSubscription).toHaveBeenCalledWith('sub_asaas_1', { status: 'INACTIVE' });
    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_1', {
      cancelAtPeriodEnd: true,
    });
    expect(out).toMatchObject({ canceled: true, mode: 'end_of_period' });
    // end_of_period NÃO reseta o plano agora — só na expiração do período
    expect(mockResetAcademyPlanToDefault).not.toHaveBeenCalled();
  });

  it('sem asaasSubscriptionId (trial) só grava local, sem chamada Asaas', async () => {
    mockFindSubscriptionByStoreId.mockResolvedValue({
      storeId: 'store_trial',
      status: 'trial',
      asaasSubscriptionId: null,
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    });

    await cancelSubscription({ storeId: 'store_trial', mode: 'end_of_period' });

    expect(mockUpdateAsaasSubscription).not.toHaveBeenCalled();
    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_trial', {
      cancelAtPeriodEnd: true,
    });
    expect(mockResetAcademyPlanToDefault).not.toHaveBeenCalled();
  });

  it('falha no Asaas ainda grava cancelAtPeriodEnd local', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFindSubscriptionByStoreId.mockResolvedValue({
      storeId: 'store_2',
      status: 'active',
      asaasSubscriptionId: 'sub_fail',
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    });
    mockUpdateAsaasSubscription.mockRejectedValue(new Error('Asaas indisponível'));

    const out = await cancelSubscription({ storeId: 'store_2', mode: 'end_of_period' });

    expect(mockUpdateAsaasSubscription).toHaveBeenCalledWith('sub_fail', { status: 'INACTIVE' });
    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_2', {
      cancelAtPeriodEnd: true,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(out.canceled).toBe(true);
    warnSpy.mockRestore();
  });
});

// ─── immediate ────────────────────────────────────────────────────────────────

describe('cancelSubscription immediate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSubscriptionByStoreId.mockResolvedValue({});
    mockCancelAsaasSubscription.mockResolvedValue({});
    mockResetAcademyPlanToDefault.mockResolvedValue(undefined);
  });

  it('com asaasSubscriptionId cancela no Asaas, grava status=canceled e reseta plano', async () => {
    mockFindSubscriptionByStoreId.mockResolvedValue({
      storeId: 'store_imm',
      status: 'active',
      asaasSubscriptionId: 'sub_imm_1',
    });

    const out = await cancelSubscription({ storeId: 'store_imm', mode: 'immediate' });

    expect(mockCancelAsaasSubscription).toHaveBeenCalledWith('sub_imm_1');
    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_imm', {
      status: 'canceled',
      asaasSubscriptionId: null,
      cancelAtPeriodEnd: false,
      pendingPlanSlug: null,
    });
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledOnce();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledWith({}, 'store_imm');
    expect(out).toMatchObject({ canceled: true, mode: 'immediate' });
  });

  it('sem asaasSubscriptionId (trial) ainda reseta plano', async () => {
    mockFindSubscriptionByStoreId.mockResolvedValue({
      storeId: 'store_trial_imm',
      status: 'trial',
      asaasSubscriptionId: null,
    });

    await cancelSubscription({ storeId: 'store_trial_imm', mode: 'immediate' });

    expect(mockCancelAsaasSubscription).not.toHaveBeenCalled();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledOnce();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledWith({}, 'store_trial_imm');
  });
});

// ─── finalizeScheduledCancellation ───────────────────────────────────────────

describe('finalizeScheduledCancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSubscriptionByStoreId.mockResolvedValue({});
    mockCancelAsaasSubscription.mockResolvedValue({});
    mockGetAsaasSubscription.mockResolvedValue({ status: 'INACTIVE' });
    mockResetAcademyPlanToDefault.mockResolvedValue(undefined);
  });

  it('período expirado: grava status=inactive e reseta plano da academia', async () => {
    const sub = {
      storeId: 'store_fin',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() - 1000),
      asaasSubscriptionId: 'sub_fin_1',
    };

    const result = await finalizeScheduledCancellation({}, sub);

    expect(result).toBe(true);
    expect(mockUpdateSubscriptionByStoreId).toHaveBeenCalledWith({}, 'store_fin', {
      status: 'inactive',
      asaasSubscriptionId: null,
      cancelAtPeriodEnd: false,
    });
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledOnce();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledWith({}, 'store_fin');
  });

  it('período ainda não expirou: retorna false sem resetar plano', async () => {
    const sub = {
      storeId: 'store_future',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      asaasSubscriptionId: null,
    };

    const result = await finalizeScheduledCancellation({}, sub);

    expect(result).toBe(false);
    expect(mockResetAcademyPlanToDefault).not.toHaveBeenCalled();
  });

  it('sem asaasSubscriptionId ainda reseta plano quando período expirou', async () => {
    const sub = {
      storeId: 'store_noasaas',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() - 1000),
      asaasSubscriptionId: null,
    };

    const result = await finalizeScheduledCancellation({}, sub);

    expect(result).toBe(true);
    expect(mockCancelAsaasSubscription).not.toHaveBeenCalled();
    expect(mockResetAcademyPlanToDefault).toHaveBeenCalledWith({}, 'store_noasaas');
  });
});
