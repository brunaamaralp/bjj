import { describe, expect, it, vi } from 'vitest';
import { getPaymentRowStatus } from '../lib/collectionOverdue.js';

describe('getPaymentRowStatus — trancamento por mês', () => {
  it('payment.status=frozen → frozen independente do cache do aluno', () => {
    const student = {
      freeze_status: '',
      freeze_start: null,
      freeze_end: null,
    };
    const payment = { status: 'frozen', reference_month: '2026-03' };
    const row = getPaymentRowStatus(student, payment, '2026-03');
    expect(row.status).toBe('frozen');
  });

  it('freeze_status active em outro mês → mês avaliado NÃO é frozen (bug corrigido)', () => {
    const student = {
      freeze_status: 'active',
      freeze_start: '2026-04-01T12:00:00.000Z',
      freeze_end: '2026-06-30T12:00:00.000Z',
    };
    const row = getPaymentRowStatus(student, null, '2026-03');
    expect(row.status).not.toBe('frozen');
  });

  it('cache legado sem datas → ainda frozen (regressão)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const student = { freeze_status: 'active' };
    const row = getPaymentRowStatus(student, null, '2026-03');
    expect(row.status).toBe('frozen');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('freeze cache cobrindo o mês avaliado → frozen', () => {
    const student = {
      freeze_status: 'active',
      freeze_start: '2026-03-01T12:00:00.000Z',
      freeze_end: '2026-05-31T12:00:00.000Z',
    };
    const row = getPaymentRowStatus(student, null, '2026-04');
    expect(row.status).toBe('frozen');
  });
});

describe('resolveMensalidadePaymentMethod/Account', () => {
  it('prioriza pagamento e cai na preferencia do aluno', async () => {
    const { resolveMensalidadePaymentMethod, resolveMensalidadePaymentAccount } = await import(
      '../lib/collectionOverdue.js'
    );
    const student = {
      preferredPaymentMethod: 'pix',
      preferredPaymentAccount: 'Conta A',
    };
    expect(resolveMensalidadePaymentMethod(student, { method: 'cartao_credito' })).toBe('cartao_credito');
    expect(resolveMensalidadePaymentAccount(student, { account: 'Stone' })).toBe('Stone');
    expect(resolveMensalidadePaymentMethod(student, null)).toBe('pix');
    expect(resolveMensalidadePaymentAccount(student, null)).toBe('Conta A');
  });
});
