import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createSessionJwt: vi.fn(async () => 'jwt-token'),
  authedFetch: vi.fn(),
  addToast: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  notifyPaymentSettlementAfterCreate: vi.fn(),
}));

vi.mock('../lib/appwrite.js', () => ({
  createSessionJwt: apiMocks.createSessionJwt,
}));

vi.mock('../lib/authInterceptor.js', () => ({
  authedFetch: apiMocks.authedFetch,
}));

vi.mock('../store/useUiStore.js', () => ({
  useUiStore: {
    getState: () => ({
      addToast: apiMocks.addToast,
    }),
  },
}));

vi.mock('../lib/studentPayments.js', () => ({
  createPayment: apiMocks.createPayment,
  updatePayment: apiMocks.updatePayment,
}));

vi.mock('../lib/financeTxSettlementDisplay.js', () => ({
  notifyPaymentSettlementAfterCreate: apiMocks.notifyPaymentSettlementAfterCreate,
}));

describe('studentPaymentsApi fallback operacional', () => {
  beforeEach(() => {
    vi.resetModules();
    apiMocks.createSessionJwt.mockClear();
    apiMocks.authedFetch.mockReset();
    apiMocks.addToast.mockClear();
    apiMocks.createPayment.mockReset();
    apiMocks.updatePayment.mockReset();
    apiMocks.notifyPaymentSettlementAfterCreate.mockClear();
  });

  it('restaura os toasts informativos de liquidação no create via HTTP', async () => {
    apiMocks.authedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        payment: {
          $id: 'pay-http',
          lead_id: 'student-1',
          academy_id: 'academy-1',
          status: 'paid',
          reference_month: '2026-06',
        },
      }),
    });

    const { apiCreateStudentPayment } = await import('../lib/studentPaymentsApi.js');
    const toast = { show: vi.fn() };
    const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
    const payload = {
      lead_id: 'student-1',
      academy_id: 'academy-1',
      status: 'paid',
      method: 'pix',
      reference_month: '2026-06',
      paid_at: '2026-06-10T12:00:00.000Z',
    };

    const result = await apiCreateStudentPayment(payload, { financeConfig, toast });

    expect(result).toEqual(
      expect.objectContaining({
        $id: 'pay-http',
        academy_id: 'academy-1',
      })
    );
    expect(apiMocks.notifyPaymentSettlementAfterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ $id: 'pay-http' }),
      payload,
      { financeConfig, toast }
    );
  });

  it('faz fallback local no create quando a rota HTTP está indisponível', async () => {
    apiMocks.authedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiMocks.createPayment.mockResolvedValueOnce({
      $id: 'pay-local',
      lead_id: 'student-1',
      academy_id: 'academy-1',
      status: 'paid',
      reference_month: '2026-06',
    });

    const { apiCreateStudentPayment } = await import('../lib/studentPaymentsApi.js');
    const toast = { show: vi.fn() };
    const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
    const payload = {
      lead_id: 'student-1',
      academy_id: 'academy-1',
      status: 'paid',
      method: 'pix',
      reference_month: '2026-06',
    };

    const result = await apiCreateStudentPayment(payload, { financeConfig, toast });

    expect(apiMocks.createPayment).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        forceLocal: true,
        financeConfig,
        toast,
      })
    );
    expect(result).toEqual(expect.objectContaining({ $id: 'pay-local' }));
  });

  it('faz fallback local no update quando a rota HTTP está indisponível', async () => {
    apiMocks.authedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiMocks.updatePayment.mockResolvedValueOnce({
      $id: 'pay-existing',
      lead_id: 'student-1',
      academy_id: 'academy-1',
      status: 'paid',
      reference_month: '2026-06',
    });

    const { apiUpdateStudentPayment } = await import('../lib/studentPaymentsApi.js');
    const patch = {
      lead_id: 'student-1',
      academy_id: 'academy-1',
      status: 'paid',
      method: 'pix',
      reference_month: '2026-06',
    };

    const result = await apiUpdateStudentPayment('pay-existing', patch, {
      financeConfig: { plans: [{ name: 'Mensal', price: 200 }] },
      toast: { show: vi.fn() },
    });

    expect(apiMocks.updatePayment).toHaveBeenCalledWith(
      'pay-existing',
      patch,
      expect.objectContaining({ forceLocal: true })
    );
    expect(result).toEqual(expect.objectContaining({ $id: 'pay-existing' }));
  });
});
